import * as sqlite3 from "sqlite3";
import { open } from "sqlite";
import { config } from "./config";
import { HoldingRecord, NewTokenRecord, ProfitLossRecord, TransactionRecord } from "./types";
import { makeTokenScreenshotAndSendToDiscord } from "../../gmgn_api/make_token_screen-shot";
import { EnhancedTransactionRecord, getEnhancedTransactionHistory as getEnhancedTxHistoryFromUtil } from "../../common/utils/trade-history";

/**
 * Helper function to convert timestamps to ISO date strings
 * This handles both milliseconds and seconds timestamp formats
 * @param timestamp The timestamp to convert
 * @returns ISO date string
 */
function convertTimestampToISO(timestamp: number): string {
  // If timestamp represents seconds (Unix timestamp), convert to ms
  // We assume timestamps before year 2001 (timestamp < 1000000000000) are in seconds
  const timeMs = timestamp < 1000000000000 ? timestamp * 1000 : timestamp;
  return new Date(timeMs).toISOString();
}

// Function to initialize all database tables
export async function initializeDatabaseTables(): Promise<boolean> {
  try {
    const db = await open({
      filename: config.db_name_tracker_holdings,
      driver: sqlite3.Database,
    });

    // Create all tables
    const holdingsTableCreated = await createTableHoldings(db);
    const tokensTableCreated = await createTableNewTokens(db);
    const profitLossTableCreated = await createTableProfitLoss(db);
    const transactionsTableCreated = await createTableTransactions(db);  // Add this line

    await db.close();

    // Return true only if all tables were created successfully
    return holdingsTableCreated && tokensTableCreated && 
           profitLossTableCreated && transactionsTableCreated;  // Update this line
  } catch (error: any) {
    console.error(`${config.name}|[initializeDatabaseTables]| Error initializing database tables: ${error.message}`);
    return false;
  }
}


// ***************************HOLDINGS TABLE**************************
export async function createTableHoldings(database: any): Promise<boolean> {
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
    return true;
  } catch (error: any) {
    return false;
  }
}

// ***************************GET ALL HOLDINGS**************************
export async function getAllHoldings(filter: 'all' | 'skipped' | 'notSkipped' = 'all', walletPublicKey?: string): Promise<HoldingRecord[]> {
  const db = await open({
    filename: config.db_name_tracker_holdings,
    driver: sqlite3.Database,
  });
  
  // Create Table if not exists
  const holdingsTableExist = await createTableHoldings(db);
  if (!holdingsTableExist) {
    await db.close();
    return [];
  }

  let query = 'SELECT * FROM holdings';
  const conditions: string[] = [];
  
  if (filter === 'skipped') {
    conditions.push('IsSkipped = 1');
  } else if (filter === 'notSkipped') {
    conditions.push('IsSkipped = 0');
  }
  
  if (walletPublicKey) {
    conditions.push(`WalletPublicKey = '${walletPublicKey}'`);
  }
  
  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  const holdings = await db.all(query);
  await db.close();
  return holdings;
}

// ***************************INSERT HOLDING**************************

export async function insertHolding(holding: HoldingRecord, processRunCounter: number) {
  const db = await open({
    filename: config.db_name_tracker_holdings,
    driver: sqlite3.Database,
  });

  // Create Table if not exists
  const holdingsTableExist = await createTableHoldings(db);
  if (!holdingsTableExist) {
    await db.close();
  }

  // Proceed with adding holding
  if (holdingsTableExist) {
    const { Time, Token, TokenName, Balance, SolPaid, SolFeePaid, SolPaidUSDC, SolFeePaidUSDC, PerTokenPaidUSDC, Slot, Program, BotName, WalletPublicKey, TxId } = holding;
    
    // Create ISO UTC date strings using the helper function
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
        Program, BotName, WalletPublicKey, TxId
      ]
    );

    console.log(`${config.name}|[insertHolding]| Added New Holding For Monitoring\n${JSON.stringify(holding, null, 2)}\n https://gmgn.ai/sol/token/${Token}`, processRunCounter, null, "send-to-discord"); //TODO:move to tags

    await db.close();
    
    // Take a screenshot of the token page and send it to Discord after inserting the record
    try {
      console.log(`${config.name}|[insertHolding]| Taking screenshot of token: ${Token}`);
      const discordChannelId = process.env.DISCORD_CT_TRACKER_CHANNEL || '';
      if (discordChannelId) {
        await makeTokenScreenshotAndSendToDiscord(Token, discordChannelId);
      } else {
        console.warn(`${config.name}|[insertHolding]| Could not take screenshot: Missing Discord channel ID`);
      }
    } catch (error) {
      console.error(`${config.name}|[insertHolding]| Error taking screenshot: ${error}`);
    }
  }
}
// ***************************GET HOLDING RECORD**************************

export async function getHoldingRecord(token: string, processRunCounter: number, walletPublicKey?: string): Promise<HoldingRecord | null> {
  const db = await open({
    filename: config.db_name_tracker_holdings,
    driver: sqlite3.Database,
  });

  // Create Table if not exists
  const holdingsTableExist = await createTableHoldings(db);
  if (!holdingsTableExist) {
    await db.close();
    return null;
  }
  
  // If walletPublicKey is provided, search for holdings for that specific wallet
  // Otherwise, search for any holding of the token
  const query = walletPublicKey 
    ? `SELECT * FROM holdings WHERE Token = ? AND WalletPublicKey = ? LIMIT 1;`
    : `SELECT * FROM holdings WHERE Token = ? LIMIT 1;`;
  
  const params = walletPublicKey ? [token, walletPublicKey] : [token];
  
  const tokenRecord = await db.get(query, params);

  await db.close();

  if (!tokenRecord) {
    console.log(`${config.name}|[getHoldingRecord]| Token not found: ${token}${walletPublicKey ? ` for wallet ${walletPublicKey}` : ''}`, processRunCounter);
  }

  return tokenRecord || null;
}

// Update getWalletHoldings to make wallet optional
export async function getWalletHoldings(walletPublicKey?: string): Promise<HoldingRecord[]> {
  const db = await open({
    filename: config.db_name_tracker_holdings,
    driver: sqlite3.Database,
  });

  // Create Table if not exists
  const holdingsTableExist = await createTableHoldings(db);
  if (!holdingsTableExist) {
    await db.close();
    return [];
  }

  // If walletPublicKey is provided, filter by wallet, otherwise get all holdings
  const query = walletPublicKey
    ? `SELECT * FROM holdings WHERE WalletPublicKey = ?;`
    : `SELECT * FROM holdings ORDER BY Time DESC;`;
  
  const params = walletPublicKey ? [walletPublicKey] : [];
  
  const holdings = await db.all(query, params);
  
  await db.close();
  return holdings;
}

// Update getAllHoldingsGroupedByWallet to accept optional filters
export async function getAllHoldingsGroupedByWallet(options?: {
  walletPublicKey?: string;
  token?: string;
  botName?: string;
  startTime?: number;
  endTime?: number;
}): Promise<{ [walletPublicKey: string]: HoldingRecord[] }> {
  const db = await open({
    filename: config.db_name_tracker_holdings,
    driver: sqlite3.Database,
  });

  // Create Table if not exists
  const holdingsTableExist = await createTableHoldings(db);
  if (!holdingsTableExist) {
    await db.close();
    return {};
  }

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

  if (options?.botName) {
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

  const holdings = await db.all(query, params);
  await db.close();

  // Group holdings by wallet
  const groupedHoldings: { [walletPublicKey: string]: HoldingRecord[] } = {};
  for (const holding of holdings) {
    if (!groupedHoldings[holding.WalletPublicKey]) {
      groupedHoldings[holding.WalletPublicKey] = [];
    }
    groupedHoldings[holding.WalletPublicKey].push(holding);
  }

  return groupedHoldings;
}

// Add a new function to get holdings with flexible filtering
export async function All(options?: {
  walletPublicKey?: string;
  token?: string;
  botName?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
  offset?: number;
}): Promise<HoldingRecord[]> {
  const db = await open({
    filename: config.db_name_tracker_holdings,
    driver: sqlite3.Database,
  });

  // Create Table if not exists
  const holdingsTableExist = await createTableHoldings(db);
  if (!holdingsTableExist) {
    await db.close();
    return [];
  }

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

  if (options?.botName) {
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

  const holdings = await db.all(query, params);
  await db.close();
  return holdings;
}

// ***************************REMOVE HOLDING**************************

export async function removeHolding(tokenMint: string, processRunCounter: number, walletPublicKey: string) {
  const db = await open({
    filename: config.db_name_tracker_holdings,
    driver: sqlite3.Database,
  });

  // Create Table if not exists
  const holdingsTableExist = await createTableHoldings(db);
  if (!holdingsTableExist) {
    await db.close();
    return;
  }
  const holding = await db.get(`SELECT * FROM holdings WHERE Token = ? AND WalletPublicKey = ?`, [tokenMint, walletPublicKey]);
  if (!holding) {
    await db.close();
    return;
  }

  // If walletPublicKey is provided, only remove holding for that wallet
  const query = walletPublicKey
    ? `DELETE FROM holdings WHERE Token = ? AND WalletPublicKey = ?;`
    : `DELETE FROM holdings WHERE Token = ?;`;
  
  const params = walletPublicKey ? [tokenMint, walletPublicKey] : [tokenMint];

  await db.run(query, params);

  console.log(`${config.name}|[removeHolding]| Holding removed successfully${walletPublicKey ? ` for wallet ${walletPublicKey}` : ''}`, processRunCounter, "discord-log");

  await db.close();
}

// ***************************TOKENS TABLE**************************

// New token duplicates tracker
export async function createTableNewTokens(database: any): Promise<boolean> {
  try {
    await database.exec(`
    CREATE TABLE IF NOT EXISTS tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      time INTEGER NOT NULL,
      timeDate TEXT NOT NULL,
      name TEXT NOT NULL,
      mint TEXT NOT NULL,
      creator TEXT NOT NULL,
      rug_conditions TEXT,
      tokenReport TEXT
    );
  `);
    return true;
  } catch (error: any) {
    return false;
  }
}

export async function insertNewToken(newToken: NewTokenRecord, processRunCounter: number) {
  const db = await open({
    filename: config.db_name_tracker_holdings,
    driver: sqlite3.Database,
  });

  // Create Table if not exists
  const newTokensTableExist = await createTableNewTokens(db);
  if (!newTokensTableExist) {
    await db.close();
    return;
  }

  // Check if token already exists
  const { time, name, mint, creator, tokenReport, rug_conditions } = newToken;
  const existingToken = await db.get(
    `
    SELECT * FROM tokens 
    WHERE mint = ?;
    LIMIT 1;
    `,
    [mint]
  );
  if (existingToken) {
    await db.close();
    return;
  }

  // Create ISO UTC date string using the helper function
  const timeDate = convertTimestampToISO(Number(time));

  // Proceed with adding new token if it doesn't exist
  await db.run(
    `
    INSERT INTO tokens (time, timeDate, name, mint, creator, rug_conditions, tokenReport)
    VALUES (?, ?, ?, ?, ?, ?, ?);
    `,
    [time, timeDate, name, mint, creator, rug_conditions, tokenReport]
  );
  console.log(`${config.name}|[insertNewToken]| New token inserted successfully`, processRunCounter);

  await db.close();
}

export async function selectTokenByNameAndCreator(name: string, creator: string, processRunCounter: number): Promise<NewTokenRecord[]> {
  // Open the database
  const db = await open({
    filename: config.db_name_tracker_holdings,
    driver: sqlite3.Database,
  });

  // Create Table if not exists
  const newTokensTableExist = await createTableNewTokens(db);
  if (!newTokensTableExist) {
    await db.close();
    return [];
  }

  // Query the database for matching tokens
  const tokens = await db.all(
    `
    SELECT * 
    FROM tokens
    WHERE name = ? OR creator = ?;
  `,
    [name, creator]
  );

  // Close the database
  await db.close();

  // Return the results
  return tokens;
}

export async function selectTokenByMint(mint: string, processRunCounter: number): Promise<NewTokenRecord[]> {
  // Open the database
  const db = await open({
    filename: config.db_name_tracker_holdings,
    driver: sqlite3.Database,
  });

  // Create Table if not exists
  const newTokensTableExist = await createTableNewTokens(db);
  if (!newTokensTableExist) {
    await db.close();
    return [];
  }

  // Query the database for matching tokens
  const tokens = await db.all(
    `
    SELECT * 
    FROM tokens
    WHERE mint = ?;
    LIMIT 1;
  `,
    [mint]
  );

  // Close the database
  await db.close();

  // Return the results
  return tokens;
}

export async function selectAllTokens(processRunCounter: number): Promise<NewTokenRecord[]> {
  // Open the database
  const db = await open({
    filename: config.db_name_tracker_holdings,
    driver: sqlite3.Database,
  });

  // Create Table if not exists
  const newTokensTableExist = await createTableNewTokens(db);
  if (!newTokensTableExist) {
    await db.close();
    return [];
  }

  // Query the database for matching tokens
  const tokens = await db.all(
    `
    SELECT * 
    FROM tokens;
  `
  );

  // Close the database
  await db.close();

  // Return the results
  return tokens;
}

// ***************************PROFIT LOSS TABLE**************************
export async function createTableProfitLoss(database: any): Promise<boolean> {
  try {
    await database.exec(`
    CREATE TABLE IF NOT EXISTS profit_loss (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      Time INTEGER NOT NULL,
      TimeDate TEXT NOT NULL,
      EntryTime INTEGER NOT NULL,
      EntryTimeDate TEXT NOT NULL,
      Token TEXT NOT NULL,
      TokenName TEXT NOT NULL,
      EntryBalance REAL NOT NULL,
      ExitBalance REAL NOT NULL,
      EntrySolPaid REAL NOT NULL,
      ExitSolReceived REAL NOT NULL,
      TotalSolFees REAL NOT NULL,
      ProfitLossSOL REAL NOT NULL,
      ProfitLossUSDC REAL NOT NULL,
      ROIPercentage REAL NOT NULL,
      ProfitLossSOLWithFees REAL NOT NULL,
      ProfitLossUSDCWithFees REAL NOT NULL,
      ROIPercentageWithFees REAL NOT NULL,
      EntryPriceUSDC REAL NOT NULL,
      ExitPriceUSDC REAL NOT NULL,
      HoldingTimeSeconds INTEGER NOT NULL,
      Slot INTEGER NOT NULL,
      Program TEXT NOT NULL,
      BotName TEXT NOT NULL,
      ConfigTakeProfit REAL NOT NULL,
      ConfigStopLoss REAL NOT NULL,
      IsTakeProfit INTEGER NOT NULL,
      WalletPublicKey TEXT NOT NULL,
      TxId TEXT
    );
  `);
    return true;
  } catch (error: any) {
    console.error(`${config.name}|[createTableProfitLoss]| Error creating profit_loss table: ${error.message}`);
    return false;
  }
}

// ***************************INSERT PROFIT LOSS RECORD**************************
export async function insertProfitLoss(record: ProfitLossRecord, processRunCounter: number) {
  const db = await open({
    filename: config.db_name_tracker_holdings,
    driver: sqlite3.Database,
  });

  // Create Table if not exists
  const profitLossTableExist = await createTableProfitLoss(db);
  if (!profitLossTableExist) {
    await db.close();
    return;
  }

  // Proceed with adding profit/loss record
  const {
    Time,
    EntryTime,
    Token,
    TokenName,
    EntryBalance,
    ExitBalance,
    EntrySolPaid,
    ExitSolReceived,
    TotalSolFees,
    ProfitLossSOL,
    ProfitLossUSDC,
    ROIPercentage,
    ProfitLossSOLWithFees,
    ProfitLossUSDCWithFees,
    ROIPercentageWithFees,
    EntryPriceUSDC,
    ExitPriceUSDC,
    HoldingTimeSeconds,
    Slot,
    Program,
    BotName,
    ConfigTakeProfit,
    ConfigStopLoss,
    IsTakeProfit,
    WalletPublicKey,
    TxId
  } = record;

  // Create ISO UTC date strings using the helper function
  const timeDate = convertTimestampToISO(Number(Time));
  const entryTimeDate = convertTimestampToISO(Number(EntryTime));

  // Format numeric values to avoid scientific notation
  const formattedRecord = {
    ...record,
    Time: Number(Time),
    TimeDate: timeDate,
    EntryTime: Number(EntryTime),
    EntryTimeDate: entryTimeDate,
    EntryBalance: Number(Number(EntryBalance).toFixed(8)),
    ExitBalance: Number(Number(ExitBalance).toFixed(8)),
    EntrySolPaid: Number(Number(EntrySolPaid).toFixed(8)),
    ExitSolReceived: Number(Number(ExitSolReceived).toFixed(8)),
    TotalSolFees: Number(Number(TotalSolFees).toFixed(8)),
    ProfitLossSOL: Number(Number(ProfitLossSOL).toFixed(8)),
    ProfitLossUSDC: Number(Number(ProfitLossUSDC).toFixed(8)),
    ROIPercentage: Number(Number(ROIPercentage).toFixed(2)),
    ProfitLossSOLWithFees: Number(Number(ProfitLossSOLWithFees).toFixed(8)),
    ProfitLossUSDCWithFees: Number(Number(ProfitLossUSDCWithFees).toFixed(8)),
    ROIPercentageWithFees: Number(Number(ROIPercentageWithFees).toFixed(2)),
    EntryPriceUSDC: Number(Number(EntryPriceUSDC).toFixed(8)),
    ExitPriceUSDC: Number(Number(ExitPriceUSDC).toFixed(8)),
    HoldingTimeSeconds: Number(HoldingTimeSeconds),
    Slot: Number(Slot),
    ConfigTakeProfit: Number(Number(ConfigTakeProfit).toFixed(2)),
    ConfigStopLoss: Number(Number(ConfigStopLoss).toFixed(2))
  };

  // Ensure all numeric values are numbers before storing
  await db.run(
    `
    INSERT INTO profit_loss (
      Time, TimeDate, EntryTime, EntryTimeDate, Token, TokenName, EntryBalance, ExitBalance, 
      EntrySolPaid, ExitSolReceived, TotalSolFees, ProfitLossSOL, ProfitLossUSDC, ROIPercentage,
      ProfitLossSOLWithFees, ProfitLossUSDCWithFees, ROIPercentageWithFees,
      EntryPriceUSDC, ExitPriceUSDC, HoldingTimeSeconds, Slot, Program, BotName,
      ConfigTakeProfit, ConfigStopLoss, IsTakeProfit, WalletPublicKey, TxId
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `,
    [
      formattedRecord.Time, formattedRecord.TimeDate, formattedRecord.EntryTime, formattedRecord.EntryTimeDate,
      Token, TokenName, formattedRecord.EntryBalance, formattedRecord.ExitBalance,
      formattedRecord.EntrySolPaid, formattedRecord.ExitSolReceived, 
      formattedRecord.TotalSolFees, formattedRecord.ProfitLossSOL,
      formattedRecord.ProfitLossUSDC, formattedRecord.ROIPercentage,
      formattedRecord.ProfitLossSOLWithFees, formattedRecord.ProfitLossUSDCWithFees, formattedRecord.ROIPercentageWithFees,
      formattedRecord.EntryPriceUSDC, formattedRecord.ExitPriceUSDC,
      formattedRecord.HoldingTimeSeconds, formattedRecord.Slot, 
      Program, BotName, formattedRecord.ConfigTakeProfit, formattedRecord.ConfigStopLoss,
      IsTakeProfit ? 1 : 0, WalletPublicKey, TxId
    ]
  );

  console.log(`${config.name}|[insertProfitLoss]| Profit/loss record inserted successfully \n${JSON.stringify(record, null, 2)}`, processRunCounter, formattedRecord);

  await db.close();
}

// ***************************GET ALL PROFIT LOSS RECORDS**************************
export async function getAllProfitLossRecords(): Promise<ProfitLossRecord[]> {
  const db = await open({
    filename: config.db_name_tracker_holdings,
    driver: sqlite3.Database,
  });

  // Create Table if not exists
  const profitLossTableExist = await createTableProfitLoss(db);
  if (!profitLossTableExist) {
    await db.close();
    return [];
  }

  const records = await db.all(`SELECT * FROM profit_loss ORDER BY Time DESC;`);
  await db.close();
  return records;
}

// ***************************GET TOKEN PROFIT LOSS HISTORY**************************
export async function getTokenProfitLossHistory(token: string): Promise<ProfitLossRecord[]> {
  const db = await open({
    filename: config.db_name_tracker_holdings,
    driver: sqlite3.Database,
  });

  // Create Table if not exists
  const profitLossTableExist = await createTableProfitLoss(db);
  if (!profitLossTableExist) {
    await db.close();
    return [];
  }

  const records = await db.all(
    `
    SELECT * 
    FROM profit_loss 
    WHERE Token = ? 
    ORDER BY Time DESC;
  `,
    [token]
  );

  await db.close();
  return records;
}

// ***************************GET TOTAL PROFIT LOSS**************************
export async function getTotalProfitLoss(botName?: string, walletPublicKey?: string): Promise<{ totalProfitLossSOL: number; totalProfitLossUSDC: number }> {
  const db = await open({
    filename: config.db_name_tracker_holdings,
    driver: sqlite3.Database,
  });

  // Create Table if not exists
  const profitLossTableExist = await createTableProfitLoss(db);
  if (!profitLossTableExist) {
    await db.close();
    return { totalProfitLossSOL: 0, totalProfitLossUSDC: 0 };
  }

  let query = `SELECT SUM(ProfitLossSOL) as totalProfitLossSOL, SUM(ProfitLossUSDC) as totalProfitLossUSDC FROM profit_loss WHERE 1=1`;
  const params: any[] = [];

  if (botName) {
    query += ` AND BotName = ?`;
    params.push(botName);
  }

  if (walletPublicKey) {
    query += ` AND WalletPublicKey = ?`;
    params.push(walletPublicKey);
  }

  const result = await db.get(query, params);

  await db.close();
  return {
    totalProfitLossSOL: result?.totalProfitLossSOL || 0,
    totalProfitLossUSDC: result?.totalProfitLossUSDC || 0
  };
}

export async function getProfitLossRecords(params: {
  startDate?: number;
  endDate?: number;
  limit?: number;
  offset?: number;
  module?: string;
  walletPublicKey?: string;
}): Promise<ProfitLossRecord[]> {
  const db = await open({
    filename: config.db_name_tracker_holdings,
    driver: sqlite3.Database,
  });

  // Create Table if not exists
  const profitLossTableExist = await createTableProfitLoss(db);
  if (!profitLossTableExist) {
    await db.close();
    return [];
  }

  let query = 'SELECT * FROM profit_loss WHERE 1=1';
  const queryParams: any[] = [];

  if (params.startDate) {
    query += ' AND Time >= ?';
    queryParams.push(params.startDate);
  }

  if (params.endDate) {
    query += ' AND Time <= ?';
    queryParams.push(params.endDate);
  }

  if (params.module) {
    query += ' AND BotName = ?';
    queryParams.push(params.module);
  }

  if (params.walletPublicKey) {
    query += ' AND WalletPublicKey = ?';
    queryParams.push(params.walletPublicKey);
  }

  query += ' ORDER BY Time DESC';

  if (params.limit) {
    query += ' LIMIT ?';
    queryParams.push(params.limit);
  }

  if (params.offset) {
    query += ' OFFSET ?';
    queryParams.push(params.offset);
  }

  const records = await db.all(query, queryParams);
  await db.close();
  return records;
}

// Add a new function to get profit/loss records grouped by wallet
export async function getProfitLossRecordsGroupedByWallet(params: {
  startDate?: number;
  endDate?: number;
  module?: string;
}): Promise<{ [walletPublicKey: string]: { records: ProfitLossRecord[], totals: { totalProfitLossSOL: number; totalProfitLossUSDC: number } } }> {
  const db = await open({
    filename: config.db_name_tracker_holdings,
    driver: sqlite3.Database,
  });

  // Create Table if not exists
  const profitLossTableExist = await createTableProfitLoss(db);
  if (!profitLossTableExist) {
    await db.close();
    return {};
  }

  let query = 'SELECT * FROM profit_loss WHERE 1=1';
  const queryParams: any[] = [];

  if (params.startDate) {
    query += ' AND Time >= ?';
    queryParams.push(params.startDate);
  }

  if (params.endDate) {
    query += ' AND Time <= ?';
    queryParams.push(params.endDate);
  }

  if (params.module) {
    query += ' AND BotName = ?';
    queryParams.push(params.module);
  }

  query += ' ORDER BY WalletPublicKey, Time DESC';

  const records = await db.all(query, queryParams);
  await db.close();

  // Group records by wallet and calculate totals
  const groupedRecords: { [walletPublicKey: string]: { records: ProfitLossRecord[], totals: { totalProfitLossSOL: number; totalProfitLossUSDC: number } } } = {};
  
  for (const record of records) {
    if (!groupedRecords[record.WalletPublicKey]) {
      groupedRecords[record.WalletPublicKey] = {
        records: [],
        totals: { totalProfitLossSOL: 0, totalProfitLossUSDC: 0 }
      };
    }
    groupedRecords[record.WalletPublicKey].records.push(record);
    groupedRecords[record.WalletPublicKey].totals.totalProfitLossSOL += record.ProfitLossSOL;
    groupedRecords[record.WalletPublicKey].totals.totalProfitLossUSDC += record.ProfitLossUSDC;
  }

  return groupedRecords;
}

// Add a new function to get token profit/loss history for a specific wallet
export async function getTokenProfitLossHistoryByWallet(token: string, walletPublicKey: string): Promise<ProfitLossRecord[]> {
  const db = await open({
    filename: config.db_name_tracker_holdings,
    driver: sqlite3.Database,
  });

  // Create Table if not exists
  const profitLossTableExist = await createTableProfitLoss(db);
  if (!profitLossTableExist) {
    await db.close();
    return [];
  }

  const records = await db.all(
    `SELECT * FROM profit_loss WHERE Token = ? AND WalletPublicKey = ? ORDER BY Time DESC;`,
    [token, walletPublicKey]
  );

  await db.close();
  return records;
}

// ***************************TRANSACTIONS TABLE**************************
export async function createTableTransactions(database: any): Promise<boolean> {
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
      TxId TEXT
    );
  `);
    return true;
  } catch (error: any) {
    console.error(`${config.name}|[createTableTransactions]| Error creating transactions table: ${error.message}`);
    return false;
  }
}

export async function insertTransaction(transaction:TransactionRecord, processRunCounter: number) {
  const db = await open({
    filename: config.db_name_tracker_holdings,
    driver: sqlite3.Database,
  });

  // Create Table if not exists
  const transactionsTableExist = await createTableTransactions(db);
  if (!transactionsTableExist) {
    await db.close();
    return;
  }

  // Proceed with adding transaction
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
    BotName,
    WalletPublicKey,
    TxId
  } = transaction;

  // Create ISO UTC date string using the helper function
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
      Number(SolFee), Number(PricePerTokenUSDC), Number(TotalUSDC), Number(Slot), Program, BotName, WalletPublicKey, TxId
    ]
  );

  console.log(`${config.name}|[insertTransaction]| Transaction inserted successfully`, processRunCounter, {
    Token,
    TransactionType,
    TokenAmount: Number(TokenAmount),
    PricePerTokenUSDC: Number(PricePerTokenUSDC).toFixed(8),
    TotalUSDC: Number(TotalUSDC).toFixed(8),
    TxId: TxId
  });

  await db.close();
}

// ***************************GET ALL TRANSACTIONS**************************
export async function getAllTransactions(options?: { 
  offset?: number; 
  limit?: number; 
  module?: string;
  walletPublicKey?: string;
}): Promise<TransactionRecord[]> {
  const db = await open({
    filename: config.db_name_tracker_holdings,
    driver: sqlite3.Database,
  });

  // Create Table if not exists
  const transactionsTableExist = await createTableTransactions(db);
  if (!transactionsTableExist) {
    await db.close();
    return [];
  }

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

  query += ` ORDER BY Time DESC`;

  if (options?.limit !== undefined) {
    query += ` LIMIT ?`;
    params.push(options.limit);
    
    if (options?.offset !== undefined) {
      query += ` OFFSET ?`;
      params.push(options.offset);
    }
  }
  

  const records = await db.all(query, params);
  await db.close();
  return records;
}

// Add a new function to get transactions grouped by wallet
export async function getTransactionsGroupedByWallet(options?: {
  module?: string;
  startDate?: number;
  endDate?: number;
}): Promise<{ [walletPublicKey: string]: TransactionRecord[] }> {
  const db = await open({
    filename: config.db_name_tracker_holdings,
    driver: sqlite3.Database,
  });

  // Create Table if not exists
  const transactionsTableExist = await createTableTransactions(db);
  if (!transactionsTableExist) {
    await db.close();
    return {};
  }

  let query = `SELECT * FROM transactions WHERE 1=1`;
  const params: any[] = [];

  if (options?.module) {
    query += ` AND BotName = ?`;
    params.push(options.module);
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

  const records = await db.all(query, params);
  await db.close();

  // Group transactions by wallet
  const groupedTransactions: { [walletPublicKey: string]: TransactionRecord[] } = {};
  for (const record of records) {
    if (!groupedTransactions[record.WalletPublicKey]) {
      groupedTransactions[record.WalletPublicKey] = [];
    }
    groupedTransactions[record.WalletPublicKey].push(record);
  }

  return groupedTransactions;
}

// Add a new function to get wallet transaction statistics
export async function getWalletTransactionStats(walletPublicKey: string, options?: {
  module?: string;
  startDate?: number;
  endDate?: number;
}): Promise<{
  totalBuyTransactions: number;
  totalSellTransactions: number;
  totalSolSpent: number;
  totalSolReceived: number;
  totalSolFees: number;
  totalUSDCValue: number;
}> {
  const db = await open({
    filename: config.db_name_tracker_holdings,
    driver: sqlite3.Database,
  });

  // Create Table if not exists
  const transactionsTableExist = await createTableTransactions(db);
  if (!transactionsTableExist) {
    await db.close();
    return {
      totalBuyTransactions: 0,
      totalSellTransactions: 0,
      totalSolSpent: 0,
      totalSolReceived: 0,
      totalSolFees: 0,
      totalUSDCValue: 0
    };
  }

  let query = `
    SELECT 
      COUNT(CASE WHEN TransactionType = 'BUY' THEN 1 END) as totalBuyTransactions,
      COUNT(CASE WHEN TransactionType = 'SELL' THEN 1 END) as totalSellTransactions,
      SUM(CASE WHEN TransactionType = 'BUY' THEN SolAmount ELSE 0 END) as totalSolSpent,
      SUM(CASE WHEN TransactionType = 'SELL' THEN SolAmount ELSE 0 END) as totalSolReceived,
      SUM(SolFee) as totalSolFees,
      SUM(TotalUSDC) as totalUSDCValue
    FROM transactions 
    WHERE WalletPublicKey = ?
  `;
  const params: any[] = [walletPublicKey];

  if (options?.module) {
    query += ` AND BotName = ?`;
    params.push(options.module);
  }

  if (options?.startDate) {
    query += ` AND Time >= ?`;
    params.push(options.startDate);
  }

  if (options?.endDate) {
    query += ` AND Time <= ?`;
    params.push(options.endDate);
  }

  const result = await db.get(query, params);
  await db.close();

  return {
    totalBuyTransactions: result?.totalBuyTransactions || 0,
    totalSellTransactions: result?.totalSellTransactions || 0,
    totalSolSpent: result?.totalSolSpent || 0,
    totalSolReceived: result?.totalSolReceived || 0,
    totalSolFees: result?.totalSolFees || 0,
    totalUSDCValue: result?.totalUSDCValue || 0
  };
}

// ***************************UPDATE SELL ATTEMPTS**************************
export async function updateSellAttempts(id: number, processRunCounter: number): Promise<boolean> {
  const db = await open({
    filename: config.db_name_tracker_holdings,
    driver: sqlite3.Database,
  });

  try {
    const currentTime = Date.now();
    const currentTimeDate = convertTimestampToISO(currentTime);

    // Update sell attempts and last attempt time
    await db.run(`
      UPDATE holdings 
      SET SellAttempts = SellAttempts + 1,
          LastAttemptTime = ?,
          LastAttemptTimeDate = ?
      WHERE id = ?;
    `, [currentTime, currentTimeDate, id]);

    // Check if we've reached max attempts
    const holding = await db.get(`
      SELECT * 
      FROM holdings 
      WHERE id = ?;
    `, [id]);

    if (holding && holding.SellAttempts >= config.sell.max_sell_attempts) {
      // Mark as skipped if max attempts reached
      await db.run(`
        UPDATE holdings 
        SET IsSkipped = 1 
        WHERE id = ?;
      `, [id]);

      console.warn(`${config.name}|[updateSellAttempts]| ⚠️ Token ${holding.TokenName} marked as skipped after ${config.sell.max_sell_attempts}.\n https://solscan.io/tx/${holding.TxId}. Token will be removed from holdings and burned today at midnight.`, 
        processRunCounter, holding, "send-to-discord");
    }

    await db.close();
    return true;
  } catch (error: any) {
    console.error(`${config.name}|[updateSellAttempts]| Error updating sell attempts: ${error.message}`, processRunCounter);
    await db.close();
    return false;
  }
}

// ***************************GET SKIPPED HOLDINGS**************************
export async function getSkippedHoldings(walletPublicKey?: string): Promise<HoldingRecord[]> {
  const db = await open({
    filename: config.db_name_tracker_holdings,
    driver: sqlite3.Database,
  });

  try {
    let query = 'SELECT * FROM holdings WHERE IsSkipped = 1';
    
    if (walletPublicKey) {
      query += ` AND WalletPublicKey = ?`;
    }
    
    query += ' ORDER BY LastAttemptTime DESC';

    const params = walletPublicKey ? [walletPublicKey] : [];
    const skippedHoldings = await db.all(query, params);
    
    await db.close();
    return skippedHoldings;
  } catch (error: any) {
    console.error(`Error getting skipped holdings: ${error.message}`);
    await db.close();
    return [];
  }
}


// ***************************GET ENHANCED TRANSACTION HISTORY**************************
/**
 * Get transaction history with profit/loss data added to sell transactions
 * This enhances the regular transaction history by including profit/loss metrics
 * for each sell transaction from the profit_loss table
 * 
 * @param options Filter options for the transactions
 * @returns Enhanced transaction records with profit/loss data
 */
export async function getTransactionHistoryWithProfitLoss(options?: { 
  offset?: number; 
  limit?: number; 
  module?: string;
  walletPublicKey?: string;
  startDate?: number;
  endDate?: number;
}): Promise<EnhancedTransactionRecord[]> {
  return await getEnhancedTxHistoryFromUtil(
    config.db_name_tracker_holdings,
    options
  );
}

