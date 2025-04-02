import axios from "axios";
import { Connection, Keypair, VersionedTransaction, TransactionResponse, PublicKey } from "@solana/web3.js";
import { Wallet } from "@project-serum/anchor";
import bs58 from "bs58";
import dotenv, { config } from "dotenv";
import {app_config_common} from "../../common/config-app";
import {
  QuoteResponse,
  SerializedQuoteResponse,
  StrategyAction,
  SwapEventDetailsResponse,
  TrackerBotConfig,
  TradeStrategy,
  TransactionDetailsResponseArray,

} from "./types";
import { removeHolding } from "../../db/holding.db";
import { TAGS } from "../../common/utils/log-tags";
import { retryAxiosRequest } from "../../common/utils/help-functions";
import { makeTokenScreenshotAndSendToDiscord } from "../../gmgn_api/make_token_screen-shot";
import { HoldingRecord, CalculatedPNL, TransactionRecord, ProfitLossRecord } from "./types";
import { insertTransaction, insertProfitLoss } from "../../db/holding.db";
import { DateTime } from "luxon";

import { BotConfig } from "../../db/config.db";
// Load environment variables from the .env file
dotenv.config();

export async function createSellTransaction(holding: HoldingRecord, tokenQuotes: QuoteResponse, calculatedPNL: CalculatedPNL, processRunCounter: number, privateKey: string, botConfig: BotConfig, alreadyTryExcludedDexes: boolean = false): Promise<{ success: boolean; msg: string | null; tx: string | null; walletPublicKey: string }> {
  const swapUrl = process.env.JUP_HTTPS_SWAP_URI || "";
  const rpcUrl = process.env.HELIUS_HTTPS_URI || "";
  
  if (!privateKey) {
    console.error(`${botConfig.bot_name}|[createSellTransaction]| ⛔ No private key provided`, processRunCounter);
    return { success: false, msg: "No private key provided", tx: null, walletPublicKey: "" };
  }

  const connection = new Connection(rpcUrl);
  
  try {
    const myWallet = new Wallet(Keypair.fromSecretKey(bs58.decode(privateKey)));
    const walletPublicKey = myWallet.publicKey.toString();
    console.log(`${botConfig.bot_name}|[createSellTransaction]| Creating Sell Transaction for Wallet ${walletPublicKey} with token ${holding.TokenName} and amount ${tokenQuotes.inAmount}`, processRunCounter);

    // Check token balance using RPC connection
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(myWallet.publicKey, {
      mint: new PublicKey(tokenQuotes.inputMint),
    });

    //Check if token exists in wallet with non-zero balance
    const totalBalance = tokenAccounts.value.reduce((sum, account) => {
      const tokenAmount = account.account.data.parsed.info.tokenAmount.amount;
      return sum + BigInt(tokenAmount);
    }, BigInt(0));

    // Skip this wallet if it doesn't have the token balance
    if (totalBalance <= 0n) {
      console.log(`${botConfig.bot_name}|[createSellTransaction]| Wallet ${walletPublicKey} has no balance for token ${tokenQuotes.inputMint}. Balance: ${totalBalance}`, processRunCounter);
      return { success: false, msg: "No token balance", tx: null, walletPublicKey };
    }

    // Get token decimals and convert amounts properly
    const tokenDecimals = tokenAccounts.value[0]?.account.data.parsed.info.tokenAmount.decimals || 9;
    
    // Convert totalBalance to human readable format for comparison
    const totalBalanceHuman = Number(totalBalance) / Math.pow(10, tokenDecimals);
    const holdingBalanceHuman = Number(holding.Balance);

    // Verify amount with tokenBalance using human readable format
    if (totalBalanceHuman < holdingBalanceHuman) {
      console.log(`${botConfig.bot_name}|[createSellTransaction]| Wallet ${walletPublicKey} has insufficient balance (${totalBalanceHuman} tokens) for requested amount (${holdingBalanceHuman} tokens)`, processRunCounter);
      return { success: false, msg: "Insufficient token balance", tx: null, walletPublicKey };
    }

    // Check if wallet has enough SOL to cover fees
    const solBalance = await connection.getBalance(myWallet.publicKey);
    const minRequiredBalance = botConfig.bot_data.prio_fee_max_lamports + 5000 + 1000000; // prio fee + base fee + safety buffer
    
    if (solBalance < minRequiredBalance) {
      console.log(`${botConfig.bot_name}|[createSellTransaction]| Wallet ${walletPublicKey} has insufficient SOL for fees`, processRunCounter);
      return { success: false, msg: "Insufficient SOL for fees", tx: null, walletPublicKey };
    }
    // Serialize the quote into a swap transaction that can be submitted on chain
    console.log(`${botConfig.bot_name}|[createSellTransaction]| Serializing quote into a swap transaction that can be submitted on chain`, processRunCounter);
    const swapTransaction = await retryAxiosRequest(
      () => axios.post<SerializedQuoteResponse>(
        swapUrl,
        JSON.stringify({
          quoteResponse: tokenQuotes,
          userPublicKey: myWallet.publicKey.toString(),
          wrapAndUnwrapSol: true,
          dynamicSlippage: {
            maxBps: 500,
          },
          prioritizationFeeLamports: {
            priorityLevelWithMaxLamports: {
              maxLamports: botConfig.bot_data.prio_fee_max_lamports,
              priorityLevel: botConfig.bot_data.prio_level,
            },
          },
        }),
        {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: botConfig.bot_data.tx.get_timeout,
        }
      ),
      3,
      500,
      processRunCounter
    );

    if (!swapTransaction.data) {
      return { success: false, msg: "No valid swap transaction received", tx: null, walletPublicKey };
    }

    // deserialize the transaction
    console.log(`${config.name}|[createSellTransaction]| Deserializing Swap Transaction`, processRunCounter);
    const swapTransactionBuf = Buffer.from(swapTransaction.data.swapTransaction, "base64");
    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    // sign the transaction
    console.log(`${config.name}|[createSellTransaction]| Signing Swap Transaction`, processRunCounter);
    transaction.sign([myWallet.payer]);

    // Execute the transaction
    const rawTransaction = transaction.serialize();
    console.log(`${config.name}|[createSellTransaction]| Sending Swap Transaction`, processRunCounter);
    const txid = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: true,
      maxRetries: 2,
    });

    if (!txid) {
      return { success: false, msg: "Could not send transaction", tx: null, walletPublicKey };
    }

    // get the latest block hash
    const latestBlockHash = await connection.getLatestBlockhash();
    console.log(`${config.name}|[createSellTransaction]| Latest Block Hash`, processRunCounter, latestBlockHash);

    // Confirm the transaction with retries
    console.log(`${config.name}|[createSellTransaction]| Confirming Transaction with retries`, processRunCounter);
    
    let conf;
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        conf = await connection.confirmTransaction({
          blockhash: latestBlockHash.blockhash,
          lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
          signature: txid,
        });

        if (conf.value.err === null) {
          // Transaction confirmed successfully, break the retry loop
          break;
        }

        // If we get here, there was an error but we might retry
        retryCount++;
        if (retryCount < maxRetries) {
          console.log(`${config.name}|[createSellTransaction]| Retrying confirmation (attempt ${retryCount + 1}/${maxRetries})`, processRunCounter);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
        }
      } catch (error) {
        console.log(`${config.name}|[createSellTransaction]| Error confirming transaction (attempt ${retryCount + 1}/${maxRetries}):`, error);
        retryCount++;
        if (retryCount < maxRetries) {
          console.log(`${config.name}|[createSellTransaction]| Retrying confirmation after error (attempt ${retryCount + 1}/${maxRetries})`, processRunCounter);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before retry
        }
      }
    }

    if (!conf || conf.value.err) {
      makeTokenScreenshotAndSendToDiscord(holding.Token);
      console.log(`${config.name}|[createSellTransaction]| Error confirming transaction after ${maxRetries} retries: https://solscan.io/tx/${txid}\n${JSON.stringify(conf?.value.err, null, 2)}`, processRunCounter);
      if(alreadyTryExcludedDexes) {
        return { success: false, msg: `Transaction not confirmed after ${maxRetries} attempts: ${JSON.stringify(conf?.value.err, null, 2)}`, tx: null, walletPublicKey };
      }
      const quotesWithoutRoutes = await getTokenQuotes(holding, processRunCounter, true, txid);
      if (quotesWithoutRoutes.success && quotesWithoutRoutes.data) {
        const result = await createSellTransaction(holding, quotesWithoutRoutes.data, calculatedPNL, processRunCounter, privateKey, true);
        if (result.success) {
          return result;
        }
      }
      else {
        return { success: false, msg: `Transaction not confirmed after ${maxRetries} attempts: ${JSON.stringify(conf?.value.err, null, 2)}`, tx: null, walletPublicKey };
      }
    }

    console.log(`${config.name}|[createSellTransaction]| '✅' Sell Transaction Confirmed for Token ${holding.TokenName} https://solscan.io/tx/${txid}`, processRunCounter, {txid, holding, conf}, TAGS.sell_tx_confirmed.name);

    // After successful transaction confirmation
    if (conf && conf.value.err === null) {
      console.log(`${config.name}|[createSellTransaction]| Deleting Holding for wallet ${walletPublicKey}`, processRunCounter);
      await removeHolding(holding.Token, processRunCounter, walletPublicKey).catch((err) => {
        console.error(`${config.name}|[createSellTransaction]| ⛔ Database Error: ${err}`, processRunCounter);
      });

      return {
        success: true,
        msg: null,
        tx: txid,
        walletPublicKey
      };
    }

    return {
      success: false,
      msg: "Transaction failed to confirm",
      tx: null,
      walletPublicKey
    };

  } catch (error: any) {
    console.log(`${config.name}|[createSellTransaction]| Error make sell transaction for token ${holding.TokenName} from wallet: ${JSON.stringify({error}, null, 2)}`, processRunCounter);
    return {
      success: false,
      msg: error.message,
      tx: null,
      walletPublicKey: ""
    };
  }
}




interface SellDecision {
  shouldSell: boolean;
  amountToSell: number;
}

function calculateSellDecision(
  strategy: StrategyAction | null,
  currentPrice: number,
  pnlPercent: number,
  balance: number,
  isProfitStrategy: boolean
): SellDecision {
  const defaultResult = { shouldSell: false, amountToSell: 0 };
  
  if (!strategy) return defaultResult;

  const isCorrectPnlDirection = isProfitStrategy ? pnlPercent > 0 : pnlPercent < 0;
  if (!isCorrectPnlDirection) return defaultResult;

  let shouldSell = false;

  if (strategy.threshold_unit === "percent") {
    shouldSell = Math.abs(pnlPercent) > strategy.threshold;
  } else if (strategy.threshold_unit === "price") {
    shouldSell = isProfitStrategy 
      ? currentPrice > strategy.threshold
      : currentPrice < strategy.threshold;
  }

  if (!shouldSell) return defaultResult;

  const amountToSell = strategy.sellAmount_unit === "percent"
    ? (balance * strategy.sellAmount) / 100
    : Math.min(strategy.sellAmount, balance);

  return { shouldSell, amountToSell };
}

export async function calculatePNL(holding: HoldingRecord, tokenQuotes: QuoteResponse, trackerBotConfig: TrackerBotConfig, solanaPrice: number): Promise<CalculatedPNL> {
  const { 
    Balance, 
    SolPaidUSDC, 
    SolFeePaidUSDC, 
    SolFeePaid,
    PerTokenPaidUSDC,
    Token
  } = holding;

  const currentPrice = parseFloat(tokenQuotes.swapUsdValue) / parseFloat(tokenQuotes.outAmount);
  let totalCostUSDC = SolPaidUSDC;
  const currentSOl = trackerBotConfig.include_fees_in_pnl ? parseFloat(tokenQuotes.otherAmountThreshold) * currentPrice : parseFloat(tokenQuotes.outAmount) * currentPrice;
  
  const currentValueUSDCBasedonSolanaPrice = currentSOl * (solanaPrice || 0);

  if (trackerBotConfig.include_fees_in_pnl) {
    totalCostUSDC += SolFeePaidUSDC;
  }
  
  const pnlUSD = currentValueUSDCBasedonSolanaPrice - totalCostUSDC;
  const pnlPercent = totalCostUSDC !== 0 ? (pnlUSD / totalCostUSDC) * 100 : 0;
  const priceDiffUSD = currentPrice - PerTokenPaidUSDC;
  const priceDiffPercent = PerTokenPaidUSDC !== 0 ? ((currentPrice - PerTokenPaidUSDC) / PerTokenPaidUSDC) * 100 : 0;

  let routeFees = 0;
  if (trackerBotConfig.include_fees_in_pnl && tokenQuotes.routePlan) {
    tokenQuotes.routePlan.forEach(route => {
      if (route.swapInfo && route.swapInfo.feeAmount) {
        routeFees += parseFloat(route.swapInfo.feeAmount);
      }
    });
  }

  const {currentStopLossStrategy, currentTakeProfitStrategy} = getCurrentStopLossAndTakeProfit(trackerBotConfig.strategy);
  
  const stopLossDecision = calculateSellDecision(currentStopLossStrategy, currentPrice, pnlPercent, Balance, false);
  const takeProfitDecision = calculateSellDecision(currentTakeProfitStrategy, currentPrice, pnlPercent, Balance, true);

  return {
    tokenName: holding.TokenName,
    tokenAddress: Token,
    tokenBalance: Balance,
    initialPriceUSDC: PerTokenPaidUSDC,
    currentPriceUSDC: currentPrice,
    priceDiffUSD,
    priceDiffPercentUSDC: priceDiffPercent,
    isIncludeFee: trackerBotConfig.include_fees_in_pnl,
    totalInvestmentUSDC: totalCostUSDC,
    currentValueUSDC: currentValueUSDCBasedonSolanaPrice,
    pnlUSD,
    pnlPercent,
    solanaPrice: solanaPrice,
    priceImpact: tokenQuotes.priceImpactPct ? parseFloat(tokenQuotes.priceImpactPct.toString()) : 0,
    slippageBps: tokenQuotes.slippageBps,
    slippagePercent: Number(tokenQuotes.slippageBps) ? Number(tokenQuotes.slippageBps)/100 : 0,
    fees: {
      entryFeeUSDC: SolFeePaidUSDC,
      entryFeeSOL: SolFeePaid,
      exitFeeUSDC: (parseFloat(tokenQuotes.otherAmountThreshold) - parseFloat(tokenQuotes.outAmount)) * (solanaPrice || 0),
      exitFeeSOL: (parseFloat(tokenQuotes.otherAmountThreshold) - parseFloat(tokenQuotes.outAmount)),
      routeFeesSOL: routeFees,
      platformFeeSOL: tokenQuotes.platformFee ? parseFloat(tokenQuotes.platformFee.amount || "0") : 0,
    },
    currentStopLossStrategy,
    currentTakeProfitStrategy,
    botStrategy: trackerBotConfig.strategy,
    shouldStopLoss: stopLossDecision.shouldSell,
    shouldTakeProfit: takeProfitDecision.shouldSell,
    amountToSell: stopLossDecision.shouldSell ? stopLossDecision.amountToSell : takeProfitDecision.amountToSell,
  };
}

function getCurrentStopLossAndTakeProfit(strategy: TradeStrategy): { currentStopLossStrategy: StrategyAction, currentTakeProfitStrategy: StrategyAction } {

  // Get non-executed stop loss strategies sorted by order
  const stopLossStrategies = strategy.stop_loss
    .filter(action => !action.executed)
    .sort((a, b) => a.order - b.order);

  // Get non-executed take profit strategies sorted by order
  const takeProfitStrategies = strategy.take_profit
    .filter(action => action.type === 'take_profit' && !action.executed)
    .sort((a, b) => a.order - b.order);

  return {
    currentStopLossStrategy: stopLossStrategies[0] || null,
    currentTakeProfitStrategy: takeProfitStrategies[0] || null
  };
}



export async function fetchAndSaveSwapDetails(tx: string, holding: HoldingRecord, calculatedPNL: CalculatedPNL, walletPublicKey: string, processRunCounter: number): Promise<boolean> {
  try {
    await removeHolding(holding.Token, processRunCounter, walletPublicKey).catch((err) => {
      console.error(`${config.name}|[fetchAndSaveSwapDetails]| ⛔ Database Error: ${err}`, processRunCounter);
    });
    // Safely access the event information
    const swapTransactionData = await getTransactionDetails(tx, processRunCounter);
    if (!swapTransactionData) {
      return false;
    }
    const solanaPrice = await getSolanaPrice(processRunCounter);
    if (!solanaPrice) {
      console.warn(`${config.name}|[fetchAndSaveSwapDetails]| ⛔ Could not fetch latest Sol Price: No valid data received from API after 5 attempts.`, processRunCounter);
      return false;
    }
    await makeInsertTransaction(holding, calculatedPNL, swapTransactionData, walletPublicKey, tx, processRunCounter);
    await makeInsertProfitLoss(holding, calculatedPNL, swapTransactionData, tx, processRunCounter, walletPublicKey);
   
    return true;
  } catch (error: any) {
    console.error(`${config.name}|[fetchAndSaveSwapDetails]| ⛔ Fetch and Save Swap Details Error: ${error.message}`, processRunCounter);
    return false;
  }
}
async function getTransactionDetails(tx: string, processRunCounter: number): Promise<SwapEventDetailsResponse | null> {

  const txUrl = process.env.HELIUS_HTTPS_URI_TX || "";
  console.log(`${config.name}|[getTransactionDetails]| Fetching swap details for tx: ${tx}`, processRunCounter);
  
  try {
    const maxRetries = 5;
    let txResponse = null;
    let retryCount = 0;
    
    // Retry loop for transaction details API
    while (retryCount < maxRetries) {
      try {
        console.log(`${config.name}|[getTransactionDetails]| Transaction details API request attempt ${retryCount + 1}/${maxRetries}`, processRunCounter);
        txResponse = await retryAxiosRequest(
          () => axios.post<any>(
            txUrl,
            { transactions: [tx] },
            {
              headers: {
                "Content-Type": "application/json",
              },
              timeout: 10000, // Timeout for each request
            }
          ),
          5, // maxRetries
          1000, // initialDelay
          processRunCounter
        );
        
        // If we got a valid response, break out of the retry loop
        if (txResponse && txResponse.data && txResponse.data.length > 0) {
          break;
        } else {
          throw new Error("Empty response received");
        }
      } catch (error: any) {
        retryCount++;
        console.log(`${config.name}|[getTransactionDetails]| ⛔ Transaction details API request failed (Attempt ${retryCount}/${maxRetries}): ${error.message}`, processRunCounter);
        
        // If we haven't exhausted all retries, wait and try again
        if (retryCount < maxRetries) {
          const delay = Math.min(2000 * Math.pow(1.5, retryCount), 15000); // Exponential backoff with max delay of 15 seconds
          console.log(`${config.name}|[getTransactionDetails]| Waiting ${delay / 1000} seconds before next transaction details API request attempt...`, processRunCounter);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          // All retries failed
          console.error(`${config.name}|[getTransactionDetails]| ⛔ All transaction details API request attempts failed. \n${error.message} \ntx: https://solscan.io/tx/${tx}`, processRunCounter);
          return null;
        }
      }
    }
    
    // Check if we have a valid response after all retries
    if (!txResponse || !txResponse.data || txResponse.data.length === 0) {
      console.warn(`${config.name}|[getTransactionDetails]| ⛔ No transaction data recived from Solana Node. Check manually: http://solscan.io/tx/${tx}`, processRunCounter);
      return null;
    }

    // Safely access the event information
    const transactions: TransactionDetailsResponseArray = txResponse.data;
    if (!transactions[0]?.events?.swap || !transactions[0]?.events?.swap?.innerSwaps) {
      console.warn(`${config.name}|[getTransactionDetails]| ⛔ No swap details recived from Solana Node. Check manually: http://solscan.io/tx/${tx}`, processRunCounter);
      return null;
    }

    // Safely access the event information
    const swapTransactionData: SwapEventDetailsResponse = {
      programInfo: transactions[0]?.events.swap.innerSwaps[0].programInfo,
      tokenInputs: transactions[0]?.events.swap.innerSwaps[0].tokenInputs,
      tokenOutputs: transactions[0]?.events.swap.innerSwaps[transactions[0]?.events.swap.innerSwaps.length - 1].tokenOutputs,
      fee: transactions[0]?.fee / 1e9,
      slot: transactions[0]?.slot,
      timestamp: transactions[0]?.timestamp,
      description: transactions[0]?.description,
    };


    return swapTransactionData;
  } catch (error: any) {
    console.error(`${config.name}|[getTransactionDetails]| ⛔ Get Transaction Details Error: ${error.message}`, processRunCounter);
    return null;
  }
}

async function sendSellNotification(holding: HoldingRecord, calculatedPNL: CalculatedPNL, profitLossRecord: ProfitLossRecord, processRunCounter: number) {
  const icon = profitLossRecord.IsTakeProfit ? "🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢" : "🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴";
  const actionText = profitLossRecord.IsTakeProfit ? "Take profit" : "Stop loss";
  const hrTradeTime = DateTime.fromMillis(Date.now()).toFormat("HH:mm:ss");
  const txLink = `https://solscan.io/tx/${profitLossRecord.TxId}`;
  const tokenLink = `https://solscan.io/token/${holding.Token}`;
  const gmgnLink = `https://gmgn.xyz/token/${holding.Token}`;
  const jsonData = JSON.stringify(profitLossRecord, null, 2);
  const message = `${icon}\n${hrTradeTime}: ${actionText} for ${holding.TokenName} with wallet ${profitLossRecord.WalletPublicKey}\n${txLink}\n${tokenLink}\n${gmgnLink}\n${jsonData}\n${icon}`;
  console.log(message, processRunCounter, {holding, calculatedPNL, profitLossRecord}, "send-to-discord");
}
async function makeInsertTransaction(holding: HoldingRecord, calculatedPNL: CalculatedPNL,  swapTransactionData: SwapEventDetailsResponse, publicKey: string, txTransaction: string, processRunCounter: number) {
  const transactionRecord: TransactionRecord = {
      Time: Math.floor(Date.now() / 1000),
      Token: holding.Token,
      TokenName: holding.TokenName,
      TransactionType: 'SELL',
      TokenAmount: holding.Balance,
      SolAmount: swapTransactionData.tokenOutputs[0].tokenAmount,
      SolFee: swapTransactionData.fee,
      PricePerTokenUSDC: (swapTransactionData.tokenOutputs[0].tokenAmount * calculatedPNL.solanaPrice)/holding.Balance,
      TotalUSDC: (swapTransactionData.tokenOutputs[0].tokenAmount * calculatedPNL.solanaPrice),
      Slot: holding.Slot,
      Program: holding.Program,
      BotName: config.name,
      WalletPublicKey: publicKey,
      TxId: txTransaction
  }
  await insertTransaction(transactionRecord, processRunCounter).catch((err: any) => {
      console.log(`${config.name}|[main]| ⛔ Insert Transaction Database Error: ${err}`, processRunCounter);
  });
}

let lastSolanaPrice: number | null = null;

export async function getSolanaPrice(processRunCounter: number): Promise<number | null> {
  const priceUrl = process.env.JUP_HTTPS_PRICE_URI || "";
  let retryCount = 0;
  const maxRetries = 5;
  let priceResponse = null;

  while (retryCount < maxRetries) {
    try {
      console.log(`${config.name}|[getSolanaPrice]| Price API request attempt ${retryCount + 1}/${maxRetries}`, processRunCounter);
      priceResponse = await retryAxiosRequest(
        () => axios.get<any>(priceUrl, {
          params: {
            ids: config.liquidity_pool.wsol_pc_mint,
          },
          timeout: config.tx.get_timeout,
        }),
        5, // maxRetries
        1000, // initialDelay
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
      console.error(`${config.name}|[getSolanaPrice]| ⛔ Price API request failed (Attempt ${retryCount}/${maxRetries}): ${error.message}`, processRunCounter);
      
      // If we haven't exhausted all retries, wait and try again
      if (retryCount < maxRetries) {
        const delay = Math.min(2000 * Math.pow(1.5, retryCount), 15000); // Exponential backoff with max delay of 15 seconds
        console.log(`${config.name}|[getSolanaPrice]| Waiting ${delay / 1000} seconds before next price API request attempt...`, processRunCounter);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // All retries failed
        console.error(`${config.name}|[getSolanaPrice]| ⛔ All price API request attempts failed`, processRunCounter);
        return lastSolanaPrice;
      }
    }
  }
  
  // Check if we have a valid price response after all retries
  if (!priceResponse || !priceResponse.data || !priceResponse.data.data || 
      !priceResponse.data.data[config.liquidity_pool.wsol_pc_mint]?.price) {
    console.log(`${config.name}|[getSolanaPrice]| ⛔ Could not fetch latest Sol Price: No valid data received from API after ${maxRetries} attempts.`, processRunCounter);
    return lastSolanaPrice;
  }
  lastSolanaPrice = priceResponse.data.data[config.liquidity_pool.wsol_pc_mint]?.price;
  return lastSolanaPrice;
}

async function makeInsertProfitLoss(holding: HoldingRecord, calculatedPNL: CalculatedPNL, swapTransactionData: SwapEventDetailsResponse, txTransaction: string, processRunCounter: number, publicKey: string) {
  const ExitUSDC = Number(Number(swapTransactionData.tokenOutputs[0].tokenAmount).toFixed(8)) * calculatedPNL.solanaPrice;
  const StartUSDC = Number(Number(holding.SolPaidUSDC).toFixed(8)) * calculatedPNL.solanaPrice;
  const ProfitLossUSDC = Number(Number(ExitUSDC - StartUSDC).toFixed(8));
  const RoiPercentage = Number(Number(ExitUSDC / StartUSDC * 100).toFixed(2));
  const totalSolFees = holding.SolFeePaid + swapTransactionData.fee + calculatedPNL.fees.routeFeesSOL + calculatedPNL.fees.platformFeeSOL;
  const ProfitLossSolWithoutFees = Number(Number(swapTransactionData.tokenOutputs[0].tokenAmount - totalSolFees).toFixed(8));
  const ProfitLossUSDCWithoutFees = Number(Number(ExitUSDC - StartUSDC - totalSolFees).toFixed(8));
  const RoiPercentageWithoutFees = Number(Number(ProfitLossUSDCWithoutFees / StartUSDC * 100).toFixed(2));
  

  const profitLossRecord: ProfitLossRecord = {
      Time: Date.now(),
      EntryTime: holding.Time,
      Token: holding.Token,
      TokenName: holding.TokenName,
      EntryBalance: Number(Number(holding.Balance).toFixed(8)),
      ExitBalance: Number(Number(holding.Balance).toFixed(8)),
      EntrySolPaid: Number(Number(holding.SolPaid).toFixed(8)),
      ExitSolReceived: Number(Number(swapTransactionData.tokenOutputs[0].tokenAmount).toFixed(8)),
      TotalSolFees: totalSolFees,
      ProfitLossSOL: Number(Number(swapTransactionData.tokenOutputs[0].tokenAmount - holding.SolPaid).toFixed(8)),
      ProfitLossUSDC: ProfitLossUSDC,
      ROIPercentage: RoiPercentage,
      ProfitLossSOLWithFees: ProfitLossSolWithoutFees,
      ProfitLossUSDCWithFees: ProfitLossUSDC,
      ROIPercentageWithFees: RoiPercentageWithoutFees,
      EntryPriceUSDC: Number(Number(calculatedPNL.initialPriceUSDC).toFixed(8)),
      ExitPriceUSDC: Number(Number(calculatedPNL.currentPriceUSDC).toFixed(8)),
      HoldingTimeSeconds: Math.floor((Date.now() - holding.Time) / 1000),
      Slot: holding.Slot,
      Program: holding.Program,
      BotName: config.name,
      TxId: txTransaction,
      ConfigTakeProfit: config.sell.take_profit_percent,
      ConfigStopLoss: config.sell.stop_loss_percent,
      IsTakeProfit: calculatedPNL.pnlPercent >= config.sell.take_profit_percent,
      WalletPublicKey: publicKey
  }
  sendSellNotification(holding, calculatedPNL, profitLossRecord, processRunCounter);
  await insertProfitLoss(profitLossRecord, processRunCounter);
}
