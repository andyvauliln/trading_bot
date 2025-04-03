export interface SellDecision {
  shouldSell: boolean;
  amountToSell: number;
}


export interface RoutePlanSwapInfo {
  ammKey: string;
  label: string;
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  feeAmount: string;
  feeMint: string;
}

export interface RoutePlanItem {
  swapInfo: RoutePlanSwapInfo;
  percent: number;
}

export interface QuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  swapUsdValue: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: null | {
    amount: string;
    feeBps: number;
  };
  priceImpactPct: string | number;
  routePlan: RoutePlanItem[];
  contextSlot: number;
  timeTaken: number;
}

export interface CalculatedPNL {
  botName: string;
  tokenName: string;
  tokenAddress: string;
  priceImpact: number;
  pnlUSD: number;
  pnlPercent: number;
  priceDiffUSD: number;
  priceDiffPercentUSDC: number;
  initialPriceUSDC: number;
  currentPriceUSDC: number;
  totalInvestmentUSDC: number;
  currentValueUSDC: number;
  tokenBalance: number;
  solanaPrice: number;
  isIncludeFee: boolean;
  slippagePercent: number;
  fees: {
      entryFeeUSDC: number;
      exitFeeUSDC: number;
      entryFeeSOL: number;
      exitFeeSOL: number;
      routeFeesSOL: number;
      platformFeeSOL: number;
  };
  slippageBps: number;
  shouldStopLoss: boolean;
  shouldTakeProfit: boolean;
  botStrategy: TradeStrategy;
  currentStopLossStrategy: StrategyAction;
  currentTakeProfitStrategy: StrategyAction;
  amountToSell: number;
}


// Default trading strategy
export type StrategyAction = {
  type: "stop_loss" | "take_profit";
  threshold: number;
  threshold_unit: "percent"|"price";
  sellAmount: number;
  sellAmount_unit: "percent"|"amount";
  order: number;
  executed: boolean;
};

export type TradeStrategy = {
  stop_loss: StrategyAction[];
  take_profit: StrategyAction[];
};
export interface TrackerBotConfig {
  prio_fee_max_lamports: string;
  prio_level: "low"|"medium"|"high"|"veryHigh";
  slippageBps: string;
  auto_sell: boolean;
  strategy: TradeStrategy;
  include_fees_in_pnl: boolean;
}