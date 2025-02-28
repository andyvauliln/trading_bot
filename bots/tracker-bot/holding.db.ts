import * as sqlite3 from "sqlite3";
import { open } from "sqlite";
import { config } from "./config";
import { HoldingRecord, NewTokenRecord } from "./types";

// Tracker
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
      BotName TEXT NOT NULL
    );
  `);
    return true;
  } catch (error: any) {
    return false;
  }
}

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
    const { Time, Token, TokenName, Balance, SolPaid, SolFeePaid, SolPaidUSDC, SolFeePaidUSDC, PerTokenPaidUSDC, Slot, Program, BotName } = holding;
    await db.run(
      `
    INSERT INTO holdings (Time, Token, TokenName, Balance, SolPaid, SolFeePaid, SolPaidUSDC, SolFeePaidUSDC, PerTokenPaidUSDC, Slot, Program, BotName)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `,
      [Time, Token, TokenName, Balance, SolPaid, SolFeePaid, SolPaidUSDC, SolFeePaidUSDC, PerTokenPaidUSDC, Slot, Program, BotName]
    );

    console.log(`[holding-db]|[insertHolding]| Holding inserted successfully`, processRunCounter);

    await db.close();
  }
}

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