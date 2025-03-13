import { config } from "./config"; // Configuration parameters for our bot
import axios from "axios";
import dotenv from "dotenv";
import { getAllHoldings, initializeDatabaseTables, insertProfitLoss, insertTransaction } from "./holding.db";
import { createSellTransactionResponse, HoldingRecord, LastPriceDexReponse, ProfitLossRecord } from "./types";
import { DateTime } from "luxon";
import { createSellTransaction } from "./transactions";
import { retryAxiosRequest } from "../utils/help-functions";
import logger from "./logger"; // Import the logger

dotenv.config();

let processRunCounter = 1;

async function main() {
  try {
    // Initialize database tables
    const tablesInitialized = await initializeDatabaseTables();
    if (!tablesInitialized) {
      console.error("[tracker-bot]|[main]| ⛔ Failed to initialize database tables. Exiting...");
      process.exit(1);
    }
    
    console.log("[tracker-bot]|[main]| ✅ Database tables initialized successfully");

    // Initialize the logger
    const priceUrl = process.env.JUP_HTTPS_PRICE_URI || "";
    const dexPriceUrl = process.env.DEX_HTTPS_LATEST_TOKENS || "";
    const priceSource = config.sell.price_source || "jup";
    const solMint = config.liquidity_pool.wsol_pc_mint;
    console.log(`[tracker-bot]|[main]|CYCLE_START: ${processRunCounter}`, processRunCounter);

    let currentPriceSource = "Jupiter Agregator";

    // Get all our current holdings
    const holdings = await getAllHoldings();

    console.log(`[tracker-bot]|[main]|Found Holdings: ${holdings.length}`, processRunCounter, holdings);
    if (holdings.length !== 0) {
      // Get all token ids
      const tokenValues = holdings.map((holding) => holding.Token).join(",");

      // Jupiter Agragator Price
      const priceResponse = await retryAxiosRequest(
        () => axios.get<any>(priceUrl, {
          params: {
            ids: tokenValues + "," + solMint,
            showExtraInfo: true,
          },
          timeout: config.tx.get_timeout,
        }),
        config.tx.fetch_tx_max_retries || 3,
        config.tx.retry_delay || 500,
        processRunCounter
      );
      const currentPrices = priceResponse.data;
      if (!currentPrices) {
        console.log(`[tracker-bot]|[main]| ⛔ Latest prices from Jupiter Agregator could not be fetched. Trying again...`);
        console.log(`[tracker-bot]|[main]| CYCLE_END: ${processRunCounter}`, ++processRunCounter);
        return;
      }

      console.log(`[tracker-bot]|[main]| Got Token Prices`, processRunCounter, currentPrices);

      // DexScreener Agragator Price
      let dexRaydiumPairs = null;
      if (priceSource !== "jup") {
        const dexPriceUrlPairs = `${dexPriceUrl}${tokenValues}`;
        const priceResponseDex = await retryAxiosRequest(
          () => axios.get<any>(dexPriceUrlPairs, {
            timeout: config.tx.get_timeout,
          }),
          config.tx.fetch_tx_max_retries || 3,
          config.tx.retry_delay || 500,
          processRunCounter
        );
        const currentPricesDex: LastPriceDexReponse = priceResponseDex.data;

        // Get raydium legacy pairs prices
        dexRaydiumPairs = currentPricesDex.pairs
          .filter((pair) => pair.dexId === "raydium")
          .reduce<Array<(typeof currentPricesDex.pairs)[0]>>((uniquePairs, pair) => {
            // Check if the baseToken address already exists
            const exists = uniquePairs.some((p) => p.baseToken.address === pair.baseToken.address);

            // If it doesn't exist or the existing one has labels, replace it with the no-label version
            if (!exists || (pair.labels && pair.labels.length === 0)) {
              return uniquePairs.filter((p) => p.baseToken.address !== pair.baseToken.address).concat(pair);
            }

            return uniquePairs;
          }, []);

        if (!currentPrices) {
          console.log(`[tracker-bot]|[main]| ⛔ Latest prices from Dexscreener Tokens API could not be fetched. Trying again...`);
          console.log(`[tracker-bot]|[main]| CYCLE_END: ${processRunCounter}`, ++processRunCounter);
          return;
        }
      }

      // Loop trough all our current holdings
      console.log(`[tracker-bot]|[main]| Processing Holdings`, processRunCounter, holdings);
      await Promise.all(
        holdings.map(async (row) => {
          const holding: HoldingRecord = row;
          const token = holding.Token;
          const tokenName = holding.TokenName === "N/A" ? token : holding.TokenName;
          const tokenTime = holding.Time;
          const tokenBalance = holding.Balance;
          const tokenSolPaid = holding.SolPaid;
          const tokenSolFeePaid = holding.SolFeePaid;
          const tokenSolPaidUSDC = holding.SolPaidUSDC;
          const tokenSolFeePaidUSDC = holding.SolFeePaidUSDC;
          const tokenPerTokenPaidUSDC = holding.PerTokenPaidUSDC;
          const tokenSlot = holding.Slot;
          const tokenProgram = holding.Program;
          const tokenBotName = holding.BotName;
          const tokenWalletPublicKey = holding.WalletPublicKey;
          // Conver Trade Time
          const tradeTime = DateTime.fromMillis(tokenTime).toLocal();
          const hrTradeTime = tradeTime.toFormat("HH:mm:ss");

          // Get current price
          let tokenCurrentPrice = currentPrices[token]?.extraInfo?.lastSwappedPrice?.lastJupiterSellPrice;
          if (priceSource === "dex") {
            if (dexRaydiumPairs && dexRaydiumPairs?.length !== 0) {
              currentPriceSource = "Dexscreener Tokens API";
              const pair = dexRaydiumPairs.find((p: any) => p.baseToken.address === token);
              tokenCurrentPrice = pair ? pair.priceUsd : tokenCurrentPrice;
            } else {
              console.log(`[tracker-bot]|[main]| 🚩 Latest prices from Dexscreener Tokens API not fetched. Falling back to Jupiter.`, processRunCounter);
            }
          }
          console.log(`[tracker-bot]|[main]| 📈 Current price via ✅ ${currentPriceSource} | ${tokenCurrentPrice}`, processRunCounter);
          // Calculate PnL and profit/loss
          const unrealizedPnLUSDC = (tokenCurrentPrice - tokenPerTokenPaidUSDC) * tokenBalance - tokenSolFeePaidUSDC;
          const unrealizedPnLPercentage = (unrealizedPnLUSDC / (tokenPerTokenPaidUSDC * tokenBalance)) * 100;
          const iconPnl = unrealizedPnLUSDC > 0 ? "🟢" : "🔴";

          // Check SL/TP
          if (config.sell.auto_sell && config.sell.auto_sell === true) {
            const amountIn = tokenBalance.toString().replace(".", "");

            // Sell via Take Profit unrealizedPnLPercentage >= config.sell.take_profit_percent
            if (true) {
              try {
                // Get wallet private keys from environment variable
                const walletPrivateKeys = (process.env.PRIV_KEY_WALLETS || "").split(",").map(key => key.trim()).filter(key => key);
                if (!walletPrivateKeys.length) {
                  console.error(`[tracker-bot]|[main]| ⛔ No wallet private keys found in PRIV_KEY_WALLETS`, processRunCounter);
                  return;
                }

                let successfulTransactions = 0;

                // Try to sell with each wallet
                for (const privateKey of walletPrivateKeys) {
                  const result = await createSellTransaction(config.liquidity_pool.wsol_pc_mint, token, amountIn, processRunCounter, "take-profit", privateKey);
                  const txErrorMsg = result.msg;
                  const txSuccess = result.success;
                  const txTransaction = result.tx;
                  const walletPublicKey = result.walletPublicKey;
                  
                  // Add success to log output
                  if (txSuccess && txTransaction) {
                    console.log(`[tracker-bot]|[main]| ✅🟢 ${hrTradeTime}: Took profit for ${tokenName} with wallet ${walletPublicKey}\nTx: ${txTransaction}`, processRunCounter);
                    
                    // Create profit/loss record for successful take-profit
                    const profitLossRecord: ProfitLossRecord = {
                      Time: Date.now(),
                      EntryTime: tokenTime,
                      Token: token,
                      TokenName: tokenName,
                      EntryBalance: tokenBalance,
                      ExitBalance: Number(amountIn),
                      EntrySolPaid: tokenSolPaid,
                      ExitSolReceived: tokenCurrentPrice * Number(amountIn),
                      TotalSolFees: tokenSolFeePaid,
                      ProfitLossSOL: (tokenCurrentPrice * Number(amountIn)) - tokenSolPaid,
                      ProfitLossUSDC: unrealizedPnLUSDC,
                      ROIPercentage: unrealizedPnLPercentage,
                      EntryPriceUSDC: tokenPerTokenPaidUSDC,
                      ExitPriceUSDC: tokenCurrentPrice,
                      HoldingTimeSeconds: Math.floor(Date.now() / 1000) - Math.floor(tokenTime / 1000),
                      Slot: tokenSlot,
                      Program: tokenProgram,
                      BotName: tokenBotName,
                      IsTakeProfit: unrealizedPnLPercentage >= 0,
                      WalletPublicKey: walletPublicKey
                    };

                    await insertProfitLoss(profitLossRecord, processRunCounter);
                    console.log(`[tracker-bot]|[main]| Profit/Loss Record Created for Take-Profit:`, processRunCounter, {
                      token: token,
                      profitLossUSDC: unrealizedPnLUSDC,
                      roiPercentage: unrealizedPnLPercentage,
                      IsTakeProfit: unrealizedPnLPercentage >= 0,
                      wallet: walletPublicKey
                    });
                    
                    // Insert transaction record
                    const transactionData = {
                      Time: Math.floor(Date.now() / 1000),
                      Token: token,
                      TokenName: tokenName,
                      TransactionType: 'SELL' as 'BUY' | 'SELL',
                      TokenAmount: Number(amountIn),
                      SolAmount: tokenCurrentPrice * Number(amountIn),
                      SolFee: tokenSolFeePaid,
                      PricePerTokenUSDC: tokenCurrentPrice,
                      TotalUSDC: tokenCurrentPrice * Number(amountIn),
                      Slot: tokenSlot,
                      Program: tokenProgram,
                      BotName: tokenBotName,
                      WalletPublicKey: walletPublicKey
                    };
                    
                    await insertTransaction(transactionData, processRunCounter).catch((err: any) => {
                      console.log(`[tracker-bot]|[main]| ⛔ Insert Transaction Database Error: ${err}`, processRunCounter);
                    });
                    
                    successfulTransactions++;
                  } else {
                    console.error(`[tracker-bot]|[main]| ⚠️ ERROR when taking profit for ${tokenName} with wallet ${walletPublicKey}: ${txErrorMsg}`, processRunCounter);
                  }
                }

                if (successfulTransactions === 0) {
                  console.error(`[tracker-bot]|[main]| ⚠️ All take-profit transactions failed for ${tokenName}`, processRunCounter);
                  console.log(`[tracker-bot]|[main]| CYCLE_END`, processRunCounter, ++processRunCounter);
                  return;
                }

                console.log(`[tracker-bot]|[main]| ✅ Successfully processed ${successfulTransactions} out of ${walletPrivateKeys.length} take-profit transactions for ${tokenName}`, processRunCounter);
              } catch (error: any) {
                console.error(`[tracker-bot]|[main]| ⚠️ ERROR when taking profit for ${tokenName}: ${error.message}`, processRunCounter);
                console.log(`[tracker-bot]|[main]| CYCLE_END`, processRunCounter, ++processRunCounter);
                return;
              }
            }

            // Sell via Stop Loss
            if (unrealizedPnLPercentage <= -config.sell.stop_loss_percent) {
              try {
                // Get wallet private keys from environment variable
                const walletPrivateKeys = (process.env.PRIV_KEY_WALLETS || "").split(",").map(key => key.trim()).filter(key => key);
                if (!walletPrivateKeys.length) {
                  console.error(`[tracker-bot]|[main]| ⛔ No wallet private keys found in PRIV_KEY_WALLETS`, processRunCounter);
                  return;
                }

                let successfulTransactions = 0;

                // Try to sell with each wallet
                for (const privateKey of walletPrivateKeys) {
                  const result = await createSellTransaction(config.liquidity_pool.wsol_pc_mint, token, amountIn, processRunCounter, "stop-loss", privateKey);
                  const txErrorMsg = result.msg;
                  const txSuccess = result.success;
                  const txTransaction = result.tx;
                  const walletPublicKey = result.walletPublicKey;
                  
                  // Add success to log output
                  if (txSuccess && txTransaction) {
                    console.log(`[tracker-bot]|[main]| ✅🔴 ${hrTradeTime}: Triggered Stop Loss for ${tokenName} with wallet ${walletPublicKey}\nTx: ${txTransaction}`, processRunCounter);
                    
                    // Create profit/loss record for stop-loss
                    const profitLossRecord: ProfitLossRecord = {
                      Time: Date.now(),
                      EntryTime: tokenTime,
                      Token: token,
                      TokenName: tokenName,
                      EntryBalance: tokenBalance,
                      ExitBalance: Number(amountIn),
                      EntrySolPaid: tokenSolPaid,
                      ExitSolReceived: tokenCurrentPrice * Number(amountIn),
                      TotalSolFees: tokenSolFeePaid,
                      ProfitLossSOL: (tokenCurrentPrice * Number(amountIn)) - tokenSolPaid,
                      ProfitLossUSDC: unrealizedPnLUSDC,
                      ROIPercentage: unrealizedPnLPercentage,
                      EntryPriceUSDC: tokenPerTokenPaidUSDC,
                      ExitPriceUSDC: tokenCurrentPrice,
                      HoldingTimeSeconds: Math.floor(Date.now() / 1000) - Math.floor(tokenTime / 1000),
                      Slot: tokenSlot,
                      Program: tokenProgram,
                      BotName: tokenBotName,
                      IsTakeProfit: unrealizedPnLPercentage >= 0,
                      WalletPublicKey: walletPublicKey
                    };

                    await insertProfitLoss(profitLossRecord, processRunCounter);
                    console.log(`[tracker-bot]|[main]| Profit/Loss Record Created for Stop-Loss:`, processRunCounter, {
                      token: token,
                      profitLossUSDC: unrealizedPnLUSDC,
                      roiPercentage: unrealizedPnLPercentage,
                      IsTakeProfit: unrealizedPnLPercentage >= 0,
                      wallet: walletPublicKey
                    });
                    
                    // Insert transaction record
                    const transactionData = {
                      Time: Math.floor(Date.now() / 1000),
                      Token: token,
                      TokenName: tokenName,
                      TransactionType: 'SELL' as 'BUY' | 'SELL',
                      TokenAmount: Number(amountIn),
                      SolAmount: tokenCurrentPrice * Number(amountIn),
                      SolFee: tokenSolFeePaid,
                      PricePerTokenUSDC: tokenCurrentPrice,
                      TotalUSDC: tokenCurrentPrice * Number(amountIn),
                      Slot: tokenSlot,
                      Program: tokenProgram,
                      BotName: tokenBotName,
                      WalletPublicKey: walletPublicKey
                    };
                    
                    await insertTransaction(transactionData, processRunCounter).catch((err: any) => {
                      console.log(`[tracker-bot]|[main]| ⛔ Insert Transaction Database Error: ${err}`, processRunCounter);
                    });
                    
                    successfulTransactions++;
                  } else {
                    console.error(`[tracker-bot]|[main]| ⚠️ ERROR when triggering stop loss for ${tokenName} with wallet ${walletPublicKey}: ${txErrorMsg}`, processRunCounter);
                  }
                }

                if (successfulTransactions === 0) {
                  console.error(`[tracker-bot]|[main]| ⚠️ All stop-loss transactions failed for ${tokenName}`, processRunCounter);
                  console.log(`[tracker-bot]|[main]| CYCLE_END`, processRunCounter, ++processRunCounter);
                  return;
                }

                console.log(`[tracker-bot]|[main]| ✅ Successfully processed ${successfulTransactions} out of ${walletPrivateKeys.length} stop-loss transactions for ${tokenName}`, processRunCounter);
              } catch (error: any) {
                console.error(`[tracker-bot]|[main]| ⚠️ ERROR when triggering Stop Loss for ${tokenName}: ${error.message}`, processRunCounter);
                console.log(`[tracker-bot]|[main]| CYCLE_END`, processRunCounter, ++processRunCounter);
                return;
              }
            }
          }

          // Get the current price
          
          console.log(
            `[tracker-bot]|[main]| ${iconPnl} ${hrTradeTime} Token: ${tokenName} Current Amount:${tokenBalance} \nUnrealized PnL: $${unrealizedPnLUSDC.toFixed(2)} (${unrealizedPnLPercentage.toFixed(2)}%)`, processRunCounter
          );
        })
      );
    }

    // Output Current Holdings
    
    if (holdings.length === 0) {
      console.log(`[tracker-bot]|[main]| No token holdings yet as of ${new Date().toISOString()}`, processRunCounter);
    }

    // Increment process run counter and update logger cycle
    processRunCounter++;
    console.log(`[tracker-bot]|[main]|CYCLE_END: ${processRunCounter} | WAITING ${config.check_interval} seconds before next check...`, processRunCounter);

    setTimeout(main, config.check_interval * 1000); // Call main again interval seconds
  } catch (error: any) {
    console.error(`[tracker-bot]|[main]| ⚠️ ERROR: ${error.message}`, processRunCounter);
    processRunCounter++;
    console.log(`[tracker-bot]|[main]| CYCLE_END: ${processRunCounter} | WAITING ${config.check_interval} seconds before next check...`, processRunCounter);
    setTimeout(main, config.check_interval * 1000); // Call main again interval seconds
  }
}

logger.init().then(() => {
  main().catch(async (err) => {
    console.error(err);
    await logger.close();
  });
});
