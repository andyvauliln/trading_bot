import { config } from "./config"; // Configuration parameters for our bot
import dotenv from "dotenv";
import { getAllHoldings, initializeDatabaseTables, updateSellAttempts } from "./holding.db";
import { CalculatedPNL, HoldingRecord, QuoteResponse } from "./types";
import { DateTime } from "luxon";
import { createSellTransaction, fetchAndSaveSwapDetails, getTokenQuotes } from "./transactions";
import logger from "./logger"; // Import the logger
import { Keypair } from "@solana/web3.js";
import { Wallet } from "@project-serum/anchor";
import bs58 from "bs58";

dotenv.config();

let processRunCounter = 1;

async function main() {
    try {
        const walletPrivateKeys = (process.env.PRIV_KEY_WALLETS || "").split(",").map(key => key.trim()).filter(key => key);
        const walletKeyMap = new Map<string, string>();
        walletPrivateKeys.forEach(privateKey => {
            const wallet = new Wallet(Keypair.fromSecretKey(bs58.decode(privateKey)));
            const publicKey = wallet.publicKey.toString();
            walletKeyMap.set(publicKey, privateKey);
          });
        for (const [publicKey, privateKey] of walletKeyMap.entries()) {
            const holdings = await getAllHoldings("notSkipped", publicKey);
            console.log(`${config.name}|[main]|Found Holdings: ${holdings.length} for wallet ${publicKey}`, processRunCounter, holdings);
            for (const holding of holdings) {
                const tokenQuotes = await getTokenQuotes(holding, processRunCounter);
                console.log(`${config.name}|[main]|Token Quotes: ${tokenQuotes}`, processRunCounter, tokenQuotes);
                
                if (tokenQuotes.success && tokenQuotes.data && config.sell.auto_sell && config.sell.auto_sell === true) {
                    const calculatedPNL = calculatePNL(holding, tokenQuotes.data, config.sell.include_fees_in_pnl);
                    const { stopLoss, takeProfit } = getStopLossAndTakeProfit(holding, tokenQuotes.data);
                    const shouldTakeProfit = calculatedPNL.pnlPercent >= takeProfit;
                    const shouldStopLoss = calculatedPNL.pnlPercent <= stopLoss;

                    await sendCurrentStateNotification(holding, calculatedPNL, processRunCounter);
                    
                    if (shouldTakeProfit || shouldStopLoss) {                        
                        const result = await createSellTransaction(holding, tokenQuotes.data, processRunCounter, privateKey);
                        const txSuccess = result.success;
                        const txTransaction = result.tx;
                        if (!txSuccess && holding.id) {
                            console.warn(`${config.name}|[main]|Failed to sell token ${holding.Token}. Reason: ${result.msg}. Current attempt: ${holding.SellAttempts}. Config: ${config.sell.max_sell_attempts}`, processRunCounter);
                            await updateSellAttempts(holding.id, processRunCounter);
                            return;
                        }
                        if (txSuccess && txTransaction) {
                           await fetchAndSaveSwapDetails(txTransaction, holding, calculatedPNL, publicKey, processRunCounter);
                        } 
                       
                    }
                    
                } else {
                    console.log(`${config.name}|[main]|Failed to get token quotes for ${holding.Token}`, processRunCounter);
                }
            }
        }

    } catch (error) {

    }
}

async function sendCurrentStateNotification(holding: HoldingRecord, calculatedPNL: CalculatedPNL, processRunCounter: number) {
    const icon = calculatedPNL.pnlPercent >= 0 ? "🟢" : "🔴";
    const hrTradeTime = DateTime.fromMillis(Date.now()).toFormat("HH:mm:ss");
    const tokenLink = `https://solscan.io/token/${holding.Token}`;
    const gmgnLink = `https://gmgn.xyz/token/${holding.Token}`;
    const jsonData = JSON.stringify(calculatedPNL, null, 2);
    const message = `${icon}${hrTradeTime}: Current state of holding for Token: ${holding.TokenName} with wallet ${holding.WalletPublicKey}\n${tokenLink}\n${gmgnLink}\n${jsonData}\n`;
    console.log(message, processRunCounter, {holding, calculatedPNL}, "send-to-discord");
  }


function getStopLossAndTakeProfit(holding: HoldingRecord, tokenQuotes: QuoteResponse) {
    return {
        stopLoss: config.sell.stop_loss_percent,
        takeProfit: config.sell.take_profit_percent
    };
}

function calculatePNL(holding: HoldingRecord, tokenQuotes: QuoteResponse, isIncludeFee:boolean): CalculatedPNL {
    const { 
        Balance, 
        SolPaidUSDC, 
        SolFeePaidUSDC, 
        PerTokenPaidUSDC,
        Token
      } = holding;

    const currentPrice = parseFloat(tokenQuotes.swapUsdValue) / parseFloat(tokenQuotes.outAmount);
    let totalCostUSDC = SolPaidUSDC;
  
  // Include fees if flag is set
  if (isIncludeFee) {
    totalCostUSDC += SolFeePaidUSDC;
    
    // Add any platform fees from the quote if they exist
    if (tokenQuotes.platformFee) {
      const platformFeeAmount = parseFloat(tokenQuotes.platformFee.amount || "0");
      totalCostUSDC += platformFeeAmount;
    }
  }
  const currentValueUSDC = Balance * currentPrice;

  const pnlUSD = currentValueUSDC - totalCostUSDC;
  const pnlPercent = totalCostUSDC > 0 ? (pnlUSD / totalCostUSDC) * 100 : 0;
  const priceDiffUSD = currentPrice - PerTokenPaidUSDC;
  const priceDiffPercent = PerTokenPaidUSDC > 0 ? (priceDiffUSD / PerTokenPaidUSDC) * 100 : 0;
  let routeFees = 0;
  if (isIncludeFee && tokenQuotes.routePlan) {
    tokenQuotes.routePlan.forEach(route => {
      if (route.swapInfo && route.swapInfo.feeAmount) {
        routeFees += parseFloat(route.swapInfo.feeAmount);
      }
    });
  }
  return {
    pnlUSD,
    pnlPercent,
    priceDiffUSD,
    priceDiffPercentUSDC: priceDiffPercent,
    initialPriceUSDC: PerTokenPaidUSDC,
    currentPriceUSDC: currentPrice,
    totalInvestmentUSDC: totalCostUSDC,
    currentValueUSDC: currentValueUSDC,
    tokenBalance: Balance,
    tokenAddress: Token,
    tokenName: holding.TokenName,
    fees: {
      solFeeUSDC: isIncludeFee ? SolFeePaidUSDC : 0,
      routeFeesSOL: isIncludeFee ? routeFees : 0,
      platformFeeSOL: isIncludeFee && tokenQuotes.platformFee ? parseFloat(tokenQuotes.platformFee.amount || "0") : 0,
    },
    priceImpact: tokenQuotes.priceImpactPct ? parseFloat(tokenQuotes.priceImpactPct.toString()) : 0,
    slippage: tokenQuotes.slippageBps ? tokenQuotes.slippageBps : 0, // Convert bps to percentage
    currentStopLossPercent: config.sell.stop_loss_percent,
    currentTakeProfitPercent: config.sell.take_profit_percent
  };
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