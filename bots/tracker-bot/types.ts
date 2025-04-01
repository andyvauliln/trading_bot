export interface MintsDataReponse {
  tokenMint?: string;
  solMint?: string;
}

export interface PoolSizeData {
  value: number;
  change: number;
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
  currentStopLossPercent: number;
  currentTakeProfitPercent: number;
}


export interface TransactionRecord {
  id?: number;
  Time: number;
  TimeDate?: string;
  Token: string;
  TokenName: string;
  TransactionType: string;
  TokenAmount: number;
  SolAmount: number;
  SolFee: number;
  PricePerTokenUSDC: number;
  TotalUSDC: number;
  Slot: number;
  Program: string;
  BotName: string;
  WalletPublicKey: string;
  TxId: string;
}

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

export interface RugResponseExtended {
  mint: string;
  tokenProgram: string;
  creator: string;
  token: {
    mintAuthority: string | null;
    supply: number;
    decimals: number;
    isInitialized: boolean;
    freezeAuthority: string | null;
  };
  token_extensions: unknown | null;
  tokenMeta: {
    name: string;
    symbol: string;
    uri: string;
    mutable: boolean;
    updateAuthority: string;
  };
  topHolders: {
    address: string;
    amount: number;
    decimals: number;
    pct: number;
    uiAmount: number;
    uiAmountString: string;
    owner: string;
    insider: boolean;
  }[];
  freezeAuthority: string | null;
  mintAuthority: string | null;
  risks: {
    name: string;
    value: string;
    description: string;
    score: number;
    level: string;
  }[];
  score: number;
  fileMeta: {
    description: string;
    name: string;
    symbol: string;
    image: string;
  };
  lockerOwners: Record<string, unknown>;
  lockers: Record<string, unknown>;
  lpLockers: unknown | null;
  markets: {
    pubkey: string;
    marketType: string;
    mintA: string;
    mintB: string;
    mintLP: string;
    liquidityA: string;
    liquidityB: string;
  }[];
  totalMarketLiquidity: number;
  totalLPProviders: number;
  rugged: boolean;
}

export interface WebSocketRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params: unknown[];
}

interface TransactionDetailsResponse {
  description: string;
  type: string;
  source: string;
  fee: number;
  feePayer: string;
  signature: string;
  slot: number;
  timestamp: number;
  tokenTransfers: {
    fromTokenAccount: string;
    toTokenAccount: string;
    fromUserAccount: string;
    toUserAccount: string;
    tokenAmount: number | string;
    mint: string;
    tokenStandard: string;
  }[];
  nativeTransfers: {
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }[];
  accountData: {
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges: {
      userAccount: string;
      tokenAccount: string;
      rawTokenAmount: {
        tokenAmount: string;
        decimals: number;
      };
      mint: string;
    }[];
  }[];
  transactionError: string | null;
  instructions: {
    accounts: string[];
    data: string;
    programId: string;
    innerInstructions: {
      accounts: string[];
      data: string;
      programId: string;
    }[];
  }[];
  events: {
    swap: {
      nativeInput: {
        account: string;
        amount: string;
      } | null;
      nativeOutput: {
        account: string;
        amount: string;
      } | null;
      tokenInputs: {
        userAccount: string;
        tokenAccount: string;
        rawTokenAmount: {
          tokenAmount: string;
          decimals: number;
        };
        mint: string;
      }[];
      tokenOutputs: {
        userAccount: string;
        tokenAccount: string;
        rawTokenAmount: {
          tokenAmount: string;
          decimals: number;
        };
        mint: string;
      }[];
      nativeFees: {
        account: string;
        amount: string;
      }[];
      tokenFees: {
        userAccount: string;
        tokenAccount: string;
        rawTokenAmount: {
          tokenAmount: string;
          decimals: number;
        };
        mint: string;
      }[];
      innerSwaps: {
        tokenInputs: {
          fromTokenAccount: string;
          toTokenAccount: string;
          fromUserAccount: string;
          toUserAccount: string;
          tokenAmount: number;
          mint: string;
          tokenStandard: string;
        }[];
        tokenOutputs: {
          fromTokenAccount: string;
          toTokenAccount: string;
          fromUserAccount: string;
          toUserAccount: string;
          tokenAmount: number;
          mint: string;
          tokenStandard: string;
        }[];
        tokenFees: {
          userAccount: string;
          tokenAccount: string;
          rawTokenAmount: {
            tokenAmount: string;
            decimals: number;
          };
          mint: string;
        }[];
        nativeFees: {
          account: string;
          amount: string;
        }[];
        programInfo: {
          source: string;
          account: string;
          programName: string;
          instructionName: string;
        };
      }[];
    };
  };
}

export interface SwapEventDetailsResponse {
  programInfo: {
    source: string;
    account: string;
    programName: string;
    instructionName: string;
  };
  tokenInputs: Array<{
    fromTokenAccount: string;
    toTokenAccount: string;
    fromUserAccount: string;
    toUserAccount: string;
    tokenAmount: number;
    mint: string;
    tokenStandard: string;
  }>;
  tokenOutputs: Array<{
    fromTokenAccount: string;
    toTokenAccount: string;
    fromUserAccount: string;
    toUserAccount: string;
    tokenAmount: number;
    mint: string;
    tokenStandard: string;
  }>;
  fee: number;
  slot: number;
  timestamp: number;
  description: string;
}

export interface HoldingRecord {
  id?: number; // Optional because it's added by the database
  Time: number;
  TimeDate?: string;
  Token: string;
  TokenName: string;
  Balance: number;
  SolPaid: number;
  SolFeePaid: number;
  SolPaidUSDC: number;
  SolFeePaidUSDC: number;
  PerTokenPaidUSDC: number;
  Slot: number;
  Program: string;
  BotName: string;
  WalletPublicKey: string;
  TxId: string;
  SellAttempts?: number;
  IsSkipped?: number;
  LastAttemptTime?: number;
  LastAttemptTimeDate?: string;
}

export interface NewTokenRecord {
  id?: number;
  time: number;
  timeDate?: string;
  name: string;
  mint: string;
  creator: string;
  program: string;
  supply: number;
  decimals: number;
  rug_conditions: string;
  tokenReport: string;
}

export interface createSellTransactionResponse {
  success: boolean;
  msg: string | null;
  tx: string | null;
}

export interface LastPriceDexReponse {
  schemaVersion: string;
  pairs: {
    chainId: string;
    dexId: string;
    url: string;
    pairAddress: string;
    labels?: string[];
    baseToken: {
      address: string;
      name: string;
      symbol: string;
    };
    quoteToken: {
      address: string;
      name: string;
      symbol: string;
    };
    priceNative: string;
    priceUsd: string;
    txns: {
      m5: { buys: number; sells: number };
      h1: { buys: number; sells: number };
      h6: { buys: number; sells: number };
      h24: { buys: number; sells: number };
    };
    volume: {
      h24: number;
      h6: number;
      h1: number;
      m5: number;
    };
    priceChange: {
      m5: number;
      h1: number;
      h6: number;
      h24: number;
    };
    liquidity: {
      usd: number;
      base: number;
      quote: number;
    };
    fdv: number;
    marketCap: number;
    pairCreatedAt: number;
    info: {
      imageUrl: string;
      header: string;
      openGraph: string;
      websites?: { label: string; url: string }[];
      socials: { type: string; url: string }[];
    };
  }[];
}
// Update to reflect an array of transactions
export type TransactionDetailsResponseArray = TransactionDetailsResponse[];

export interface ProfitLossRecord {
  id?: number;                    // Optional because it's added by the database
  Time: number;                   // Timestamp of the trade exit
  TimeDate?: string;             // ISO UTC date string of trade exit
  EntryTime: number;             // When we entered the position
  EntryTimeDate?: string;        // ISO UTC date string of entry time
  Token: string;                 // Token mint address
  TokenName: string;             // Token name for readability
  EntryBalance: number;          // Initial token amount
  ExitBalance: number;           // Final token amount sold
  EntrySolPaid: number;         // SOL paid to enter position
  ExitSolReceived: number;      // SOL received from exit
  TotalSolFees: number;         // Total SOL paid in fees (entry + exit)
  ProfitLossSOL: number;        // Profit/Loss in SOL
  ProfitLossUSDC: number;       // Profit/Loss in USDC
  ROIPercentage: number;        // Return on Investment percentage
  ProfitLossSOLWithFees: number; // Profit/Loss in SOL including fees
  ProfitLossUSDCWithFees: number; // Profit/Loss in USDC including fees
  ROIPercentageWithFees: number; // Return on Investment percentage including fees
  EntryPriceUSDC: number;       // Entry price in USDC
  ExitPriceUSDC: number;        // Exit price in USDC
  HoldingTimeSeconds: number;   // How long we held the position
  Slot: number;                 // Blockchain slot at exit
  Program: string;              // DEX program used
  BotName: string;              // Bot that executed the trade
  IsTakeProfit: boolean;       // Whether the trade was a take-profit
  WalletPublicKey: string;     // Added wallet public key field
  TxId: string;               // Transaction ID (signature)
  ConfigTakeProfit: number;   // Take profit percentage from config
  ConfigStopLoss: number;    // Stop loss percentage from config
}
