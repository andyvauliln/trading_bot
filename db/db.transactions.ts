import { Database } from 'sqlite';
import { TransactionRecord } from "./db.types";
import { convertTimestampToISO, getDbConnection } from "./db.utils";
import { db_config } from "./db.config";

const DEFAULT_BOT_NAME = 'db.transactions';

/**
 * Insert a new transaction record into the database
 * @param transaction Transaction details to insert
 * @param botName Name of the bot initiating the action
 * @param processRunCounter Process run counter for logging
 * @returns Promise resolving when the operation is complete
 */
export async function insertTransaction(transaction: TransactionRecord, processRunCounter: number): Promise<void> {
  let db: Database | null = null;
  const functionName = 'insertTransaction';
  const effectiveBotName = transaction.BotName || DEFAULT_BOT_NAME;

  try {
    db = await getDbConnection(db_config.tracker_holdings_path);

    const {
      Time,
      Token,
      TokenName,
      TransactionType,
      TokenAmount,
      SolAmount,
      SolFee,
      PricePerTokenUSDC,
      TotalUSDC,
      Slot,
      Program,
      WalletPublicKey,
      TxId
    } = transaction;

    const timeDate = convertTimestampToISO(Number(Time));

    // Ensure all numeric values are numbers before storing
    await db.run(
      `
      INSERT INTO transactions (
        Time, TimeDate, Token, TokenName, TransactionType, TokenAmount, SolAmount,
        SolFee, PricePerTokenUSDC, TotalUSDC, Slot, Program, BotName, WalletPublicKey, TxId
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `,
      [
        Number(Time), timeDate, Token, TokenName, TransactionType, Number(TokenAmount), Number(SolAmount),
        Number(SolFee), Number(PricePerTokenUSDC), Number(TotalUSDC), Number(Slot), Program, effectiveBotName, WalletPublicKey, TxId
      ]
    );

    console.log(`[${effectiveBotName}]|[${functionName}]|Transaction inserted successfully`, processRunCounter, {
      Token,
      TransactionType,
      TokenAmount: Number(TokenAmount),
      PricePerTokenUSDC: Number(PricePerTokenUSDC).toFixed(8),
      TotalUSDC: Number(TotalUSDC).toFixed(8),
      TxId: TxId
    });

  } catch (error) {
    console.error(`[${effectiveBotName}]|[${functionName}]|Error inserting transaction`, processRunCounter, { error, transaction });
    throw error;
  } finally {
    if (db) {
      await db.close();
    }
  }
}

/**
 * Get transaction records with filtering options
 * @param options Filter options
 * @param botName Optional: Name of the bot for logging
 * @param processRunCounter Optional: Process run counter for logging
 * @returns Promise resolving to filtered transaction records
 */
export async function getTransactions(options?: {
  walletPublicKey?: string;
  token?: string;
  transactionType?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
  offset?: number;
  botName?: string;
}, processRunCounter: number = 0): Promise<TransactionRecord[]> {
  let db: Database | null = null;
  const functionName = 'getTransactions';
  const effectiveBotName = options?.botName || DEFAULT_BOT_NAME;
  console.log(`[${effectiveBotName}]|[${functionName}]|Fetching transactions`, processRunCounter, { options });

  try {
    db = await getDbConnection(db_config.tracker_holdings_path);

    let query = `SELECT * FROM transactions WHERE 1=1`;
    const params: any[] = [];

    if (options?.walletPublicKey) {
      query += ` AND WalletPublicKey = ?`;
      params.push(options.walletPublicKey);
    }

    if (options?.token) {
      query += ` AND Token = ?`;
      params.push(options.token);
    }

    if (options?.transactionType) {
      query += ` AND TransactionType = ?`;
      params.push(options.transactionType);
    }

    if (effectiveBotName) {
      query += ` AND BotName = ?`;
      params.push(effectiveBotName);
    }

    if (options?.startTime) {
      query += ` AND Time >= ?`;
      params.push(options.startTime);
    }

    if (options?.endTime) {
      query += ` AND Time <= ?`;
      params.push(options.endTime);
    }

    query += ` ORDER BY Time DESC`;

    if (options?.limit != null) {
      query += ` LIMIT ?`;
      params.push(options.limit);

      if (options?.offset != null) {
        query += ` OFFSET ?`;
        params.push(options.offset);
      }
    }

    const transactions: TransactionRecord[] = await db.all(query, params);
    console.log(`[${effectiveBotName}]|[${functionName}]|Successfully fetched ${transactions.length} transactions`, processRunCounter);
    return transactions;

  } catch (error) {
    console.error(`[${effectiveBotName}]|[${functionName}]|Error fetching transactions`, processRunCounter, { error, options });
    throw error;
  } finally {
    if (db) {
      await db.close();
    }
  }
}

/**
 * Get a transaction by its transaction ID
 * @param txId Transaction ID to search for
 * @param botName Optional: Name of the bot for logging
 * @param processRunCounter Optional: Process run counter for logging
 * @returns Promise resolving to the transaction record or null if not found
 */
export async function getTransactionByTxId(txId: string, processRunCounter: number = 0, botName: string = DEFAULT_BOT_NAME,): Promise<TransactionRecord | null> {
  let db: Database | null = null;
  const functionName = 'getTransactionByTxId';
  console.log(`[${botName}]|[${functionName}]|Fetching transaction by TxId`, processRunCounter, { txId });

  try {
    db = await getDbConnection(db_config.tracker_holdings_path);
    
    const transaction: TransactionRecord | undefined = await db.get(
      `SELECT * FROM transactions WHERE TxId = ? LIMIT 1;`,
      [txId]
    );

    if (transaction) {
      console.log(`[${botName}]|[${functionName}]|Successfully fetched transaction`, processRunCounter, { txId });
    } else {
      console.log(`[${botName}]|[${functionName}]|Transaction not found`, processRunCounter, { txId });
    }
    return transaction || null;

  } catch (error) {
    console.error(`[${botName}]|[${functionName}]|Error fetching transaction by TxId`, processRunCounter, { error, txId });
    throw error;
  } finally {
    if (db) {
      await db.close();
    }
  }
}

/**
 * Get transactions grouped by wallet public key
 * @param options Filter options (module maps to BotName)
 * @param botName Optional: Name of the bot for logging
 * @param processRunCounter Optional: Process run counter for logging
 * @returns Promise resolving to an object mapping wallet keys to transaction lists
 */
export async function getTransactionsGroupedByWallet(options?: {
  botName?: string;
  startDate?: number;
  endDate?: number;
}, processRunCounter: number = 0): Promise<{ [walletPublicKey: string]: TransactionRecord[] }> {
  let db: Database | null = null;
  const functionName = 'getTransactionsGroupedByWallet';
  const effectiveBotName = options?.botName || DEFAULT_BOT_NAME;
  console.log(`[${effectiveBotName}]|[${functionName}]|Fetching transactions grouped by wallet`, processRunCounter, { options });

  try {
    db = await getDbConnection(db_config.tracker_holdings_path);
    
    let query = `SELECT * FROM transactions WHERE 1=1`;
    const params: any[] = [];

    if (options?.botName) {
      query += ` AND BotName = ?`;
      params.push(options.botName);
    }

    if (options?.startDate) {
      query += ` AND Time >= ?`;
      params.push(options.startDate);
    }

    if (options?.endDate) {
      query += ` AND Time <= ?`;
      params.push(options.endDate);
    }

    query += ` ORDER BY WalletPublicKey, Time DESC`;

    const records: TransactionRecord[] = await db.all(query, params);
    
    // Group transactions by wallet
    const groupedTransactions: { [walletPublicKey: string]: TransactionRecord[] } = {};
    for (const record of records) {
      if (!groupedTransactions[record.WalletPublicKey]) {
        groupedTransactions[record.WalletPublicKey] = [];
      }
      groupedTransactions[record.WalletPublicKey].push(record);
    }
    
    console.log(`[${effectiveBotName}]|[${functionName}]|Successfully fetched and grouped transactions for ${Object.keys(groupedTransactions).length} wallets`, processRunCounter);
    return groupedTransactions;

  } catch (error) {
    console.error(`[${effectiveBotName}]|[${functionName}]|Error fetching transactions grouped by wallet`, processRunCounter, { error, options });
    throw error;
  } finally {
    if (db) {
      await db.close();
    }
  }
}

/**
 * Get summary statistics for transactions related to a specific wallet
 * @param walletPublicKey The wallet address
 * @param options Filter options (module maps to BotName)
 * @param botName Optional: Name of the bot for logging
 * @param processRunCounter Optional: Process run counter for logging
 * @returns Promise resolving to wallet transaction statistics
 */
export async function getWalletTransactionStats(walletPublicKey: string, options?: {
  botName?: string;
  startDate?: number;
  endDate?: number;
}, processRunCounter: number = 0): Promise<{
  totalBuyTransactions: number;
  totalSellTransactions: number;
  totalSolSpent: number;
  totalSolReceived: number;
  totalSolFees: number;
  totalUSDCValue: number;
}> {
  let db: Database | null = null;
  const functionName = 'getWalletTransactionStats';
  const effectiveBotName = options?.botName || DEFAULT_BOT_NAME;
  console.log(`[${effectiveBotName}]|[${functionName}]|Fetching wallet transaction stats`, processRunCounter, { walletPublicKey, options });

  try {
    db = await getDbConnection(db_config.tracker_holdings_path);
    
    let query = `
      SELECT 
        SUM(CASE WHEN TransactionType = 'BUY' THEN 1 ELSE 0 END) as totalBuyTransactions,
        SUM(CASE WHEN TransactionType = 'SELL' THEN 1 ELSE 0 END) as totalSellTransactions,
        SUM(CASE WHEN TransactionType = 'BUY' THEN SolAmount ELSE 0 END) as totalSolSpent,
        SUM(CASE WHEN TransactionType = 'SELL' THEN SolAmount ELSE 0 END) as totalSolReceived,
        SUM(SolFee) as totalSolFees,
        SUM(TotalUSDC) as totalUSDCValue
      FROM transactions 
      WHERE WalletPublicKey = ?
    `;
    const params: any[] = [walletPublicKey];

    if (options?.botName) {
      query += ` AND BotName = ?`;
      params.push(options.botName);
    }

    if (options?.startDate) {
      query += ` AND Time >= ?`;
      params.push(options.startDate);
    }

    if (options?.endDate) {
      query += ` AND Time <= ?`;
      params.push(options.endDate);
    }

    const stats = await db.get(query, params);
    
    const result = {
      totalBuyTransactions: stats?.totalBuyTransactions || 0,
      totalSellTransactions: stats?.totalSellTransactions || 0,
      totalSolSpent: stats?.totalSolSpent || 0,
      totalSolReceived: stats?.totalSolReceived || 0,
      totalSolFees: stats?.totalSolFees || 0,
      totalUSDCValue: stats?.totalUSDCValue || 0,
    };
    
    console.log(`[${effectiveBotName}]|[${functionName}]|Successfully fetched wallet transaction stats`, processRunCounter, { walletPublicKey, stats: result });
    return result;

  } catch (error) {
    console.error(`[${effectiveBotName}]|[${functionName}]|Error fetching wallet transaction stats`, processRunCounter, { error, walletPublicKey, options });
    throw error;
  } finally {
    if (db) {
      await db.close();
    }
  }
}

export async function createTableTransactions(database: Database): Promise<boolean> {
  const functionName = 'createTableTransactions';
  try {
    await database.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        Time INTEGER NOT NULL,
        TimeDate TEXT NOT NULL,
        Token TEXT NOT NULL,
        TokenName TEXT NOT NULL,
        TransactionType TEXT NOT NULL,
        TokenAmount REAL NOT NULL,
        SolAmount REAL NOT NULL,
        SolFee REAL NOT NULL,
        PricePerTokenUSDC REAL NOT NULL,
        TotalUSDC REAL NOT NULL,
        Slot INTEGER NOT NULL,
        Program TEXT NOT NULL,
        BotName TEXT NOT NULL,
        WalletPublicKey TEXT NOT NULL,
        TxId TEXT UNIQUE
      );
    `);
    console.log(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Transactions table checked/created successfully.`);
    return true;
  } catch (error: any) {
    console.error(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Error creating transactions table`, 0, { error: error.message });
    return false;
  }
}