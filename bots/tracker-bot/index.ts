import { tracker_bot_config } from "./config";
import dotenv, { config } from "dotenv";
import { getAllHoldings, initializeDatabaseTables, updateSellAttempts } from "../../db/holding.db";
import { BotConfig, createDefaultBotConfig, getBotConfigs } from "../../db/config.db";
import { CalculatedPNL, HoldingRecord, QuoteResponse, TrackerBotConfig } from "./types";
import { DateTime } from "luxon";
import { createSellTransaction, fetchAndSaveSwapDetails,getSolanaPrice, calculatePNL } from "./transactions";
import { getTokenQuotes } from "../../services/jupiter/jupiter-get-quotes";
import logger from "./logger";
import { getBotConfigData, getPrivateKeysMap } from "../../common/utils/help-functions";

dotenv.config();
let processRunCounter = 1;

async function main() {
    let bot_name = ""
    try {
        const walletKeyMap = getPrivateKeysMap();
        const solanaPrice = await getSolanaPrice(processRunCounter);
        if (solanaPrice && walletKeyMap.size > 0) {
            const botConfigs = await getBotConfigs(tracker_bot_config.bot_default_config.bot_type, true);
            if(botConfigs.length === 0) {
                const defaultConfig = await createDefaultBotConfig(tracker_bot_config.bot_default_config);
                if(defaultConfig) {
                    botConfigs.push(defaultConfig);
                }
            }
            for (const botConfig of botConfigs) {
                const botPrivateKey = walletKeyMap.get(botConfig.bot_wallet_address || "");
                bot_name = botConfig.bot_name;
                if(!botPrivateKey) {
                    console.warn(`${botConfig.bot_name}|[main]|No private key found for bot ${botConfig.bot_wallet_address}`, processRunCounter);
                    continue;
                }
                const holdings = await getAllHoldings("notSkipped", botConfig.bot_wallet_address);
                console.log(`${botConfig.bot_name}|[main]|Found Holdings: ${holdings.length} for bot ${botConfig.bot_wallet_address}`, processRunCounter, holdings);
                for (const holding of holdings) {
                    const tokenAmount = Math.round(Number(holding.Balance) * 1e9).toString();//TODO: check if this is correct
                    const tokenQuotes = await getTokenQuotes(botConfig.bot_name, holding.Token, tokenAmount, 500, processRunCounter);
                    console.log(`${botConfig.bot_name}|[main]|Token Quotes: ${tokenQuotes}`, processRunCounter, tokenQuotes);

                    if (tokenQuotes.success && tokenQuotes.data) {
                        const botConfigData = getBotConfigData<TrackerBotConfig>(botConfig);
                        const calculatedPNL = await calculatePNL(holding, tokenQuotes.data, botConfigData, solanaPrice);
            
                        await sendCurrentStateNotification(holding, calculatedPNL, botConfig.bot_name, processRunCounter);
                        
                        if (calculatedPNL.shouldTakeProfit || calculatedPNL.shouldStopLoss) {                        
                            const result = await createSellTransaction(holding, tokenQuotes.data, calculatedPNL, processRunCounter, botPrivateKey, botConfig);
                            const txSuccess = result.success;
                            const txTransaction = result.tx;
                            if (!txSuccess && holding.id) {
                                console.warn(`${botConfig.bot_name}|[main]|Failed to sell token ${holding.Token}. Reason: ${result.msg}. Current attempt: ${holding.SellAttempts}. Config: ${tracker_bot_config.max_sell_attempts}`, processRunCounter);
                                await updateSellAttempts(holding.id, processRunCounter);
                                return;
                            }
                            if (txSuccess && txTransaction) {
                               await fetchAndSaveSwapDetails(txTransaction, holding, calculatedPNL, botConfig.bot_wallet_address, processRunCounter);
                            } 
                           
                        }
                        
                    } else {
                        console.log(`${config.name}|[main]|Failed to get token quotes for ${holding.Token}`, processRunCounter);
                    }
                }
            }
        }
        //Should run again after sleep
        await new Promise(resolve => setTimeout(resolve, tracker_bot_config.check_interval * 1000));

    } catch (error) {
        console.error(`${bot_name}|[main]|Error: ${error}`, processRunCounter, error);
        //Should run again after sleep
        await new Promise(resolve => setTimeout(resolve, tracker_bot_config.check_interval * 1000));
    }
}


async function sendCurrentStateNotification(holding: HoldingRecord, calculatedPNL: CalculatedPNL, bot_name: string, processRunCounter: number) {
    const icon = calculatedPNL.pnlPercent >= 0 ? "🟢" : "🔴";
    const hrTradeTime = DateTime.fromMillis(Date.now()).toFormat("HH:mm:ss");
    const tokenLink = `https://solscan.io/token/${holding.Token}`;
    const gmgnLink = `https://gmgn.xyz/token/${holding.Token}`;
    const jsonData = JSON.stringify(calculatedPNL, null, 2);
    const message = `${icon}${hrTradeTime} ${bot_name}| Current state of holding for Token: ${holding.TokenName} with wallet ${holding.WalletPublicKey}\n${tokenLink}\n${gmgnLink}\n${jsonData}\n`;
    console.log(message, processRunCounter, {holding, calculatedPNL}, "send-to-discord");
}


logger.init().then(async () => {
    const tablesInitialized = await initializeDatabaseTables();
    if (!tablesInitialized) {
        console.error(`${config.name}|[main]| ⛔ Failed to initialize database tables. Exiting...`);
        process.exit(1);
    }
    console.log(`${config.name}|[main]| ✅ Database tables initialized successfully`);
    main().catch(async (err) => {
      console.error(err);
      await logger.close();
    });
  });