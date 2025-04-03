import { StrategyAction } from "../bots/tracker-bot/tacker-bot.types";
import { DateTime } from 'luxon'; // Import DateTime for InsertHistoricalDataDetails

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
    ConfigTakeProfit: StrategyAction;   // Take profit percentage from config
    ConfigStopLoss: StrategyAction;    // Stop loss percentage from config
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
    bot_name: string;
    tokenReport: string;
  }
  
  export interface BotConfig {
    id?: number;
    bot_name: string;
    bot_type: string;
    bot_version: string;
    bot_description: string;
    bot_author_wallet_address: string;
    send_notifications_to_discord: boolean;
    is_enabled: boolean;
    bot_data: object;
    updated_at?: number;
    created_at?: number;
    bot_wallet_address: string;
  }
  
// Types for Historical Data

/**
 * Represents a record retrieved from the historical_data table.
 */
export interface HistoricalDataRecord {
  id?: number; // Optional: Auto-incremented by DB
  Account: string;
  Token: string;
  Symbol: string;
  TokenName: string;
  Amount: number;
  USDPrice: number;
  Time: number; // Milliseconds timestamp
  DateTime: string; // ISO 8601 string representation
}

/**
 * Represents the data required to insert a new historical data record.
 */
export interface InsertHistoricalDataDetails {
  account: string;
  token: string;
  symbol: string;
  tokenName: string;
  amount: number;
  usdPrice: number;
  time: DateTime; // Use Luxon DateTime object for input
}
  
//TODO: REMOVE IT
export interface EnhancedTransactionRecord extends TransactionRecord {
  // Profit/Loss data (only present for SELL transactions)
  ProfitLossSOL?: number;
  ProfitLossUSDC?: number;
  ROIPercentage?: number;
  EntryPriceUSDC?: number;
  HoldingTimeSeconds?: number;
  IsTakeProfit?: boolean;
}

/**
 * Represents a log entry in the database
 */
export interface LogEntry {
  id?: number;
  date: string;
  time: string;
  run_prefix: string;
  full_message: string;
  message: string;
  module: string;
  function: string;
  type: 'info' | 'error' | 'warn';
  data: string | null;
  cycle: number;
  tag: string;
}