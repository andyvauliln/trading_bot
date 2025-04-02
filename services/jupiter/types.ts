import { TransactionResponse } from "@solana/web3.js";

export type QuoteRequestParams = {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps: number;
  restrictItermediateTokens: boolean;
  excludeDexes?: string;
};

export type QuoteResult = {
  success: boolean;
  msg: string | null;
  data: QuoteResponse | null;
};

export type QuoteResponse = {
  // Add specific quote response fields here based on Jupiter API response
  [key: string]: any;
};

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