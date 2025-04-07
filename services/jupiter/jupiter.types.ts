import { TransactionResponse } from "@solana/web3.js";

export type QuoteRequestParams = {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps: string;
  restrictItermediateTokens: boolean;
  excludeDexes?: string;
};


export interface createSellTransactionResponse {
  success: boolean;
  msg: string | null;
  tx: string | null;
}
export type QuoteResult = {
  success: boolean;
  msg: string | null;
  data: QuoteResponse | null;
};

export interface SerializedQuoteResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports: number;
  computeUnitLimit: number;
  prioritizationType: {
    computeBudget: Record<string, unknown>;
  };
  simulationSlot: number;
  dynamicSlippageReport: {
    slippageBps: number;
    otherAmount: number;
    simulatedIncurredSlippageBps: number;
    amplificationRatio: string;
    categoryName: string;
    heuristicMaxSlippageBps: number;
  };
  simulationError: string | null;
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

export type ExcludedDexesParams = {
  botName: string;
  txid: string;
  processRunCounter: number;
};

export type RetryConfig = {
  maxRetries: number;
  retryDelay: number;
  backoffFactor?: number;
  maxDelay?: number;
};

export type SellTransactionResult = {
    success: boolean;
    msg: string | null;
    tx: string | null;
    walletPublicKey: string;
  }

export type TransactionWithErr = TransactionResponse & { err: any }; 