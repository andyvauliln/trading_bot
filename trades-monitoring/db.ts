import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { config } from "./config";
import { InsertHistoricalDataDetails } from "./types";
import { DateTime } from "luxon";

// Posts
export async function createHistoricalDataTable(database: any): Promise<boolean> {
  try {
    await database.exec(`
        CREATE TABLE IF NOT EXISTS historical_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            Account TEXT NOT NULL,
            Token TEXT NOT NULL,
            Symbol TEXT NOT NULL,
            TokenName TEXT NOT NULL,
            Amount REAL NOT NULL,
            USDPrice REAL NOT NULL,
            Time INTEGER NOT NULL
        );
      `);
    return true;
  } catch (error: any) {
    console.error("Error creating TokenData table:", error);
    return false;
  }
}
export async function selectHistoricalDataByAccount(account?: string, date_from?: DateTime, date_to?: DateTime): Promise<any[]> {
  try {
    const db = await open({
      filename: config.db_historical_data_path,
      driver: sqlite3.Database,
    });

    // Create Table if not exists
    const historicalDataTableExists = await createHistoricalDataTable(db);
    if (!historicalDataTableExists) {
      await db.close();
      throw new Error("Could not create historical data table.");
    }
    let query = 'SELECT * FROM historical_data WHERE 1=1';
    const queryParams: any[] = [];

    if (account) {
      query += ' AND Account=?';
      queryParams.push(account);
    }

    if (date_from) {
      query += ' AND Time >= ?';
      queryParams.push(date_from.toMillis());
    }

    if (date_to) {
      query += ' AND Time <= ?';
      queryParams.push(date_to.toMillis());
    }

    const transfer = await db.all(query, queryParams);

    // Close the database
    await db.close();

    // Return the results
    return transfer;
  } catch (error: any) {
    console.error("Error while getting historical data:", error);
    return [];
  }
}

export async function insertHistoricalData(newPost: InsertHistoricalDataDetails): Promise<boolean> {
  try {
    const db = await open({
      filename: config.db_historical_data_path,
      driver: sqlite3.Database,
    });

    // Create Table if not exists
    const historicalDataTableExists = await createHistoricalDataTable(db);
    if (!historicalDataTableExists) {
      await db.close();
      throw new Error("Could not create historical data table.");
    }

    // Proceed with adding holding
    if (historicalDataTableExists) {
      const { account, token, symbol, tokenName, amount, usdPrice, time } = newPost;

      await db.run(
        `
      INSERT INTO historical_data (Account, Token, Symbol, TokenName, Amount, USDPrice, Time)
      VALUES (?, ?, ?, ?, ?, ?, ?);
    `,
        [account, token, symbol, tokenName, amount, usdPrice, time.toMillis()]
      );

      await db.close();
    }
    return true;
  } catch (error: any) {
    console.error("Error storing historical data:", error);
    return false;
  }
}
