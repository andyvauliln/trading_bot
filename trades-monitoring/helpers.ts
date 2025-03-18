import { HoldingRecord, PoolSizeData, TransactionRecord } from '../bots/tracker-bot/types';
import { config } from '../bots/tracker-bot/config';
import axios from 'axios';
import { retryAxiosRequest } from '../bots/utils/help-functions';
import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import { Wallet } from "@project-serum/anchor";
import bs58 from 'bs58';
import { Metaplex } from "@metaplex-foundation/js";
import { DateTime } from 'luxon';
import { selectHistoricalDataByAccount, insertHistoricalData } from './db';
import { 
  WalletToken, 
  TokenPrices, 
  DexscreenerResult,
  DexscreenerPair,
  TokenHistoricalPrices,
  HistoricalPoolData,
  TransactionRecordWithComments,
  BirdeyeHistoricalPriceResponse,
  InsertHistoricalDataDetails
} from './types';

async function getTokenMetadata(connection: Connection, mint: string) {
  try {
    const metaplex = new Metaplex(connection);
    const mintPubkey = new PublicKey(mint);
    
    // Fetch metadata using Metaplex
    const nft = await metaplex.nfts().findByMint({ mintAddress: mintPubkey });
    console.log(`${config.name}|[getTokenMetadata]|Successfully fetched metadata`, 0, nft);
    return {
      name: nft.name.trim().replace(/\0/g, ''),  // Remove null characters and trim
      symbol: nft.symbol.trim().replace(/\0/g, '') // Remove null characters and trim
    };
  } catch (error) {
    console.log(`${config.name}|[getTokenMetadata]|Error fetching metadata for token ${mint}:`, 0, error);
    return { name: mint, symbol: 'UNKNOWN' };
  }
}

export async function getDexscreenerPrices(tokenAddresses: string[]): Promise<DexscreenerResult> {
    try {
      const tokenValues = tokenAddresses.join(",");
      const dexPriceUrl = `https://api.dexscreener.com/tokens/v1/solana/${tokenValues}`;
      console.log(`${config.name}|[getDexscreenerPrices]|Getting prices for tokens:`, 0, tokenValues);

      const response = await retryAxiosRequest(
        () => axios.get<DexscreenerPair[]>(dexPriceUrl, {
          timeout: config.tx.get_timeout,
        }).then(response => response.data),
        10,
        2000,
        0
      );

      // Group pairs by base token address
      const pairsByToken = response.reduce<Record<string, DexscreenerPair[]>>((acc, pair) => {
        const tokenAddress = pair.baseToken.address;
        if (!acc[tokenAddress]) {
          acc[tokenAddress] = [];
        }
        acc[tokenAddress].push(pair);
        return acc;
      }, {});

      const prices: { [address: string]: number | null } = {};
      
      // Process each requested token
      for (const tokenAddress of tokenAddresses) {
        const pairs = pairsByToken[tokenAddress];
        if (!pairs || pairs.length === 0) {
          prices[tokenAddress] = null;
          continue;
        }

        // Prioritize pairs without labels (usually the main pair)
        // If no unlabeled pair exists, take the first one
        const bestPair = pairs.find(p => !p.labels || p.labels.length === 0) || pairs[0];
        prices[tokenAddress] = bestPair ? parseFloat(bestPair.priceUsd) : null;
      }

      console.log(`${config.name}|[getDexscreenerPrices]|Prices:`, 0, prices);
      return { prices, pairs: pairsByToken };
    } catch (error) {
      console.error(`${config.name}|[getDexscreenerPrices]|Error fetching Dexscreener prices:`, 0, error);
      return { 
        prices: Object.fromEntries(tokenAddresses.map(address => [address, null])), 
        pairs: {} 
      };
    }
}

export async function getPoolSizeData(): Promise<PoolSizeData> {
  const wallets = process.env.PRIV_KEY_WALLETS?.split(',');
  if (!wallets || wallets.length === 0) {
    throw new Error('No wallets found in environment variables');
  }

  // Get current total pool value
  let totalPoolUsdValue = 0;
  let previousTotalPoolUsdValue = 0;

  for (const wallet of wallets) {
    // Get current pool size
    const currentPoolSize = await getWalletData(wallet.trim());
    const currentPoolSizeValue = currentPoolSize.reduce((sum, token) => sum + token.tokenValueUSDC, 0);
    totalPoolUsdValue += currentPoolSizeValue;

    // Get previous day's data (start of day)
    const startOfDay = DateTime.now().startOf('day');
    const previousDayStart = startOfDay.minus({ days: 1 });
    const previousDayEnd = startOfDay;

    const previousPoolData = await selectHistoricalDataByAccount(wallet.trim(), previousDayStart, previousDayEnd);
    
    if (previousPoolData && previousPoolData.length > 0) {
      // Get the last record from the previous day
      const lastRecord = previousPoolData.reduce((latest, current) => 
        latest.Time > current.Time ? latest : current
      );
      previousTotalPoolUsdValue += lastRecord.USDPrice * lastRecord.Amount;
    }
  }

  // Calculate percentage change
  const change = previousTotalPoolUsdValue > 0 
    ? ((totalPoolUsdValue - previousTotalPoolUsdValue) / previousTotalPoolUsdValue) * 100 
    : 0;

  // Log values to verify calculation
  console.log(`${config.name}|[getPoolSizeData]|Pool Size Data:`, 0, {
    currentValue: totalPoolUsdValue,
    previousValue: previousTotalPoolUsdValue,
    percentageChange: change,
    isNegative: change < 0
  });

  return {
    value: totalPoolUsdValue,
    change
  };
}

export async function getWalletData(wallet:string): Promise<WalletToken[]> {
    const rpcUrl = process.env.HELIUS_HTTPS_URI || "";
    const myWallet = new Wallet(Keypair.fromSecretKey(bs58.decode(wallet || "")));
    const connection = new Connection(rpcUrl);
    
    // Get SOL balance
    const solBalance = await connection.getBalance(myWallet.publicKey);
    const solBalanceInSOL = solBalance / 1e9; // Convert lamports to SOL
    
    // Get all token accounts
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(myWallet.publicKey, {
      programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'), // Token program ID
    });

    // Extract token data
    const tokens = tokenAccounts.value.map(account => ({
      tokenMint: account.account.data.parsed.info.mint,
      balance: parseFloat(account.account.data.parsed.info.tokenAmount.amount) / Math.pow(10, account.account.data.parsed.info.tokenAmount.decimals),
    })).filter(token => token.balance > 0); // Only include tokens with non-zero balance

    // Add SOL to tokens array
    tokens.push({
      tokenMint: config.liquidity_pool.wsol_pc_mint, // SOL mint address
      balance: solBalanceInSOL,
    });

    // Get all token mints for price fetching
    const tokenMints = tokens.map(token => token.tokenMint);

    // Get prices and metadata from Dexscreener
    const dexscreenerResult = await getDexscreenerPrices(tokenMints);

    // Calculate total portfolio value
    let totalPortfolioValueUSDC = 0;
    const walletData: WalletToken[] = await Promise.all(tokens.map(async token => {
      const tokenPrice = dexscreenerResult.prices[token.tokenMint];
      
      // Get token metadata, prioritizing Dexscreener data
      let metadata;
      if (token.tokenMint === config.liquidity_pool.wsol_pc_mint) {
        metadata = { name: 'Solana', symbol: 'SOL' };
      } else {
        const dexscreenerPair = dexscreenerResult.pairs[token.tokenMint]?.[0];
        if (dexscreenerPair?.baseToken) {
          metadata = {
            name: dexscreenerPair.baseToken.name,
            symbol: dexscreenerPair.baseToken.symbol
          };
        } else {
          // Fallback to on-chain metadata if not available from Dexscreener
          metadata = await getTokenMetadata(connection, token.tokenMint);
        }
      }

      const tokenValueUSDC = token.balance * (tokenPrice || 0);
      totalPortfolioValueUSDC += tokenValueUSDC;

      return {
        tokenName: metadata.name,
        tokenSymbol: metadata.symbol,
        tokenMint: token.tokenMint,
        balance: token.balance,
        tokenValueUSDC,
        percentage: 0, // Will be calculated after total is known
      };
    }));

    // Calculate percentages
    if (totalPortfolioValueUSDC > 0) {
      walletData.forEach(token => {
        token.percentage = (token.tokenValueUSDC / totalPortfolioValueUSDC) * 100;
      });
    }

    // Sort by value, highest first
    return walletData.sort((a, b) => b.tokenValueUSDC - a.tokenValueUSDC);
}

export async function populateWithCurrentProfitsLosses(holdings: HoldingRecord[]) {
    try {
      if (holdings.length === 0) return holdings;
  
      // Get all token ids for price fetching
      const tokenAddresses = holdings.map((holding) => holding.Token);
      const solMint = config.liquidity_pool.wsol_pc_mint;
      
      // Add SOL mint to the token addresses if not already included
      if (!tokenAddresses.includes(solMint)) {
        tokenAddresses.push(solMint);
      }
      
      // Get prices from Dexscreener
      const dexscreenerResult = await getDexscreenerPrices(tokenAddresses);
      
      // Process each holding with current prices
      return holdings.map(holding => {
        try {
          const tokenCurrentPrice = dexscreenerResult.prices[holding.Token];
          const priceSource = "Dexscreener Tokens API";
  
          // If we have a valid price, calculate PnL
          if (tokenCurrentPrice !== null) {
            const unrealizedPnLUSDC = (tokenCurrentPrice - holding.PerTokenPaidUSDC) * holding.Balance - holding.SolFeePaidUSDC;
            const unrealizedPnLPercentage = (unrealizedPnLUSDC / (holding.PerTokenPaidUSDC * holding.Balance)) * 100;
  
            return {
              ...holding,
              currentPrice: tokenCurrentPrice,
              priceSource: priceSource,
              unrealizedPnLUSDC: unrealizedPnLUSDC,
              unrealizedPnLPercentage: unrealizedPnLPercentage,
              hasValidPrice: true,
              priceError: null
            };
          } else {
            console.warn(`${config.name}|[populateWithCurrentProfitsLosses]|can not get price for ${holding.Token}`, tokenCurrentPrice);
            return {
              ...holding,
              currentPrice: null,
              priceSource: "No valid price source",
              unrealizedPnLUSDC: null,
              unrealizedPnLPercentage: null,
              hasValidPrice: false,
              priceError: "Could not fetch current price"
            };
          }
        } catch (error) {
          console.warn(`${config.name}|[populateWithCurrentProfitsLosses]|Error processing holding ${holding.Token}:`, error);
          return {
            ...holding,
            currentPrice: null,
            priceSource: "Error processing",
            unrealizedPnLUSDC: null,
            unrealizedPnLPercentage: null,
            hasValidPrice: false,
            priceError: "Error calculating profits/losses"
          };
        }
      });
    } catch (error) {
      console.warn(`${config.name}|[populateWithCurrentProfitsLosses]|Error fetching current prices:`, 0, {error, holdings});
      // Return holdings with error status
      return holdings.map(holding => ({
        ...holding,
        currentPrice: null,
        priceSource: "Error fetching prices",
        unrealizedPnLUSDC: null,
        unrealizedPnLPercentage: null,
        hasValidPrice: false,
        priceError: "Failed to fetch price data"
      }));
    }
  }

  export async function getJupiterPrices(tokenAddresses: string[]): Promise<TokenPrices> {
    try {
      const priceUrl = process.env.JUP_HTTPS_PRICE_URI || "";
      const tokenValues = tokenAddresses.join(",");
      let retryCount = 0;
      const maxRetries = 5;
      const processRunCounter = 0;
      let priceResponse: any;

      while (retryCount < maxRetries) {
        try {
          priceResponse = await retryAxiosRequest(
            () => axios.get<any>(priceUrl, {
              params: {
                ids: tokenValues,
              },
              timeout: config.tx.get_timeout,
            }),
            5,
            1000,
            processRunCounter
          );
          
          // If we got a valid response with price data, break out of the retry loop
          if (priceResponse && priceResponse.data && priceResponse.data.data && 
              priceResponse.data.data[config.liquidity_pool.wsol_pc_mint]?.price) {
            break;
          } else {
            throw new Error("Invalid price data received");
          }
        } catch (error: any) {
          retryCount++;
          
          // If we haven't exhausted all retries, wait and try again
          if (retryCount < maxRetries) {
            const delay = Math.min(2000 * Math.pow(1.5, retryCount), 15000); // Exponential backoff with max delay of 15 seconds
            await new Promise((resolve) => setTimeout(resolve, delay));
          } else {
            return Object.fromEntries(tokenAddresses.map(address => [address, null]));
          }
        }
      }
      
      const prices: TokenPrices = {};
      for (const tokenAddress of tokenAddresses) {
        prices[tokenAddress] = priceResponse?.data?.data[tokenAddress]?.price || null;
      }

      console.log(`${config.name}|[getJupiterPrices]|Prices:`, 0, prices);
      
      return prices;
    } catch (error) {
      console.warn(`${config.name}|[getJupiterPrices]|Error fetching Jupiter prices:`, 0, error);
      return Object.fromEntries(tokenAddresses.map(address => [address, null]));
    }
  }

async function getBirdeyeHistoricalPrices(
  tokenAddresses: string[],
  timeFrom: number,
  timeTo: number,
  interval: '15m' | '1H' | '4H' | '1D' = '1H'
): Promise<TokenHistoricalPrices> {
  try {
    const apiKey = process.env.BIRDEYE_API_KEY;
    if (!apiKey) {
      throw new Error('BIRDEYE_API_KEY not found in environment variables');
    }

    const options = {
      method: 'GET',
      headers: {
        'accept': 'application/json',
        'x-chain': 'solana',
        'X-API-KEY': apiKey
      }
    };

    // Convert milliseconds to seconds for Birdeye API
    const timeFromSeconds = Math.floor(timeFrom / 1000);
    const timeToSeconds = Math.floor(timeTo / 1000);

    // Fetch historical prices for each token
    const pricePromises = tokenAddresses.map(async (address) => {
      try {
        const url = `https://public-api.birdeye.so/defi/history_price?address=${address}&address_type=token&type=${interval}&time_from=${timeFromSeconds}&time_to=${timeToSeconds}`;
        
        const response = await retryAxiosRequest(
          () => axios.get<BirdeyeHistoricalPriceResponse>(url, {
            headers: options.headers,
            timeout: config.tx.get_timeout
          }),
          5,
          2000,
          0
        );

        if (response?.data?.success && response.data.data.items) {
          return [address, response.data.data.items];
        }
        console.warn(`${config.name}|[getBirdeyeHistoricalPrices]|No price data found for token`, 0, `${address}`);
        return [address, []];
      } catch (error) {
        console.error(`${config.name}|[getBirdeyeHistoricalPrices]|Error fetching historical prices for token`, 0, `${address}:`, error);
        return [address, []];
      }
    });

    const results = await Promise.all(pricePromises);
    return Object.fromEntries(results);
  } catch (error) {
    console.error(`${config.name}|[getBirdeyeHistoricalPrices]|Error fetching Birdeye historical prices:`, 0, error);
    return {};
  }
}

export async function getHistoricalWalletData(days: number = 30): Promise<HistoricalPoolData[]> {
    try {
        // Get the addresses from environment variables
        const addresses = process.env.PRIV_KEY_WALLETS?.split(',');
        if (!addresses || addresses.length === 0) {
            console.warn(`${config.name}|[getHistoricalWalletData]|No wallet addresses found in environment variables`);
            return [];
        }

        // Calculate date range
        const endDate = DateTime.now().startOf('day');
        const startDate = endDate.minus({ days });

        // Create a map to store data for each day
        const dailyData: Map<string, HistoricalPoolData> = new Map();

        // Initialize all days with 0 values
        let currentDate = startDate;
        while (currentDate <= endDate) {
            const dateKey = currentDate.toFormat('yyyy-MM-dd');
            dailyData.set(dateKey, {
                timestamp: currentDate.toMillis(),
                totalValueUSDC: 0,
                tokens: []
            });
            currentDate = currentDate.plus({ days: 1 });
        }

        // Process each wallet address
        for (const address of addresses) {
            // Get historical data from database
            const rawData = await selectHistoricalDataByAccount(address, startDate, endDate);
            
            if (!rawData || rawData.length === 0) {
                console.warn(`${config.name}|[getHistoricalWalletData]|No historical data found for wallet`, 0, `${address}`);
                continue;
            }

            // Process the historical data...
            for (const record of rawData) {
                const recordDate = DateTime.fromMillis(record.Time).startOf('day');
                const dateKey = recordDate.toFormat('yyyy-MM-dd');

                if (recordDate < startDate || recordDate > endDate) continue;

                const existingData = dailyData.get(dateKey);
                if (!existingData) continue;

                const token: WalletToken = {
                    tokenName: record.TokenName,
                    tokenSymbol: record.Symbol,
                    tokenMint: record.Token,
                    balance: record.Amount,
                    tokenValueUSDC: record.USDPrice * record.Amount,
                    percentage: 0
                };

                const existingTokenIndex = existingData.tokens.findIndex(t => t.tokenMint === token.tokenMint);
                if (existingTokenIndex >= 0) {
                    existingData.tokens[existingTokenIndex] = token;
                } else {
                    existingData.tokens.push(token);
                }

                existingData.totalValueUSDC = existingData.tokens.reduce((sum, t) => sum + t.tokenValueUSDC, 0);

                if (existingData.totalValueUSDC > 0) {
                    existingData.tokens.forEach(t => {
                        t.percentage = (t.tokenValueUSDC / existingData.totalValueUSDC) * 100;
                    });
                }

                dailyData.set(dateKey, existingData);
            }
        }

        // Check if we have data for today and create it if missing
        const todayKey = endDate.toFormat('yyyy-MM-dd');
        const todayData = dailyData.get(todayKey);
        if (!todayData || todayData.tokens.length === 0) {
            console.warn(`${config.name}|[getHistoricalWalletData]|No data found for today, creating new records...`);
            try {
                // Create new records for the current time
                const now = DateTime.now();
                const results = await makeAccountHistoricalData(now);
                console.log(`${config.name}|[getHistoricalWalletData]|Created new records for today:`, results);

                // Fetch the newly created records
                const todayRecords = await selectHistoricalDataByAccount(addresses[0], endDate, endDate.plus({ days: 1 }));
                if (todayRecords && todayRecords.length > 0) {
                    const newTodayData: HistoricalPoolData = {
                        timestamp: now.toMillis(),
                        totalValueUSDC: 0,
                        tokens: []
                    };

                    for (const record of todayRecords) {
                        const token: WalletToken = {
                            tokenName: record.TokenName,
                            tokenSymbol: record.Symbol,
                            tokenMint: record.Token,
                            balance: record.Amount,
                            tokenValueUSDC: record.USDPrice * record.Amount,
                            percentage: 0
                        };
                        newTodayData.tokens.push(token);
                    }

                    // Calculate total value and percentages
                    newTodayData.totalValueUSDC = newTodayData.tokens.reduce((sum, t) => sum + t.tokenValueUSDC, 0);
                    if (newTodayData.totalValueUSDC > 0) {
                        newTodayData.tokens.forEach(t => {
                            t.percentage = (t.tokenValueUSDC / newTodayData.totalValueUSDC) * 100;
                        });
                    }

                    dailyData.set(todayKey, newTodayData);
                }
            } catch (error) {
                console.error(`${config.name}|[getHistoricalWalletData]|Error creating today\'s records:`, 0, error);
            }
        }

        // Convert map to sorted array and return
        return Array.from(dailyData.values()).sort((a, b) => a.timestamp - b.timestamp);
    } catch (error) {
        console.error(`${config.name}|[getHistoricalWalletData]|Error fetching historical wallet data:`, 0, error);
        return [];
    }
}

export async function addComments(tradingHistory: TransactionRecord[]): Promise<TransactionRecordWithComments[]> {
  return tradingHistory.map(transaction => ({
    ...transaction,
    comment: "Wow that is the trade of the century, honey "
  }));
}

export async function makeAccountHistoricalData(dateToUse: DateTime): Promise<{ success: string[], errors: string[] }> {
    const results: { success: string[], errors: string[] } = { success: [], errors: [] };
    
    const addresses = process.env.PRIV_KEY_WALLETS?.split(',');
    if (!addresses || addresses.length === 0) {
        throw new Error('No addresses found');
    }
    
    for (const address of addresses) {
        try {
            const tokens = await getWalletData(address);
            
            for (const token of tokens) {
                const insertHistoricalDataDetails: InsertHistoricalDataDetails = {
                    account: address,
                    token: token.tokenMint,
                    symbol: token.tokenSymbol,
                    tokenName: token.tokenName,
                    usdPrice: token.tokenValueUSDC,
                    time: dateToUse,
                    amount: token.balance
                };
                
                const success = await insertHistoricalData(insertHistoricalDataDetails);
                if (success) {
                    results.success.push(`${token.tokenSymbol} (${address})`);
                } else {
                    console.warn(`${config.name}|[makeAccountHistoricalData]|Failed to insert`, 0, `${token.tokenSymbol} (${address})`);
                    results.errors.push(`Failed to insert ${token.tokenSymbol} (${address})`);
                }
            }
        } catch (error) {
            console.error(`${config.name}|[makeAccountHistoricalData]|Error processing wallet`, 0, `${address}:`, error);
            results.errors.push(`Failed to process wallet ${address}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    
    return results;
}