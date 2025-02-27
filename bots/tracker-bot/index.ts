import { config } from "./config"; // Configuration parameters for our bot
import axios from "axios";
import dotenv from "dotenv";
import { getAllHoldings } from "./holding.db";
import { createSellTransactionResponse, HoldingRecord, LastPriceDexReponse } from "./types";
import { DateTime } from "luxon";
import { createSellTransaction } from "./transactions";
import { retryAxiosRequest } from "../utils/help-functions";
import logger from "./logger"; // Import the logger

dotenv.config();

let processRunCounter = 1;

async function main() {
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

            // Sell via Take Profit
            if (unrealizedPnLPercentage >= config.sell.take_profit_percent) {
              try {
                const result: createSellTransactionResponse = await createSellTransaction(config.liquidity_pool.wsol_pc_mint, token, amountIn, processRunCounter, "take-profit");
                const txErrorMsg = result.msg;
                const txSuccess = result.success;
                const tXtransaction = result.tx;
                // Add success to log output
                if (txSuccess) {
                  console.log(`[tracker-bot]|[main]| ✅🟢 ${hrTradeTime}: Took profit for ${tokenName}\nTx: ${tXtransaction}`, processRunCounter);
                } else {
                  console.error(`[tracker-bot]|[main]| ⚠️ ERROR when taking profit for ${tokenName}: ${txErrorMsg}`, processRunCounter);
                  console.log(`[tracker-bot]|[main]| CYCLE_END`, processRunCounter, ++processRunCounter);
                  return;
                }
              } catch (error: any) {
                console.error(`[tracker-bot]|[main]| ⚠️  ERROR when taking profit for ${tokenName}: ${error.message}`, processRunCounter);
                console.log(`[tracker-bot]|[main]| CYCLE_END`, processRunCounter, ++processRunCounter);
                return;
              }
            }

            // Sell via Stop Loss
            if (unrealizedPnLPercentage <= -config.sell.stop_loss_percent) {
              try {
                const result: createSellTransactionResponse = await createSellTransaction(config.liquidity_pool.wsol_pc_mint, token, amountIn, processRunCounter, "stop-loss");
                const txErrorMsg = result.msg;
                const txSuccess = result.success;
                const tXtransaction = result.tx;
                // Add success to log output
                if (txSuccess) {
                  console.log(`[tracker-bot]|[main]| ✅🔴 ${hrTradeTime}: Triggered Stop Loss for ${tokenName}\nTx: ${tXtransaction}`, processRunCounter);
                } else {
                  console.error(`[tracker-bot]|[main]| ⚠️ ERROR when triggering Stop Loss for ${tokenName}: ${txErrorMsg}`, processRunCounter);
                  console.log(`[tracker-bot]|[main]| CYCLE_END`, processRunCounter, ++processRunCounter);
                  return;
                }
              } catch (error: any) {
                console.error(`[tracker-bot]|[main]| ⚠️ ERROR when triggering Stop Loss for ${tokenName}: ${error.message}: \n`, processRunCounter);
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
}
logger.init().then(() => {
  main().catch(async (err) => {
    console.error(err);
    await logger.close();
  });
});
