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
      LastAttemptTimeDate TEXT,
      LamportsBalance TEXT,
      Decimals INTEGER DEFAULT 9
    );
  `);
    console.log(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Holdings table checked/created successfully.`);
    return true;
  } catch (error: any) {
    console.error(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Error creating holdings table`, 0, { error: error.message });
    return false;
  }
}

// ***************************UPDATE HOLDINGS SCHEMA**************************
export async function updateHoldingsSchema(botName: string = DEFAULT_BOT_NAME, processRunCounter: number = 0): Promise<boolean> {
  let db: Database | null = null;
  const functionName = 'updateHoldingsSchema';
  
  try {
    db = await getDbConnection(db_config.tracker_holdings_path);
    
    // Check if LamportsBalance column exists
    const tableInfo = await db.all(`PRAGMA table_info(holdings);`);
    const lamportsBalanceExists = tableInfo.some(column => column.name === 'LamportsBalance');
    const decimalsExists = tableInfo.some(column => column.name === 'Decimals');
    
    // Add missing columns if they don't exist
    if (!lamportsBalanceExists) {
      console.log(`[${botName}]|[${functionName}]|Adding LamportsBalance column to holdings table`, processRunCounter);
      await db.exec(`ALTER TABLE holdings ADD COLUMN LamportsBalance TEXT;`);
    }
    
    if (!decimalsExists) {
      console.log(`[${botName}]|[${functionName}]|Adding Decimals column to holdings table`, processRunCounter);
      await db.exec(`ALTER TABLE holdings ADD COLUMN Decimals INTEGER DEFAULT 9;`);
    }
    
    console.log(`[${botName}]|[${functionName}]|Holdings table schema updated successfully`, processRunCounter);
    return true;
  } catch (error) {
    console.error(`[${botName}]|[${functionName}]|Error updating holdings table schema`, processRunCounter, { error });
    return false;
  } finally {
    if (db) {
      await db.close();
    }
  }
}

// ***************************GET ALL HOLDINGS**************************
export async function getAllHoldings(
  filter: 'all' | 'skipped' | 'notSkipped' = 'all',
  walletPublicKey?: string,
  processRunCounter: number = 0,
  maxAttempts?: number,
  botName?: string,
): Promise<HoldingRecord[]> {
  let db: Database | null = null;
  const functionName = 'getAllHoldings';
  const effectiveBotName = botName || DEFAULT_BOT_NAME;
  console.log(`[${effectiveBotName}]|[${functionName}]|Fetching holdings`, processRunCounter, { filter, walletPublicKey });
  try {
    db = await getDbConnection(db_config.tracker_holdings_path);
    
    let query = 'SELECT * FROM holdings';
    const conditions: string[] = [];
    const params: any[] = []; // Use parameterized queries
    
    if (filter === 'skipped') {
      conditions.push('IsSkipped = 1');
    } else if (filter === 'notSkipped') {
      conditions.push(`(IsSkipped = 0${maxAttempts ? ` AND SellAttempts < ${maxAttempts}` : ''})`);
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
    console.log(`[${effectiveBotName}]|[${functionName}]|Query: ${query}`, processRunCounter);

    const holdings: HoldingRecord[] = await db.all(query, params);
    console.log(`[${effectiveBotName}]|[${functionName}]|Successfully fetched ${holdings.length} holdings`, processRunCounter);
    return holdings;
  } catch (error) {
    console.error(`[${effectiveBotName}]|[${functionName}]|Error fetching holdings`, processRunCounter, { error, filter, walletPublicKey });
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
    INSERT INTO holdings (Time, TimeDate, Token, TokenName, Balance, SolPaid, SolFeePaid, SolPaidUSDC, SolFeePaidUSDC, PerTokenPaidUSDC, Slot, Program, BotName, WalletPublicKey, TxId, LamportsBalance, Decimals)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
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

    
    let query = walletPublicKey 
      ? `SELECT * FROM holdings WHERE Token = ? AND WalletPublicKey = ?;`
      : `SELECT * FROM holdings WHERE Token = ?;`;

    let params = walletPublicKey ? [token, walletPublicKey] : [token];
    if(botName) {
      query += ` AND BotName = ?`;
      params.push(botName);
    }

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
  walletPublicKey: string,
  botName: string = DEFAULT_BOT_NAME,
  processRunCounter: number = 0
): Promise<HoldingRecord[]> {
  let db: Database | null = null;
  const functionName = 'getWalletHoldings';
  console.log(`[${botName}]|[${functionName}]|Fetching wallet holdings`, processRunCounter, { walletPublicKey });

  try {
    db = await getDbConnection(db_config.tracker_holdings_path);

    let query = walletPublicKey
      ? `SELECT * FROM holdings WHERE WalletPublicKey = ? ORDER BY Time DESC;`
      : `SELECT * FROM holdings ORDER BY Time DESC;`;
    
    let params = walletPublicKey ? [walletPublicKey] : [];  
    if(botName) {
      query += ` AND BotName = ?`;
      params.push(botName);
    }
    
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
  processRunCounter: number = 0     // For logging
): Promise<{ [walletPublicKey: string]: HoldingRecord[] }> {
  let db: Database | null = null;
  const functionName = 'getAllHoldingsGroupedByWallet';
  const effectiveBotName = options?.botName || DEFAULT_BOT_NAME;
  console.log(`[${effectiveBotName}]|[${functionName}]|Fetching holdings grouped by wallet`, processRunCounter, { options });

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
    
    console.log(`[${effectiveBotName}]|[${functionName}]|Successfully fetched and grouped holdings for ${Object.keys(groupedHoldings).length} wallets`, processRunCounter);
    return groupedHoldings;

  } catch (error) {
    console.error(`[${effectiveBotName}]|[${functionName}]|Error fetching holdings grouped by wallet`, processRunCounter, { error, options });
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

// ***************************UPDATE HOLDING**************************
export async function updateHolding(
  id: number,
  holdingData: Partial<HoldingRecord>,
  botName: string,
  processRunCounter: number = 0
): Promise<boolean> {
  let db: Database | null = null;
  const functionName = 'updateHolding';
  
  try {
    db = await getDbConnection(db_config.tracker_holdings_path);
    
    // Generate dynamic SQL based on the fields provided in holdingData
    const updateFields: string[] = [];
    const params: any[] = [];
    
    // Skip id and add all other provided fields to the update statement
    Object.entries(holdingData).forEach(([key, value]) => {
      if (key !== 'id' && value !== undefined) {
        updateFields.push(`${key} = ?`);
        params.push(value);
      }
    });
    
    // If TimeDate needs update based on Time
    if (holdingData.Time && !holdingData.TimeDate) {
      updateFields.push('TimeDate = ?');
      params.push(convertTimestampToISO(Number(holdingData.Time)));
    }
    
    // If no fields to update, return early
    if (updateFields.length === 0) {
      console.warn(`[${botName}]|[${functionName}]|No fields to update for holding ID`, processRunCounter, { id });
      return false;
    }
    
    // Add the ID as the last parameter for the WHERE clause
    params.push(id);
    
    const query = `UPDATE holdings SET ${updateFields.join(', ')} WHERE id = ?;`;
    const result = await db.run(query, params);
    
    if (result.changes && result.changes > 0) {
      console.log(`[${botName}]|[${functionName}]|Holding updated successfully`, processRunCounter, { id, updatedFields: Object.keys(holdingData) });
      return true;
    } else {
      console.warn(`[${botName}]|[${functionName}]|Holding not found for update or no changes made`, processRunCounter, { id });
      return false;
    }
  } catch (error) {
    console.error(`[${botName}]|[${functionName}]|Error updating holding`, processRunCounter, { error, id, holdingData });
    throw error;
  } finally {
    if (db) {
      await db.close();
    }
  }
}

// ***************************UPDATE HOLDING FIELD**************************
export async function updateHoldingField<K extends keyof HoldingRecord>(
  id: number,
  fieldName: K,
  fieldValue: HoldingRecord[K],
  botName: string,
  processRunCounter: number = 0
): Promise<boolean> {
  let db: Database | null = null;
  const functionName = 'updateHoldingField';
  
  try {
    db = await getDbConnection(db_config.tracker_holdings_path);
    
    // Special handling for Time field to also update TimeDate
    if (fieldName === 'Time' as K) {
      const timeDate = convertTimestampToISO(Number(fieldValue));
      const result = await db.run(
        `UPDATE holdings SET Time = ?, TimeDate = ? WHERE id = ?;`, 
        [fieldValue, timeDate, id]
      );
      
      if (result.changes && result.changes > 0) {
        console.log(`[${botName}]|[${functionName}]|Time and TimeDate updated successfully`, processRunCounter, { id, time: fieldValue, timeDate });
        return true;
      }
    } else {
      // For all other fields
      const query = `UPDATE holdings SET ${fieldName} = ? WHERE id = ?;`;
      const result = await db.run(query, [fieldValue, id]);
      
      if (result.changes && result.changes > 0) {
        console.log(`[${botName}]|[${functionName}]|Field ${String(fieldName)} updated successfully`, processRunCounter, { id, [fieldName]: fieldValue });
        return true;
      }
    }
    
    console.warn(`[${botName}]|[${functionName}]|Holding not found for update or no changes made`, processRunCounter, { id, fieldName, fieldValue });
    return false;
  } catch (error) {
    console.error(`[${botName}]|[${functionName}]|Error updating holding field`, processRunCounter, { error, id, fieldName, fieldValue });
    throw error;
  } finally {
    if (db) {
      await db.close();
    }
  }
}

// ***************************UPDATE HOLDING BY TOKEN**************************
export async function updateHoldingByToken(
  token: string,
  walletPublicKey: string,
  holdingData: Partial<HoldingRecord>,
  botName: string,
  processRunCounter: number = 0
): Promise<boolean> {
  let db: Database | null = null;
  const functionName = 'updateHoldingByToken';
  
  try {
    db = await getDbConnection(db_config.tracker_holdings_path);
    
    // Generate dynamic SQL based on the fields provided in holdingData
    const updateFields: string[] = [];
    const params: any[] = [];
    
    // Skip id and add all other provided fields to the update statement
    Object.entries(holdingData).forEach(([key, value]) => {
      if (key !== 'id' && key !== 'Token' && key !== 'WalletPublicKey' && value !== undefined) {
        updateFields.push(`${key} = ?`);
        params.push(value);
      }
    });
    
    // If TimeDate needs update based on Time
    if (holdingData.Time && !holdingData.TimeDate) {
      updateFields.push('TimeDate = ?');
      params.push(convertTimestampToISO(Number(holdingData.Time)));
    }
    
    // If no fields to update, return early
    if (updateFields.length === 0) {
      console.warn(`[${botName}]|[${functionName}]|No fields to update for token`, processRunCounter, { token, walletPublicKey });
      return false;
    }
    
    // Add parameters for WHERE clause
    params.push(token);
    params.push(walletPublicKey);
    if (botName) {
      params.push(botName);
    }
    
    const whereClause = botName
      ? 'WHERE Token = ? AND WalletPublicKey = ? AND BotName = ?'
      : 'WHERE Token = ? AND WalletPublicKey = ?';
    
    const query = `UPDATE holdings SET ${updateFields.join(', ')} ${whereClause};`;
    const result = await db.run(query, params);
    
    if (result.changes && result.changes > 0) {
      console.log(`[${botName}]|[${functionName}]|Holding updated successfully by token`, processRunCounter, { 
        token, 
        walletPublicKey,
        updatedFields: Object.keys(holdingData)
      });
      return true;
    } else {
      console.warn(`[${botName}]|[${functionName}]|Holding not found for update or no changes made`, processRunCounter, { 
        token, 
        walletPublicKey
      });
      return false;
    }
  } catch (error) {
    console.error(`[${botName}]|[${functionName}]|Error updating holding by token`, processRunCounter, { 
      error, 
      token, 
      walletPublicKey, 
      holdingData 
    });
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
  currentAttempt: number,
  maxAttempts: number,
  token: string,
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
      console.log(`[${botName}]|[${functionName}]|Sell attempts updated successfully for holding ID ${id}, Token ${token} Current Attempt ${currentAttempt}, Max Attempts ${maxAttempts}`, processRunCounter, { id, currentAttempt, maxAttempts });
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

// ***************************UPDATE HOLDING IS SKIPPED**************************
export async function updateHoldingIsSkipped(
  id: number,
  isSkipped: boolean,
  botName: string,
  processRunCounter: number = 0
): Promise<boolean> {
  let db: Database | null = null;
  const functionName = 'updateHoldingIsSkipped';
  
  try {
    db = await getDbConnection(db_config.tracker_holdings_path);
    
    // Convert boolean to 0/1 for SQLite
    const isSkippedValue = isSkipped ? 1 : 0;
    
    const result = await db.run(
      `UPDATE holdings SET IsSkipped = ? WHERE id = ?;`, 
      [isSkippedValue, id]
    );

    if (result.changes && result.changes > 0) {
      console.log(`[${botName}]|[${functionName}]|Holding IsSkipped status updated to ${isSkipped}`, processRunCounter, { id });
      return true;
    } else {
      console.warn(`[${botName}]|[${functionName}]|Holding not found or IsSkipped status already set to ${isSkipped}`, processRunCounter, { id });
      return false;
    }
  } catch (error) {
    console.error(`[${botName}]|[${functionName}]|Error updating holding IsSkipped status`, processRunCounter, { error, id, isSkipped });
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


