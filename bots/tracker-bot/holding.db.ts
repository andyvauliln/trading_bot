import * as sqlite3 from "sqlite3";
import { open } from "sqlite";
import { config } from "./config";
import { HoldingRecord, NewTokenRecord, ProfitLossRecord, TransactionRecord } from "./types";

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
    console.error(`Error initializing database tables: ${error.message}`);
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
      WalletPublicKey TEXT NOT NULL
    );
  `);
    return true;
  } catch (error: any) {
    return false;
  }
}

// ***************************GET ALL HOLDINGS**************************
export async function getAllHoldings(): Promise<HoldingRecord[]> {
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

  const holdings = await db.all(`SELECT * FROM holdings;`);
  await db.close();
  return holdings;
}

// ***************************INSERT HOLDING**************************

export async function insertHolding(holding: HoldingRecord, processRunCounter: number) {
  console.log(`[holding-db]|[insertHolding]| Inserting holding:`, processRunCounter, holding);
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
    const { Time, Token, TokenName, Balance, SolPaid, SolFeePaid, SolPaidUSDC, SolFeePaidUSDC, PerTokenPaidUSDC, Slot, Program, BotName, WalletPublicKey } = holding;
    await db.run(
      `
    INSERT INTO holdings (Time, Token, TokenName, Balance, SolPaid, SolFeePaid, SolPaidUSDC, SolFeePaidUSDC, PerTokenPaidUSDC, Slot, Program, BotName, WalletPublicKey)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `,
      [Time, Token, TokenName, Balance, SolPaid, SolFeePaid, SolPaidUSDC, SolFeePaidUSDC, PerTokenPaidUSDC, Slot, Program, BotName, WalletPublicKey]
    );

    console.log(`[holding-db]|[insertHolding]| Holding inserted successfully`, processRunCounter);

    await db.close();
  }
}
// ***************************GET HOLDING RECORD**************************

export async function getHoldingRecord(token: string, processRunCounter: number): Promise<HoldingRecord | null> {
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
  
  const tokenRecord = await db.get(
    `
    SELECT * 
    FROM holdings 
    WHERE Token = ? 
    LIMIT 1;
  `,
    [token]
  );

  await db.close();

  console.log(`[holding-db]|[getHoldingRecord]| Found token: ${tokenRecord ? "Found" : "Not Found"}`, processRunCounter, tokenRecord);

  return tokenRecord || null;
}
// ***************************REMOVE HOLDING**************************

export async function removeHolding(tokenMint: string, processRunCounter: number) {
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

  // Proceed with deleting the holding
  await db.run(
    `
    DELETE FROM holdings
    WHERE Token = ?;
    `,
    [tokenMint]
  );

  console.log(`[holding-db]|[removeHolding]| Holding removed successfully`, processRunCounter);

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
      name TEXT NOT NULL,
      mint TEXT NOT NULL,
      creator TEXT NOT NULL,
      rug_conditions TEXT
    );
  `);
    return true;
  } catch (error: any) {
    return false;
  }
}

export async function insertNewToken(newToken: NewTokenRecord, processRunCounter: number, rug_conditions: any[]) {
  console.log(`[holding-db]|[insertNewToken]| Inserting new token:`, processRunCounter, newToken);
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
  const { time, name, mint, creator } = newToken;
  const existingToken = await db.get(
    `
    SELECT * FROM tokens 
    WHERE mint = ?;
    LIMIT 1;
    `,
    [mint]
  );
  console.log(`[holding-db]|[insertNewToken]| Existing token: ${existingToken ? "Found" : "Not Found"}`, processRunCounter, existingToken);
  if (existingToken) {
    await db.close();
    return;
  }

  // Proceed with adding new token if it doesn't exist
  await db.run(
    `
    INSERT INTO tokens (time, name, mint, creator, rug_conditions)
    VALUES (?, ?, ?, ?, ?);
    `,
    [time, name, mint, creator, rug_conditions]
  );
  console.log(`[holding-db]|[insertNewToken]| New token inserted successfully`, processRunCounter);

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

  console.log(`[holding-db]|[selectTokenByNameAndCreator]| Found token number: ${tokens.length}`, processRunCounter, tokens);

  // Close the database
  await db.close();

  // Return the results
  return tokens;
}

export async function selectTokenByMint(mint: string, processRunCounter: number): Promise<NewTokenRecord[]> {
  console.log(`[holding-db]|[selectTokenByMint]| Selecting token by mint: ${mint}`, processRunCounter);
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

  console.log(`[holding-db]|[selectTokenByMint]| Found token number: ${tokens.length}`, processRunCounter, tokens);

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

  console.log(`[holding-db]|[selectAllTokens]| Found token number: ${tokens.length}`, processRunCounter, tokens);

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
      EntryTime INTEGER NOT NULL,
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
      EntryPriceUSDC REAL NOT NULL,
      ExitPriceUSDC REAL NOT NULL,
      HoldingTimeSeconds INTEGER NOT NULL,
      Slot INTEGER NOT NULL,
      Program TEXT NOT NULL,
      BotName TEXT NOT NULL,
      IsTakeProfit INTEGER NOT NULL,
      WalletPublicKey TEXT NOT NULL
    );
  `);
    return true;
  } catch (error: any) {
    console.error(`Error creating profit_loss table: ${error.message}`);
    return false;
  }
}

// ***************************INSERT PROFIT LOSS RECORD**************************
export async function insertProfitLoss(record: ProfitLossRecord, processRunCounter: number) {
  console.log(`[holding-db]|[insertProfitLoss]| Inserting profit/loss record:`, processRunCounter, record);
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
    EntryPriceUSDC,
    ExitPriceUSDC,
    HoldingTimeSeconds,
    Slot,
    Program,
    BotName,
    IsTakeProfit,
    WalletPublicKey
  } = record;

  await db.run(
    `
    INSERT INTO profit_loss (
      Time, EntryTime, Token, TokenName, EntryBalance, ExitBalance, 
      EntrySolPaid, ExitSolReceived, TotalSolFees, ProfitLossSOL, 
      ProfitLossUSDC, ROIPercentage, EntryPriceUSDC, ExitPriceUSDC, 
      HoldingTimeSeconds, Slot, Program, BotName, IsTakeProfit, WalletPublicKey
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `,
    [
      Time, EntryTime, Token, TokenName, EntryBalance, ExitBalance,
      EntrySolPaid, ExitSolReceived, TotalSolFees, ProfitLossSOL,
      ProfitLossUSDC, ROIPercentage, EntryPriceUSDC, ExitPriceUSDC,
      HoldingTimeSeconds, Slot, Program, BotName, IsTakeProfit ? 1 : 0, WalletPublicKey
    ]
  );

  console.log(`[holding-db]|[insertProfitLoss]| Profit/loss record inserted successfully`, processRunCounter);

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
export async function getTotalProfitLoss(botName?: string): Promise<{ totalProfitLossSOL: number; totalProfitLossUSDC: number }> {
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

  const result = await db.get(`
    SELECT 
      SUM(ProfitLossSOL) as totalProfitLossSOL,
      SUM(ProfitLossUSDC) as totalProfitLossUSDC
    FROM profit_loss${botName ? ' WHERE BotName = ?' : ''};
  `, [botName]);

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

// ***************************TRANSACTIONS TABLE**************************
export async function createTableTransactions(database: any): Promise<boolean> {
  try {
    await database.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      Time INTEGER NOT NULL,
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
      WalletPublicKey TEXT NOT NULL
    );
  `);
    return true;
  } catch (error: any) {
    console.error(`Error creating transactions table: ${error.message}`);
    return false;
  }
}

export async function insertTransaction(transaction: {
  Time: number;
  Token: string;
  TokenName: string;
  TransactionType: 'BUY' | 'SELL';
  TokenAmount: number;
  SolAmount: number;
  SolFee: number;
  PricePerTokenUSDC: number;
  TotalUSDC: number;
  Slot: number;
  Program: string;
  BotName: string;
  WalletPublicKey: string;
}, processRunCounter: number) {
  console.log(`[holding-db]|[insertTransaction]| Inserting transaction:`, processRunCounter, transaction);
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
    WalletPublicKey
  } = transaction;

  await db.run(
    `
    INSERT INTO transactions (
      Time, Token, TokenName, TransactionType, TokenAmount, SolAmount,
      SolFee, PricePerTokenUSDC, TotalUSDC, Slot, Program, BotName, WalletPublicKey
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `,
    [
      Time, Token, TokenName, TransactionType, TokenAmount, SolAmount,
      SolFee, PricePerTokenUSDC, TotalUSDC, Slot, Program, BotName, WalletPublicKey
    ]
  );

  console.log(`[holding-db]|[insertTransaction]| Transaction inserted successfully`, processRunCounter);

  await db.close();
}

// ***************************GET ALL TRANSACTIONS**************************
export async function getAllTransactions(options?: { offset?: number; limit?: number, module?: string }): Promise<TransactionRecord[]> {
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

  let query = `SELECT * FROM transactions ORDER BY Time DESC`;
  const params: any[] = [];

  if (options?.limit !== undefined) {
    query += ` LIMIT ?`;
    params.push(options.limit);
    
    if (options?.offset !== undefined) {
      query += ` OFFSET ?`;
      params.push(options.offset);
    }
  }

  if (options?.module) {
    query += ` AND BotName = ?`;
    params.push(options.module);
  }

  const records = await db.all(query + `;`, params);
  await db.close();
  return records;
}

