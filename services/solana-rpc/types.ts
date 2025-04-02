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

  export interface TransactionDetailsResponse {
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