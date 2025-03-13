import { HoldingRecord } from '../bots/tracker-bot/types';
import { config } from '../bots/tracker-bot/config';
import axios from 'axios';
import { retryAxiosRequest } from '../bots/utils/help-functions';
import { Keypair, Connection, PublicKey } from '@solana/web3.js';
import { Wallet } from "@project-serum/anchor";
import bs58 from 'bs58';
import { Metaplex, SOL, token } from "@metaplex-foundation/js";
import { DateTime } from 'luxon';
import { selectHistoricalDataByAccount } from './db';

export interface WalletToken {
  tokenName: string; 
  tokenSymbol: string;
  tokenMint: string;
  balance: number;
  tokenValueUSDC: number;
  percentage: number;
}

async function getTokenMetadata(connection: Connection, mint: string) {
  try {
    const metaplex = new Metaplex(connection);
    const mintPubkey = new PublicKey(mint);
    
    // Fetch metadata using Metaplex
    const nft = await metaplex.nfts().findByMint({ mintAddress: mintPubkey });
    
    return {
      name: nft.name.trim().replace(/\0/g, ''),  // Remove null characters and trim
      symbol: nft.symbol.trim().replace(/\0/g, '') // Remove null characters and trim
    };
  } catch (error) {
    console.error(`Error fetching metadata for token ${mint}:`, error);
    return { name: mint, symbol: 'UNKNOWN' };
  }
}

interface TokenPrices {
  [address: string]: number | null;
}

interface DexscreenerToken {
  address: string;
  name: string;
  symbol: string;
}

interface DexscreenerPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: DexscreenerToken;
  quoteToken: DexscreenerToken;
  priceUsd: string;
  labels?: string[];
}

interface DexscreenerResult {
  prices: { [address: string]: number | null };
  pairs: Record<string, DexscreenerPair[]>;
}

export async function getDexscreenerPrices(tokenAddresses: string[]): Promise<DexscreenerResult> {
    try {
      const tokenValues = tokenAddresses.join(",");
      const dexPriceUrl = `https://api.dexscreener.com/tokens/v1/solana/${tokenValues}`;
      console.log(dexPriceUrl, "dexPriceUrl");

      const response = await retryAxiosRequest(
        () => axios.get<DexscreenerPair[]>(dexPriceUrl, {
          timeout: config.tx.get_timeout,
        }).then(response => response.data),
        5,
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

      console.log(prices, "prices2");
      return { prices, pairs: pairsByToken };
    } catch (error) {
      console.error('Error fetching Dexscreener prices:', error);
      return { 
        prices: Object.fromEntries(tokenAddresses.map(address => [address, null])), 
        pairs: {} 
      };
    }
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
            // Mark holding as having price issues
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
          console.error(`Error processing holding ${holding.Token}:`, error);
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
      console.error('Error fetching current prices:', error);
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
          console.log(priceResponse, "priceResponse");
          
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
        // Use the correct price path that includes the actual price
        console.log(priceResponse.data.data[tokenAddress], "priceResponse[tokenAddress]");
        prices[tokenAddress] = null; //priceResponse?.data?.data[tokenAddress]?.price || null;
      }

      console.log(prices, "prices");
      
      return prices;
    } catch (error) {
      console.error('Error fetching Jupiter prices:', error);
      return Object.fromEntries(tokenAddresses.map(address => [address, null]));
    }
  }

export interface HistoricalPoolData {
  timestamp: number;
  totalValueUSDC: number;
  tokens: WalletToken[];
}

interface BirdeyePriceItem {
  unixTime: number;
  value: number;
}

interface BirdeyeHistoricalPriceResponse {
  success: boolean;
  data: {
    items: BirdeyePriceItem[];
  };
}

interface TokenHistoricalPrices {
  [tokenAddress: string]: BirdeyePriceItem[];
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
        console.warn(`No price data found for token ${address}`);
        return [address, []];
      } catch (error) {
        console.error(`Error fetching historical prices for token ${address}:`, error);
        return [address, []];
      }
    });

    const results = await Promise.all(pricePromises);
    return Object.fromEntries(results);
  } catch (error) {
    console.error('Error fetching Birdeye historical prices:', error);
    return {};
  }
}

async function getTokenMintsAmountsForPeriod(days: number): Promise<{timestamp: number, tokenMints: {tokenMint: string, amount: number}[]}[]> {
    const rpcUrl = process.env.HELIUS_HTTPS_URI || "";
    const myWallet = new Wallet(Keypair.fromSecretKey(bs58.decode(process.env.PRIV_KEY_WALLET_2 || "")));
    const connection = new Connection(rpcUrl);
    
    // First, get current slot and time as reference points
    const currentSlot = await connection.getSlot('finalized');
    const currentTime = await connection.getBlockTime(currentSlot);
    const SLOTS_PER_SECOND = 2.5;
    if (!currentTime) {
        throw new Error('Could not get current block time');
    }
    
    console.log(`Reference point: Current slot ${currentSlot} corresponds to time ${DateTime.fromSeconds(currentTime).toISO()}`);
    const slotsPerDay = 24 * 60 * 60 * SLOTS_PER_SECOND;
    
    const timePoints = Array.from({ length: days }, (_, i) => currentTime - i * 24 * 60 * 60);
   
    
    const results = [];
    const requestInterval = 100; // 100 ms interval for 10 requests per second
    let i = 0;
    for (const timestamp of timePoints) {
        try {
            // Delay to handle 10 requests per second
            
            await new Promise(resolve => setTimeout(resolve, requestInterval));
            
            const targetSlot = currentSlot - i * slotsPerDay;
            const targetTime = await connection.getBlockTime(targetSlot);
            console.log(`Target slot: ${targetSlot}, Target time: ${DateTime.fromSeconds(targetTime || 0).toISO()}`);
            const tokenAccounts = await connection.getTokenAccountsByOwner(
                myWallet.publicKey,
                { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') },
                { commitment: 'finalized', minContextSlot: targetSlot }
            );
            
            console.log(`Found ${tokenAccounts.value.length} token accounts at slot ${targetSlot}`);
            
            // Step 3: Get SOL balance at this historical slot
            const solBalance = await connection.getBalance(
                myWallet.publicKey,
                { commitment: 'finalized', minContextSlot: targetSlot }
            );
            
            console.log(`SOL balance at slot ${targetSlot}: ${solBalance / 1e9} SOL`);
            
            // Step 4: Parse token data to get balances
            const tokenMints = [
                // Include SOL balance
                {
                    tokenMint: config.liquidity_pool.wsol_pc_mint, // WSOL mint address
                    amount: solBalance / 1e9 // Convert lamports to SOL
                }
            ];
            
            // Add other token balances
            for (const account of tokenAccounts.value) {
                // Parse the account data to get token information
                const accountInfo = account.account;
                const data = Buffer.from(accountInfo.data);
                
                // Token account data structure follows the SPL Token program layout
                // We need to parse it manually since we're using getTokenAccountsByOwner instead of getParsedTokenAccountsByOwner
                // The mint address is at bytes 0-32
                const mintAddress = new PublicKey(data.slice(0, 32)).toString();
                console.log(`Mint address: ${mintAddress}`);
                
                // The amount is at bytes 64-72 (8 bytes)
                const amountBuffer = data.slice(64, 72);
                const amount = amountBuffer.readBigUInt64LE(0);
                
                // Only include tokens with non-zero balance
                if (amount > 0n) {
                    // Get token decimals (we'll assume 9 decimals if we can't fetch it)
                    let decimals = 9;
                    try {
                        const mintInfo = await connection.getParsedAccountInfo(new PublicKey(mintAddress));
                        if (mintInfo.value && 'parsed' in mintInfo.value.data) {
                            decimals = mintInfo.value.data.parsed.info.decimals;
                        }
                    } catch (error) {
                        console.warn(`Could not get decimals for token ${mintAddress}, using default 9`);
                    }
                    
                    const tokenAmount = Number(amount) / Math.pow(10, decimals);
                    console.log(`Token ${mintAddress} at slot ${targetSlot}: ${tokenAmount}`);
                    
                    tokenMints.push({
                        tokenMint: mintAddress,
                        amount: tokenAmount
                    });
                }
            }
            
            results.push({
                timestamp,
                timestampTime: new Date(timestamp).toISOString(), // Add timestamp time
                slot: targetSlot,
                slotTime: DateTime.fromSeconds(targetTime || 0).toISO(),
                tokenMints
            });
            i++;
        } catch (error) {
            console.error(`Error fetching historical data for timestamp ${timestamp}:`, error);
            // Return empty data for this timestamp
            results.push({
                timestamp,
                tokenMints: []
            });
        }
    }
    console.log(JSON.stringify(results, null, 2), "results"); // Use JSON.stringify to display token mints data
    return results;
}

export async function getHistoricalWalletData(days: number = 30): Promise<HistoricalPoolData[]> {
    try {
        // Get the addresses from environment variables
        const addresses = process.env.PRIV_KEY_WALLETS?.split(',');
        if (!addresses || addresses.length === 0) {
            console.error('No wallet addresses found in environment variables');
            return [];
        }

        // Calculate date range
        const endDate = DateTime.now();
        const startDate = endDate.minus({ days });

        const historicalData: HistoricalPoolData[] = [];
        
        // Process each wallet address
        for (const address of addresses) {
            // Get historical data from database
            const rawData = await selectHistoricalDataByAccount(address, startDate, endDate);
            
            if (!rawData || rawData.length === 0) {
                console.log(`No historical data found for wallet ${address}`);
                continue;
            }
            
            // Group data by timestamp
            const dataByTimestamp: { [timestamp: number]: any[] } = {};
            
            for (const record of rawData) {
                if (!dataByTimestamp[record.Time]) {
                    dataByTimestamp[record.Time] = [];
                }
                dataByTimestamp[record.Time].push(record);
            }
            
            // Process each timestamp group
            for (const [timestamp, records] of Object.entries(dataByTimestamp)) {
                const timestampNum = parseInt(timestamp);
                
                // Convert records to WalletToken format
                const tokens: WalletToken[] = records.map(record => ({
                    tokenName: record.TokenName,
                    tokenSymbol: record.Symbol,
                    tokenMint: record.Token,
                    balance: record.Amount,
                    tokenValueUSDC: record.USDPrice * record.Amount,
                    percentage: 0 // Will calculate after total is known
                }));
                
                // Calculate total value and percentages
                const totalValueUSDC = tokens.reduce((sum, token) => sum + token.tokenValueUSDC, 0);
                
                if (totalValueUSDC > 0) {
                    tokens.forEach(token => {
                        token.percentage = (token.tokenValueUSDC / totalValueUSDC) * 100;
                    });
                }
                
                // Add to historical data array
                historicalData.push({
                    timestamp: timestampNum,
                    totalValueUSDC,
                    tokens
                });
            }
        }
        
        // Sort by timestamp (oldest first)
        return historicalData.sort((a, b) => a.timestamp - b.timestamp);
    } catch (error) {
        console.error('Error fetching historical wallet data:', error);
        return [];
    }
}

