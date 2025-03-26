import * as sqlite3 from "sqlite3";
import { open } from "sqlite";
import { ProfitLossRecord, TransactionRecord } from "../tracker-bot/types";

/**
 * Represents a transaction with optional profit/loss data
 */
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
 * Get all transactions with profit/loss data added to sell transactions
 * 
 * @param dbPath Path to the SQLite database
 * @param options Filter options
 * @returns Enhanced transaction records with profit/loss data
 */
export async function getEnhancedTransactionHistory(
  dbPath: string,
  options?: { 
    offset?: number; 
    limit?: number; 
    module?: string;
    walletPublicKey?: string;
    startDate?: number;
    endDate?: number;
  }
): Promise<EnhancedTransactionRecord[]> {
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  try {
    // First, get all transactions
    let query = `SELECT * FROM transactions WHERE 1=1`;
    const params: any[] = [];

    if (options?.module) {
      query += ` AND BotName = ?`;
      params.push(options.module);
    }

    if (options?.walletPublicKey) {
      query += ` AND WalletPublicKey = ?`;
      params.push(options.walletPublicKey);
    }

    if (options?.startDate) {
      query += ` AND Time >= ?`;
      params.push(options.startDate);
    }

    if (options?.endDate) {
      query += ` AND Time <= ?`;
      params.push(options.endDate);
    }

    query += ` ORDER BY Time DESC`;

    if (options?.limit !== undefined) {
      query += ` LIMIT ?`;
      params.push(options.limit);
      
      if (options?.offset !== undefined) {
        query += ` OFFSET ?`;
        params.push(options.offset);
      }
    }

    const transactions = await db.all(query, params);

    // Convert to enhanced transaction records
    const enhancedTransactions: EnhancedTransactionRecord[] = [...transactions];

    // For each SELL transaction, try to find matching profit/loss data
    for (const tx of enhancedTransactions) {
      if (tx.TransactionType === 'SELL') {
        // Look up profit/loss record by transaction ID
        const profitLossRecord = await db.get(
          `SELECT * FROM profit_loss WHERE TxId = ? LIMIT 1`,
          [tx.TxId]
        );

        if (profitLossRecord) {
          // Add profit/loss data to the transaction
          tx.ProfitLossSOL = profitLossRecord.ProfitLossSOL;
          tx.ProfitLossUSDC = profitLossRecord.ProfitLossUSDC;
          tx.ROIPercentage = profitLossRecord.ROIPercentage;
          tx.EntryPriceUSDC = profitLossRecord.EntryPriceUSDC;
          tx.HoldingTimeSeconds = profitLossRecord.HoldingTimeSeconds;
          tx.IsTakeProfit = profitLossRecord.IsTakeProfit === 1;
        }
      }
    }

    return enhancedTransactions;
  } finally {
    await db.close();
  }
}

// Make sure this file is properly exported as a module
export default {
  getEnhancedTransactionHistory,
  // EnhancedTransactionRecord is exported via the interface declaration above
}; 