import {SwapEventDetailsResponse} from "../../services/solana-rpc/types"
import {
  QuoteResponse,
  StrategyAction,
  TrackerBotConfig,
  TradeStrategy,
  SellDecision,
  CalculatedPNL
} from "./tacker-bot.types";
import { removeHolding } from "../../db/db.holding";
import { HoldingRecord, TransactionRecord, ProfitLossRecord } from "../../db/db.types";
import { insertTransaction } from "../../db/db.transactions";
import { insertProfitLoss } from "../../db/db.proffit-loss";
import { DateTime } from "luxon";
import { getSolanaPrice } from "../../services/jupiter/jupiter-get-solana-price";
import { getTransactionDetails } from "../../services/solana-rpc/solana-get-transaction-details";


//*********************CALCULTE PNLS*********************

export async function calculatePNL(holding: HoldingRecord, tokenQuotes: QuoteResponse, trackerBotConfig: TrackerBotConfig, solanaPrice: number, bot_name: string, processRunCounter: number): Promise<CalculatedPNL> {
  try {
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

    const calculatedPNL: CalculatedPNL = {
      botName: bot_name,
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
    sendCurrentStateNotification(holding, calculatedPNL, bot_name, processRunCounter);
    return calculatedPNL;
  } catch (error: any) {
    console.error(`[${bot_name}]|[calculatePNL]|Error calculating PNL: ${error.message}`, 0, error);
    throw error;
  }
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

//*********************DATABASE PROCESSING*********************

export async function fetchAndSaveSwapDetails(bot_name:string, tx: string, holding: HoldingRecord, calculatedPNL: CalculatedPNL, walletPublicKey: string, processRunCounter: number): Promise<boolean> {
  try {
    await removeHolding(holding.Token, processRunCounter, walletPublicKey).catch((err) => {
      console.error(`${bot_name}|[fetchAndSaveSwapDetails]| ⛔ Database Error: ${err}`, processRunCounter);
    });
    // Safely access the event information
    const swapTransactionData = await getTransactionDetails(bot_name, tx, processRunCounter);
    if (!swapTransactionData) {
      return false;
    }
    await makeInsertTransaction(bot_name, holding, calculatedPNL, swapTransactionData, walletPublicKey, tx, processRunCounter);
    await makeInsertProfitLoss(bot_name, holding, calculatedPNL, swapTransactionData, tx, processRunCounter, walletPublicKey);
   
    return true;
  } catch (error: any) {
    console.error(`${bot_name}|[fetchAndSaveSwapDetails]| ⛔ Fetch and Save Swap Details Error: ${error.message}`, processRunCounter);
    return false;
  }
}

async function makeInsertTransaction(bot_name: string, holding: HoldingRecord, calculatedPNL: CalculatedPNL,  swapTransactionData: SwapEventDetailsResponse, publicKey: string, txTransaction: string, processRunCounter: number) {
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
      BotName: bot_name,
      WalletPublicKey: publicKey,
      TxId: txTransaction
  }
  await insertTransaction(transactionRecord, processRunCounter).catch((err: any) => {
      console.log(`${bot_name}|[main]| ⛔ Insert Transaction Database Error: ${err}`, processRunCounter);
  });
}

async function makeInsertProfitLoss(bot_name: string, holding: HoldingRecord, calculatedPNL: CalculatedPNL, swapTransactionData: SwapEventDetailsResponse, txTransaction: string, processRunCounter: number, publicKey: string) {
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
      BotName: bot_name,
      TxId: txTransaction,
      ConfigTakeProfit: calculatedPNL.currentTakeProfitStrategy,
      ConfigStopLoss: calculatedPNL.currentStopLossStrategy,
      IsTakeProfit: calculatedPNL.pnlPercent >= 0,
      WalletPublicKey: publicKey
  }
  sendSellNotification(bot_name, holding, calculatedPNL, profitLossRecord, processRunCounter);
  await insertProfitLoss(profitLossRecord, processRunCounter);
}



//*********************DISCORD NOTIFICATIONS*********************

async function sendCurrentStateNotification(holding: HoldingRecord, calculatedPNL: CalculatedPNL, bot_name: string, processRunCounter: number) {
  const icon = calculatedPNL.pnlPercent >= 0 ? "🟢" : "🔴";
  const hrTradeTime = DateTime.fromMillis(Date.now()).toFormat("HH:mm:ss");
  const tokenLink = `https://solscan.io/token/${holding.Token}`;
  const gmgnLink = `https://gmgn.xyz/token/${holding.Token}`;
  const jsonData = JSON.stringify(calculatedPNL, null, 2);
  const message = `${icon}${hrTradeTime} ${bot_name}| Current state of holding for Token: ${holding.TokenName} with wallet ${holding.WalletPublicKey}\n${tokenLink}\n${gmgnLink}\n${jsonData}\n`;
  console.log(message, processRunCounter, {holding, calculatedPNL}, "send-to-discord");
}


async function sendSellNotification(bot_name: string, holding: HoldingRecord, calculatedPNL: CalculatedPNL, profitLossRecord: ProfitLossRecord, processRunCounter: number) {
  const icon = profitLossRecord.IsTakeProfit ? "🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢" : "🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴";
  const actionText = profitLossRecord.IsTakeProfit ? "Take profit" : "Stop loss";
  const hrTradeTime = DateTime.fromMillis(Date.now()).toFormat("HH:mm:ss");
  const txLink = `https://solscan.io/tx/${profitLossRecord.TxId}`;
  const tokenLink = `https://solscan.io/token/${holding.Token}`;
  const gmgnLink = `https://gmgn.xyz/token/${holding.Token}`;
  const jsonData = JSON.stringify(profitLossRecord, null, 2);
  const message = `[${bot_name}]|[sell-notification]| ${icon}\n${hrTradeTime}: ${actionText} for ${holding.TokenName} with wallet ${profitLossRecord.WalletPublicKey}\n${txLink}\n${tokenLink}\n${gmgnLink}\n${jsonData}\n${icon}`;
  console.log(message, processRunCounter, {holding, calculatedPNL, profitLossRecord}, "send-to-discord");
}


