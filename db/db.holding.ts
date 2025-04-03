import { Database } from "sqlite";
import { HoldingRecord} from "./db.types";
import { convertTimestampToISO, getDbConnection } from "./db.utils";
import { db_config } from "./db.config";

const DEFAULT_BOT_NAME = 'db.holding';

// ***************************HOLDINGS TABLE**************************
// Note: createTableHoldings often runs at setup, might not need botName/processRunCounter
export async function createTableHoldings(database: Database): Promise<boolean> {
  const functionName = 'createTableHoldings';
  try {
    await database.exec(`
    CREATE TABLE IF NOT EXISTS holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      Time INTEGER NOT NULL,
      TimeDate TEXT NOT NULL,
      Token TEXT NOT NULL,
      TokenName TEXT NOT NULL,
      Balance REAL NOT NULL,
      SolPaid REAL NOT NULL,
      SolFeePaid REAL NOT NULL,
      SolPaidUSDC REAL NOT NULL,
      SolFeePaidUSDC REAL NOT NULL,
      PerTokenPaidUSDC REAL NOT NULL,
      Slot INTEGER NOT NULL,
      Program TEXT NOT NULL,
      BotName TEXT NOT NULL,
      WalletPublicKey TEXT NOT NULL,
      TxId TEXT,
      SellAttempts INTEGER DEFAULT 0,
      IsSkipped INTEGER DEFAULT 0,
      LastAttemptTime INTEGER,
      LastAttemptTimeDate TEXT
    );
  `);
    console.log(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Holdings table checked/created successfully.`);
    return true;
  } catch (error: any) {
    console.error(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Error creating holdings table`, 0, { error: error.message });
    return false;
  }
}

// ***************************GET ALL HOLDINGS**************************
export async function getAllHoldings(
  filter: 'all' | 'skipped' | 'notSkipped' = 'all',
  walletPublicKey?: string,
  botName?: string,
  processRunCounter: number = 0
): Promise<HoldingRecord[]> {
  let db: Database | null = null;
  const functionName = 'getAllHoldings';
  console.log(`[${botName}]|[${functionName}]|Fetching holdings`, processRunCounter, { filter, walletPublicKey });
  try {
    db = await getDbConnection(db_config.tracker_holdings_path);
    
    let query = 'SELECT * FROM holdings';
    const conditions: string[] = [];
    const params: any[] = []; // Use parameterized queries
    
    if (filter === 'skipped') {
      conditions.push('IsSkipped = 1');
    } else if (filter === 'notSkipped') {
      conditions.push('IsSkipped = 0');
    }

    if(botName) {
      conditions.push('BotName = ?');
      params.push(botName);
    }
    
    if (walletPublicKey) {
      conditions.push('WalletPublicKey = ?');
      params.push(walletPublicKey);
    }
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    const holdings: HoldingRecord[] = await db.all(query, params);
    console.log(`[${botName}]|[${functionName}]|Successfully fetched ${holdings.length} holdings`, processRunCounter);
    return holdings;
  } catch (error) {
    console.error(`[${botName}]|[${functionName}]|Error fetching holdings`, processRunCounter, { error, filter, walletPublicKey });
    throw error;
  } finally {
    if (db) {
      await db.close();
    }
  }
}

// ***************************INSERT HOLDING**************************
export async function insertHolding(holding: HoldingRecord, processRunCounter: number): Promise<void> {
  let db: Database | null = null;
  const functionName = 'insertHolding';
  // Ensure BotName from record is used if available, otherwise use the passed botName
  const effectiveBotName = holding.BotName || DEFAULT_BOT_NAME; 
  
  try {
    db = await getDbConnection(db_config.tracker_holdings_path);

    const { Time, Token, TokenName, Balance, SolPaid, SolFeePaid, SolPaidUSDC, SolFeePaidUSDC, PerTokenPaidUSDC, Slot, Program, WalletPublicKey, TxId } = holding;
    
    const timeDate = convertTimestampToISO(Number(Time));
    
    // Ensure all numeric values are numbers before storing
    await db.run(
      `
    INSERT INTO holdings (Time, TimeDate, Token, TokenName, Balance, SolPaid, SolFeePaid, SolPaidUSDC, SolFeePaidUSDC, PerTokenPaidUSDC, Slot, Program, BotName, WalletPublicKey, TxId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `,
      [
        Number(Time), timeDate, Token, TokenName, Number(Balance), Number(SolPaid), Number(SolFeePaid), 
        Number(SolPaidUSDC), Number(SolFeePaidUSDC), Number(PerTokenPaidUSDC), Number(Slot), 
        Program, effectiveBotName, WalletPublicKey, TxId // Use effectiveBotName here
      ]
    );

    // Log using the standardized format
    console.log(`[${effectiveBotName}]|[${functionName}]|Added New Holding For Monitoring`, processRunCounter, { holding, link: `https://gmgn.ai/sol/token/${Token}` }); 
    // Consider if "send-to-discord" tag needs a more structured approach

  } catch (error) {
    console.error(`[${effectiveBotName}]|[${functionName}]|Error inserting holding`, processRunCounter, { error, holding });
    throw error;
  } finally {
    if (db) {
      await db.close();
    }
  }
}

// ***************************GET HOLDING RECORD**************************
export async function getHoldingRecord(
  token: string,
  botName: string,
  walletPublicKey?: string, // Made walletPublicKey optional here to match usage
  processRunCounter: number = 0
): Promise<HoldingRecord | null> {
  let db: Database | null = null;
  const functionName = 'getHoldingRecord';
  console.log(`[${botName}]|[${functionName}]|Fetching holding record`, processRunCounter, { token, walletPublicKey });

  try {
    db = await getDbConnection(db_config.tracker_holdings_path);

    
    const query = walletPublicKey 
      ? `SELECT * FROM holdings WHERE Token = ? AND WalletPublicKey = ? LIMIT 1;`
      : `SELECT * FROM holdings WHERE Token = ? LIMIT 1;`;

    const params = walletPublicKey ? [token, walletPublicKey] : [token];
    
    const tokenRecord: HoldingRecord | undefined = await db.get(query, params);

    if (!tokenRecord) {
      console.log(`[${botName}]|[${functionName}]|Token not found: ${token}${walletPublicKey ? ` for wallet ${walletPublicKey}` : ''}`, processRunCounter);
      return null;
    }

    console.log(`[${botName}]|[${functionName}]|Successfully fetched holding record`, processRunCounter, { token, walletPublicKey });
    return tokenRecord;

  } catch (error) {
    console.error(`[${botName}]|[${functionName}]|Error fetching holding record`, processRunCounter, { error, token, walletPublicKey });
    throw error;
  } finally {
    if (db) {
      await db.close();
    }
  }
}

// ***************************GET WALLET HOLDINGS**************************
export async function getWalletHoldings(
  walletPublicKey?: string,
  botName: string = DEFAULT_BOT_NAME,
  processRunCounter: number = 0
): Promise<HoldingRecord[]> {
  let db: Database | null = null;
  const functionName = 'getWalletHoldings';
  console.log(`[${botName}]|[${functionName}]|Fetching wallet holdings`, processRunCounter, { walletPublicKey });

  try {
    db = await getDbConnection(db_config.tracker_holdings_path);

    const query = walletPublicKey
      ? `SELECT * FROM holdings WHERE WalletPublicKey = ? ORDER BY Time DESC;`
      : `SELECT * FROM holdings ORDER BY Time DESC;`;
    
    const params = walletPublicKey ? [walletPublicKey] : [];
    
    const holdings: HoldingRecord[] = await db.all(query, params);
    
    console.log(`[${botName}]|[${functionName}]|Successfully fetched ${holdings.length} holdings for wallet`, processRunCounter, { walletPublicKey: walletPublicKey || 'all' });
    return holdings;

  } catch (error) {
    console.error(`[${botName}]|[${functionName}]|Error fetching wallet holdings`, processRunCounter, { error, walletPublicKey });
    throw error;
  } finally {
    if (db) {
      await db.close();
    }
  }
}

// ***************************GET ALL HOLDINGS GROUPED BY WALLET**************************
export async function getAllHoldingsGroupedByWallet(
  options?: {
    walletPublicKey?: string;
    token?: string;
    botName?: string; // Filter by record's BotName
    startTime?: number;
    endTime?: number;
  },
  botName: string = DEFAULT_BOT_NAME, // For logging
  processRunCounter: number = 0     // For logging
): Promise<{ [walletPublicKey: string]: HoldingRecord[] }> {
  let db: Database | null = null;
  const functionName = 'getAllHoldingsGroupedByWallet';
  console.log(`[${botName}]|[${functionName}]|Fetching holdings grouped by wallet`, processRunCounter, { options });

  try {
    db = await getDbConnection(db_config.tracker_holdings_path);

    let query = `SELECT * FROM holdings WHERE 1=1`;
    const params: any[] = [];

    if (options?.walletPublicKey) {
      query += ` AND WalletPublicKey = ?`;
      params.push(options.walletPublicKey);
    }
    if (options?.token) {
      query += ` AND Token = ?`;
      params.push(options.token);
    }
    if (options?.botName) { // Filter by BotName in record
      query += ` AND BotName = ?`;
      params.push(options.botName);
    }
    if (options?.startTime) {
      query += ` AND Time >= ?`;
      params.push(options.startTime);
    }
    if (options?.endTime) {
      query += ` AND Time <= ?`;
      params.push(options.endTime);
    }

    query += ` ORDER BY WalletPublicKey, Time DESC`;

    const holdings: HoldingRecord[] = await db.all(query, params);

    // Group holdings by wallet
    const groupedHoldings: { [walletPublicKey: string]: HoldingRecord[] } = {};
    for (const holding of holdings) {
      if (!groupedHoldings[holding.WalletPublicKey]) {
        groupedHoldings[holding.WalletPublicKey] = [];
      }
      groupedHoldings[holding.WalletPublicKey].push(holding);
    }
    
    console.log(`[${botName}]|[${functionName}]|Successfully fetched and grouped holdings for ${Object.keys(groupedHoldings).length} wallets`, processRunCounter);
    return groupedHoldings;

  } catch (error) {
    console.error(`[${botName}]|[${functionName}]|Error fetching holdings grouped by wallet`, processRunCounter, { error, options });
    throw error;
  } finally {
    if (db) {
      await db.close();
    }
  }
}

// ***************************GET FILTERED HOLDINGS**************************
// Renamed from 'All' to 'getFilteredHoldings'
export async function getFilteredHoldings(
  options?: {
    walletPublicKey?: string;
    token?: string;
    botName?: string; // Filter by record's BotName
    startTime?: number;
    endTime?: number;
    limit?: number;
    offset?: number;
  },
  processRunCounter: number = 0     // For logging
): Promise<HoldingRecord[]> {
  let db: Database | null = null;
  const functionName = 'getFilteredHoldings';
  const effectiveBotName = options?.botName || DEFAULT_BOT_NAME;
  console.log(`[${effectiveBotName}]|[${functionName}]|Fetching filtered holdings`, processRunCounter, { options });

  try {
    db = await getDbConnection(db_config.tracker_holdings_path);

    let query = `SELECT * FROM holdings WHERE 1=1`;
    const params: any[] = [];

    if (options?.walletPublicKey) {
      query += ` AND WalletPublicKey = ?`;
      params.push(options.walletPublicKey);
    }
    if (options?.token) {
      query += ` AND Token = ?`;
      params.push(options.token);
    }
    if (options?.botName) { // Filter by BotName in record
      query += ` AND BotName = ?`;
      params.push(options.botName);
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

    if (options?.limit) {
      query += ` LIMIT ?`;
      params.push(options.limit);

      if (options?.offset) {
        query += ` OFFSET ?`;
        params.push(options.offset);
      }
    }

    const holdings: HoldingRecord[] = await db.all(query, params);
    
    console.log(`[${effectiveBotName}]|[${functionName}]|Successfully fetched ${holdings.length} filtered holdings`, processRunCounter);
    return holdings;

  } catch (error) {
    console.error(`[${effectiveBotName}]|[${functionName}]|Error fetching filtered holdings`, processRunCounter, { error, options });
    throw error;
  } finally {
    if (db) {
      await db.close();
    }
  }
}

// ***************************REMOVE HOLDING**************************
export async function removeHolding(
  tokenMint: string,
  walletPublicKey: string,
  botName: string,
  processRunCounter: number
): Promise<void> {
  let db: Database | null = null;
  const functionName = 'removeHolding';
  
  try {
    db = await getDbConnection(db_config.tracker_holdings_path);
    const result = await db.run(
      `DELETE FROM holdings WHERE Token = ? AND WalletPublicKey = ? AND BotName = ?;`, 
      [tokenMint, walletPublicKey, botName]
    );

    if (result.changes && result.changes > 0) {
      console.log(`[${botName}]|[${functionName}]|Holding removed successfully`, processRunCounter, { tokenMint, walletPublicKey });
    } else {
      console.warn(`[${botName}]|[${functionName}]|Holding not found for removal or already removed`, processRunCounter, { tokenMint, walletPublicKey });
    }
  } catch (error) {
    console.error(`[${botName}]|[${functionName}]|Error removing holding`, processRunCounter, { error, tokenMint, walletPublicKey });
    throw error;
  } finally {
    if (db) {
      await db.close();
    }
  }
}

// ***************************UPDATE SELL ATTEMPTS**************************
export async function updateSellAttempts(
  id: number,
  botName: string,
  processRunCounter: number
): Promise<boolean> {
  let db: Database | null = null;
  const functionName = 'updateSellAttempts';
  
  try {
    db = await getDbConnection(db_config.tracker_holdings_path);
    const currentTime = Math.floor(Date.now() / 1000);
    const currentTimeDate = convertTimestampToISO(currentTime);

    const result = await db.run(
      `UPDATE holdings 
       SET SellAttempts = SellAttempts + 1, LastAttemptTime = ?, LastAttemptTimeDate = ? 
       WHERE id = ?;`, 
      [currentTime, currentTimeDate, id]
    );

    if (result.changes && result.changes > 0) {
      console.log(`[${botName}]|[${functionName}]|Sell attempts updated successfully for holding ID`, processRunCounter, { id });
      return true;
    } else {
      console.warn(`[${botName}]|[${functionName}]|Holding not found for updating sell attempts`, processRunCounter, { id });
      return false;
    }
  } catch (error) {
    console.error(`[${botName}]|[${functionName}]|Error updating sell attempts`, processRunCounter, { error, id });
    throw error; // Re-throw to allow calling function to handle
  } finally {
    if (db) {
      await db.close();
    }
  }
}

// ***************************GET SKIPPED HOLDINGS**************************
export async function getSkippedHoldings(
  walletPublicKey?: string,
  botName: string = DEFAULT_BOT_NAME,
  processRunCounter: number = 0
): Promise<HoldingRecord[]> {
  let db: Database | null = null;
  const functionName = 'getSkippedHoldings';
  console.log(`[${botName}]|[${functionName}]|Fetching skipped holdings`, processRunCounter, { walletPublicKey });

  try {
    db = await getDbConnection(db_config.tracker_holdings_path);
    const query = walletPublicKey 
      ? `SELECT * FROM holdings WHERE IsSkipped = 1 AND WalletPublicKey = ?;`
      : `SELECT * FROM holdings WHERE IsSkipped = 1;`;
    const params = walletPublicKey ? [walletPublicKey] : [];

    const holdings: HoldingRecord[] = await db.all(query, params);
    
    console.log(`[${botName}]|[${functionName}]|Successfully fetched ${holdings.length} skipped holdings`, processRunCounter, { walletPublicKey: walletPublicKey || 'all' });
    return holdings;
  } catch (error) {
    console.error(`[${botName}]|[${functionName}]|Error fetching skipped holdings`, processRunCounter, { error, walletPublicKey });
    throw error;
  } finally {
    if (db) {
      await db.close();
    }
  }
}

// export async function getEnhancedTransactionHistory(
//   dbPath: string,
//   options?: { 
//     offset?: number; 
//     limit?: number; 
//     module?: string;
//     walletPublicKey?: string;
//     startDate?: number;
//     endDate?: number;
//   }
// ): Promise<EnhancedTransactionRecord[]> {
//   const db = await open({
//     filename: dbPath,
//     driver: sqlite3.Database,
//   });

//   try {
//     // First, get all transactions
//     let query = `SELECT * FROM transactions WHERE 1=1`;
//     const params: any[] = [];

//     if (options?.module) {
//       query += ` AND BotName = ?`;
//       params.push(options.module);
//     }

//     if (options?.walletPublicKey) {
//       query += ` AND WalletPublicKey = ?`;
//       params.push(options.walletPublicKey);
//     }

//     if (options?.startDate) {
//       query += ` AND Time >= ?`;
//       params.push(options.startDate);
//     }

//     if (options?.endDate) {
//       query += ` AND Time <= ?`;
//       params.push(options.endDate);
//     }

//     query += ` ORDER BY Time DESC`;

//     if (options?.limit !== undefined) {
//       query += ` LIMIT ?`;
//       params.push(options.limit);
      
//       if (options?.offset !== undefined) {
//         query += ` OFFSET ?`;
//         params.push(options.offset);
//       }
//     }

//     const transactions = await db.all(query, params);

//     // Convert to enhanced transaction records
//     const enhancedTransactions: EnhancedTransactionRecord[] = [...transactions];

//     // For each SELL transaction, try to find matching profit/loss data
//     for (const tx of enhancedTransactions) {
//       if (tx.TransactionType === 'SELL') {
//         // Look up profit/loss record by transaction ID
//         const profitLossRecord = await db.get(
//           `SELECT * FROM profit_loss WHERE TxId = ? LIMIT 1`,
//           [tx.TxId]
//         );

//         if (profitLossRecord) {
//           // Add profit/loss data to the transaction
//           tx.ProfitLossSOL = profitLossRecord.ProfitLossSOL;
//           tx.ProfitLossUSDC = profitLossRecord.ProfitLossUSDC;
//           tx.ROIPercentage = profitLossRecord.ROIPercentage;
//           tx.EntryPriceUSDC = profitLossRecord.EntryPriceUSDC;
//           tx.HoldingTimeSeconds = profitLossRecord.HoldingTimeSeconds;
//           tx.IsTakeProfit = profitLossRecord.IsTakeProfit === 1;
//         }
//       }
//     }

//     return enhancedTransactions;
//   } finally {
//     await db.close();
//   }
// }


