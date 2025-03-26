import { config } from "./config"; // Configuration parameters for our bot
import axios from "axios";
import dotenv from "dotenv";
import { getAllHoldings, initializeDatabaseTables, insertProfitLoss, insertTransaction, updateSellAttempts } from "./holding.db";
import { HoldingRecord, LastPriceDexReponse, ProfitLossRecord } from "./types";
import { DateTime } from "luxon";
import { createSellTransaction } from "./transactions";
import { retryAxiosRequest } from "../utils/help-functions";
import logger from "./logger"; // Import the logger
import { Keypair } from "@solana/web3.js";
import { Wallet } from "@project-serum/anchor";
import bs58 from "bs58";

dotenv.config();

let processRunCounter = 1;

async function main() {
  try {
    // Initialize database tables
    const tablesInitialized = await initializeDatabaseTables();
    if (!tablesInitialized) {
      console.error(`${config.name}|[main]| ⛔ Failed to initialize database tables. Exiting...`);
      process.exit(1);
    }
    
    console.log(`${config.name}|[main]| ✅ Database tables initialized successfully`);

    // Initialize the logger
    const priceUrl = process.env.JUP_HTTPS_PRICE_URI || "";
    const dexPriceUrl = process.env.DEX_HTTPS_LATEST_TOKENS || "";
    const priceSource = config.sell.price_source || "jup";
    const solMint = config.liquidity_pool.wsol_pc_mint;
    console.log(`${config.name}|[main]|CYCLE_START: ${processRunCounter}`, processRunCounter);

    let currentPriceSource = "Jupiter Agregator";

    // Get all our current holdings
    const holdings = await getAllHoldings(false);

    console.log(`${config.name}|[main]|Found Holdings: ${holdings.length}`, processRunCounter, holdings);
    if (holdings.length !== 0) {
      // Create a map of public keys to private keys
      const walletPrivateKeys = (process.env.PRIV_KEY_WALLETS || "").split(",").map(key => key.trim()).filter(key => key);
      const walletKeyMap = new Map<string, string>();
      
      // Create wallet map using decoded private keys
      walletPrivateKeys.forEach(privateKey => {
        const wallet = new Wallet(Keypair.fromSecretKey(bs58.decode(privateKey)));
        const publicKey = wallet.publicKey.toString();
        walletKeyMap.set(publicKey, privateKey);
      });

      // Log the format of the holdings for better debugging
      const holdingFormatSample = holdings[0];
      console.log(`${config.name}|[main]| Holdings format sample:`, processRunCounter, {
        SolPaid: `${holdingFormatSample.SolPaid} (in SOL)`,
        SolFeePaid: `${holdingFormatSample.SolFeePaid} (in SOL)`,
        SolPaidUSDC: holdingFormatSample.SolPaidUSDC,
        SolFeePaidUSDC: holdingFormatSample.SolFeePaidUSDC,
      });
      
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
        console.log(`${config.name}|[main]| ⛔ Latest prices from Jupiter Agregator could not be fetched. Trying again...`);
        console.log(`${config.name}|[main]| CYCLE_END: ${processRunCounter}`, ++processRunCounter);
        return;
      }

      console.log(`${config.name}|[main]| Got Token Prices`, processRunCounter, currentPrices);

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
          ? currentPricesDex.pairs
              .filter((pair) => pair.dexId === "raydium")
              .reduce<Array<(typeof currentPricesDex.pairs)[0]>>((uniquePairs, pair) => {
                // Check if the baseToken address already exists
                const exists = uniquePairs.some((p) => p.baseToken.address === pair.baseToken.address);

                // If it doesn't exist or the existing one has labels, replace it with the no-label version
                if (!exists || (pair.labels && pair.labels.length === 0)) {
                  return uniquePairs.filter((p) => p.baseToken.address !== pair.baseToken.address).concat(pair);
                }

                return uniquePairs;
              }, [])
          : [];

        if (!currentPrices) {
          console.log(`${config.name}|[main]| ⛔ Latest prices from Jupitter didn't recived`);
          console.log(`${config.name}|[main]| CYCLE_END: ${processRunCounter}`, ++processRunCounter);
          return;
        }
      }

      // Loop trough all our current holdings
      console.log(`${config.name}|[main]| Processing Holdings`, processRunCounter, holdings);
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
              tokenCurrentPrice = pair ? parseFloat(pair.priceUsd) : parseFloat(tokenCurrentPrice);
            } else {
              console.log(`${config.name}|[main]| 🚩 Latest prices from Dexscreener Tokens API not fetched. Falling back to Jupiter.`, processRunCounter);
            }
          }
          
          // Ensure tokenCurrentPrice is a number
          tokenCurrentPrice = parseFloat(tokenCurrentPrice);
          
          console.log(`${config.name}|[main]| 📈 Current price via ✅ ${currentPriceSource} | ${tokenCurrentPrice}`, processRunCounter);

          if(!tokenCurrentPrice || isNaN(tokenCurrentPrice)) {
            console.warn(`${config.name}|[main]| 🚩 Latest prices for ${tokenName} not fetched or invalid.`, processRunCounter, {holding});
            return;
          }
          
          // Log the raw holding values for debugging
          console.log(`${config.name}|[main]| Raw holding values for ${tokenName}:`, processRunCounter, {
            tokenBalance: `${tokenBalance} tokens`,
            tokenSolPaid: `${tokenSolPaid} SOL`,
            tokenSolFeePaid: `${tokenSolFeePaid} SOL`,
            tokenSolPaidUSDC: `$${tokenSolPaidUSDC}`,
            tokenSolFeePaidUSDC: `$${tokenSolFeePaidUSDC}`,
            tokenPerTokenPaidUSDC: `$${tokenPerTokenPaidUSDC} per token`,
            currentPrice: `$${tokenCurrentPrice} per token`,
          });
          
          // Calculate and log P&L details before executing any actions
          let unrealizedPnLUSDC, unrealizedPnLPercentage;
          if (config.sell.include_fees_in_pnl) {
            // Include fees in P&L calculation
            unrealizedPnLUSDC = (tokenCurrentPrice - tokenPerTokenPaidUSDC) * tokenBalance - tokenSolFeePaidUSDC;
            unrealizedPnLPercentage = (unrealizedPnLUSDC / (tokenPerTokenPaidUSDC * tokenBalance)) * 100;
            const logData = {
              tokenName,
              address: token,
              tokenBalance: Number(tokenBalance).toFixed(8),
              tokenPerTokenPaidUSDC: Number(tokenPerTokenPaidUSDC).toFixed(8),
              tokenCurrentPrice: Number(tokenCurrentPrice).toFixed(8),
              tokenSolFeePaidUSDC: Number(tokenSolFeePaidUSDC).toFixed(8),
              priceDiff: `$${(tokenCurrentPrice - tokenPerTokenPaidUSDC).toFixed(8)} per token`,
              grossPnL: `$${((tokenCurrentPrice - tokenPerTokenPaidUSDC) * tokenBalance).toFixed(8)}`,
              fees: `$${Number(tokenSolFeePaidUSDC).toFixed(8)}`,
              netPnL: `$${Number(unrealizedPnLUSDC).toFixed(8)}`,
              roiPercent: `${Number(unrealizedPnLPercentage).toFixed(2)}%`
            }
            console.log(`${config.name}|[main]| P&L calculation (including fees) TP: ${config.sell.take_profit_percent}% SL: ${config.sell.stop_loss_percent}%\n${JSON.stringify(logData, null, 2)}`, processRunCounter, null, "discord-log");
          } else {
            // Exclude fees from P&L calculation - only consider price difference
            unrealizedPnLUSDC = (tokenCurrentPrice - tokenPerTokenPaidUSDC) * tokenBalance;
            unrealizedPnLPercentage = ((tokenCurrentPrice - tokenPerTokenPaidUSDC) / tokenPerTokenPaidUSDC) * 100;
            const logData = {
              tokenName,
              address: token,
              tokenBalance: Number(tokenBalance).toFixed(8),
              tokenPerTokenPaidUSDC: Number(tokenPerTokenPaidUSDC).toFixed(8),
              tokenCurrentPrice: Number(tokenCurrentPrice).toFixed(8),
              priceDiff: `$${(tokenCurrentPrice - tokenPerTokenPaidUSDC).toFixed(8)} per token`,
              pnL: `$${Number(unrealizedPnLUSDC).toFixed(8)}`,
              roiPercent: `${Number(unrealizedPnLPercentage).toFixed(2)}%`
            };
            console.log(`${config.name}|[main]| P&L calculation (excluding fees) TP: ${config.sell.take_profit_percent}% SL: ${config.sell.stop_loss_percent}%\n${JSON.stringify(logData, null, 2)}`, processRunCounter, null, "discord-log");
          }
          
          // Log if PnL percentage is 5% or more in either direction
          if (Math.abs(unrealizedPnLPercentage) >= 5) {
            const pnlStatus = unrealizedPnLPercentage >= 0 ? "🟢 PROFIT" : "🔴 LOSS";
            const pnlIcon = unrealizedPnLPercentage >= 0 ? "📈" : "📉";
            
            console.log(
              `${config.name}|[main]| ${pnlIcon} SIGNIFICANT PNL ALERT: ${tokenName} has ${pnlStatus} of ${Math.abs(unrealizedPnLPercentage).toFixed(2)}%\n` +
              `Unrealized PnL: $${unrealizedPnLUSDC.toFixed(2)}`,
              processRunCounter
            );
          }
          
          const iconPnl = unrealizedPnLUSDC > 0 ? "🟢" : "🔴";
          // Get private key for this wallet
          const privateKey = walletKeyMap.get(tokenWalletPublicKey);
          if (!privateKey) {
            console.error(`${config.name}|[main]| ⛔ No private key found for wallet ${tokenWalletPublicKey}`, processRunCounter);
            return;
          }

          // Check SL/TP
          if (config.sell.auto_sell && config.sell.auto_sell === true) {
            const amountIn = tokenBalance.toString().replace(".", "");

            // Handle both take profit and stop loss
            const shouldTakeProfit = unrealizedPnLPercentage >= config.sell.take_profit_percent;
            const shouldStopLoss = unrealizedPnLPercentage <= -config.sell.stop_loss_percent;

            if (shouldTakeProfit || shouldStopLoss) {
              const sellType = shouldTakeProfit ? "take-profit" : "stop-loss";
              const icon = shouldTakeProfit ? "🟢" : "🔴";
              const actionText = shouldTakeProfit ? "take profit" : "stop loss";
              const configValue = shouldTakeProfit ? config.sell.take_profit_percent : config.sell.stop_loss_percent;

              console.log(`${config.name}|[main]| ${icon} ${hrTradeTime}: Trying to ${actionText} for ${tokenName} with PnL: $${unrealizedPnLUSDC.toFixed(2)} (${unrealizedPnLPercentage.toFixed(2)}%), Config ${shouldTakeProfit ? 'TP' : 'SL'}: ${configValue}%`, processRunCounter, {
                tokenName,
                unrealizedPnLUSDC,
                unrealizedPnLPercentage,
                config: config.sell
              });

              try {
                // Check if holding is skipped
                if (holding.IsSkipped) {
                  console.log(`${config.name}|[main]| ⚠️ Skipping sell attempt for ${tokenName} - marked as unsellable after ${config.sell.max_sell_attempts} failed attempts`, processRunCounter);
                  return;
                }

                const result = await createSellTransaction(config.liquidity_pool.wsol_pc_mint, token, amountIn, processRunCounter, sellType, privateKey);
                const txErrorMsg = result.msg;
                const txSuccess = result.success;
                const txTransaction = result.tx;
                const walletPublicKey = result.walletPublicKey;
                
                // Update sell attempts on failure
                if (!txSuccess) {
                  await updateSellAttempts(token, walletPublicKey, txTransaction || 'None', processRunCounter);
                  console.log(`${config.name}|[main]| ⚠️ Failed sell attempt for ${tokenName} with wallet ${walletPublicKey}: ${txErrorMsg}`, processRunCounter);
                  return;
                }

                // Add success to log output
                if (txSuccess && txTransaction) {
                  console.log(`${config.name}|[main]| ✅${icon} ${hrTradeTime}: ${shouldTakeProfit ? 'Took profit' : 'Triggered Stop Loss'} for ${tokenName} with wallet ${walletPublicKey}\nTx: ${txTransaction}`, processRunCounter);
                  
                  // Create profit/loss record
                  const profitLossRecord: ProfitLossRecord = {
                    Time: Date.now(),
                    EntryTime: tokenTime,
                    Token: token,
                    TokenName: tokenName,
                    EntryBalance: Number(Number(tokenBalance).toFixed(8)),
                    ExitBalance: Number(Number(tokenBalance).toFixed(8)),
                    EntrySolPaid: Number(Number(tokenSolPaid).toFixed(8)),
                    ExitSolReceived: Number(Number(tokenCurrentPrice * tokenBalance).toFixed(8)),
                    TotalSolFees: Number(Number(tokenSolFeePaid).toFixed(8)),
                    ProfitLossSOL: Number(Number((tokenCurrentPrice * tokenBalance) - tokenSolPaid).toFixed(8)),
                    ProfitLossUSDC: Number(Number(unrealizedPnLUSDC).toFixed(8)),
                    ROIPercentage: Number(Number(unrealizedPnLPercentage).toFixed(2)),
                    EntryPriceUSDC: Number(Number(tokenPerTokenPaidUSDC).toFixed(8)),
                    ExitPriceUSDC: Number(Number(tokenCurrentPrice).toFixed(8)),
                    HoldingTimeSeconds: Math.floor((Date.now() - tokenTime) / 1000),
                    Slot: tokenSlot,
                    Program: tokenProgram,
                    BotName: config.name,
                    IsTakeProfit: unrealizedPnLPercentage >= 0,
                    WalletPublicKey: walletPublicKey,
                    TxId: txTransaction
                  };

                  await insertProfitLoss(profitLossRecord, processRunCounter);
                  console.log(`${config.name}|[main]| Profit/Loss Record Created for ${shouldTakeProfit ? 'Take-Profit' : 'Stop-Loss'}:`, processRunCounter, {
                    token: token,
                    profitLossUSDC: Number(unrealizedPnLUSDC).toFixed(8),
                    roiPercentage: Number(unrealizedPnLPercentage).toFixed(2),
                    IsTakeProfit: unrealizedPnLPercentage >= 0,
                    wallet: walletPublicKey
                  });
                  
                  // Insert transaction record
                  const transactionData = {
                    Time: Math.floor(Date.now() / 1000),
                    Token: token,
                    TokenName: tokenName,
                    TransactionType: 'SELL',
                    TokenAmount: Number(tokenBalance),
                    SolAmount: Number(tokenCurrentPrice * tokenBalance),
                    SolFee: Number(tokenSolFeePaid),
                    PricePerTokenUSDC: Number(tokenCurrentPrice),
                    TotalUSDC: Number(tokenCurrentPrice * tokenBalance),
                    Slot: tokenSlot,
                    Program: tokenProgram,
                    BotName: config.name,
                    WalletPublicKey: walletPublicKey,
                    TxId: txTransaction
                  };
                  
                  await insertTransaction(transactionData, processRunCounter).catch((err: any) => {
                    console.log(`${config.name}|[main]| ⛔ Insert Transaction Database Error: ${err}`, processRunCounter);
                  });
                } else {
                  console.log(`${config.name}|[main]| ⚠️ ERROR when ${actionText} for ${tokenName} with wallet ${walletPublicKey}: ${JSON.stringify({txErrorMsg}, null, 2)}`, processRunCounter);
                }
              } catch (error: any) {
                console.error(`${config.name}|[main]| ⚠️ ERROR when ${actionText} for ${tokenName}: ${error.message}`, processRunCounter);
                console.log(`${config.name}|[main]| CYCLE_END`, processRunCounter, ++processRunCounter);
                return;
              }
            }
          }

          // Get the current price
          
          console.log(
            `${config.name}|[main]| ${iconPnl} ${hrTradeTime} Token: ${tokenName} Current Amount:${tokenBalance} \nUnrealized PnL: $${unrealizedPnLUSDC.toFixed(2)} (${unrealizedPnLPercentage.toFixed(2)}%)`, processRunCounter
          );
        })
      );
    }

    // Output Current Holdings
    
    if (holdings.length === 0) {
      console.log(`${config.name}|[main]| No token holdings yet as of ${new Date().toISOString()}`, processRunCounter);
    }

    // Increment process run counter and update logger cycle
    processRunCounter++;
    console.log(`${config.name}|[main]|CYCLE_END: ${processRunCounter} | WAITING ${config.check_interval} seconds before next check...`, processRunCounter);

    setTimeout(main, config.check_interval * 1000); // Call main again interval seconds
  } catch (error: any) {
    console.error(`${config.name}|[main]| ⚠️ ERROR: ${error.message}`, processRunCounter);
    processRunCounter++;
    console.log(`${config.name}|[main]| CYCLE_END: ${processRunCounter} | WAITING ${config.check_interval} seconds before next check...`, processRunCounter);
    setTimeout(main, config.check_interval * 1000); // Call main again interval seconds
  }
}


logger.init().then(() => {
  main().catch(async (err) => {
    console.error(err);
    await logger.close();
  });
});
