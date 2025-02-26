export interface TelegramChannel {
    username: string;
    description: string;
}

export interface Message {
    id: number;
    date: number;
    message: string;
    channelName: string;
    processed: boolean;
}

export interface AIConfig {
    openrouter_api_key: string;
    initial_model: string;  // Free/cheaper model for initial analysis
    base_url: string;
    temperature: number;
}

export interface RugCheckConfig {
    verbose_log: boolean;
    simulation_mode: boolean;
    allow_mint_authority: boolean;
    allow_not_initialized: boolean;
    allow_freeze_authority: boolean;
    allow_rugged: boolean;
    allow_mutable: boolean;
    block_symbols: string[];
    block_names: string[];
    allow_insider_topholders: boolean;
    max_alowed_pct_topholders: number;
    exclude_lp_from_topholders: boolean;
    min_total_markets: number;
    min_total_lp_providers: number;
    min_total_market_Liquidity: number;
    ignore_pump_fun: boolean;
    max_score: number;
    legacy_not_allowed: string[];
}

export interface TelegramConfig {
    logs_db_path: string;
    verbose_log: boolean;
    environment: string;
    name: string;
    base_url: string;
    messages_db_path: string;
    messages_json_path: string;
    storage_type: string | "sqlite" | "json";
    check_interval: number;
    max_messages_per_channel: number;
    request_timeout: number;
    max_retries: number;
    retry_delay: number;
    rate_limit_delay: number;
    log_level: string;
    channels: TelegramChannel[];
    ai_config: AIConfig;
    rug_check: RugCheckConfig;
    tx: TxConfig;
    swap: SwapConfig;
    sol_mint: string;
}

export interface TxConfig {
    fetch_tx_max_retries: number;
    fetch_tx_initial_delay: number;
    swap_tx_initial_delay: number;
    get_timeout: number;
    concurrent_transactions: number;
    retry_delay: number;
}

export interface SwapConfig {
    verbose_log: boolean;
    prio_fee_max_lamports: number;
    prio_level: string;
    amount: string;
    slippageBps: string;
    db_name_tracker_holdings: string;
    token_not_tradable_400_error_retries: number;
    token_not_tradable_400_error_delay: number;
    is_additional_holding: boolean;
    additional_holding_amount: number;
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

  export interface NewTokenRecord {
    id?: number; // Optional because it's added by the database
    time: number;
    name: string;
    mint: string;
    creator: string;
  }
  
  export interface MintsDataReponse {
    tokenMint?: string;
    solMint?: string;
  }
  
  export interface QuoteResponse {
    data: unknown;
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
  
  export interface NewTokenRecord {
    id?: number; // Optional because it's added by the database
    time: number;
    name: string;
    mint: string;
    creator: string;
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
  