import { Database } from "sqlite";
import { InsertHistoricalDataDetails, HistoricalDataRecord } from "./db.types";
import { getDbConnection, convertTimestampToISO } from "./db.utils";
import { db_config } from "./db.config";
import { DateTime } from "luxon";

const DEFAULT_BOT_NAME = "db.historical-data";

// Posts
export async function createTableHistoricalData(database: Database): Promise<boolean> {
  const functionName = "createTableHistoricalData";
  console.log(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Checking/creating historical_data table...`);
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
            Time INTEGER NOT NULL,
            DateTime TEXT NOT NULL
        );
      `);
    console.log(`[${DEFAULT_BOT_NAME}]|[${functionName}]|historical_data table checked/created successfully.`);
    return true;
  } catch (error: any) {
    console.error(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Error creating historical_data table`, 0, { error: error.message });
    return false;
  }
}

export async function selectHistoricalDataByAccount(
  account?: string,
  date_from?: DateTime,
  date_to?: DateTime,
  botName: string = DEFAULT_BOT_NAME,
  processRunCounter: number = 0
): Promise<HistoricalDataRecord[]> {
  let db: Database | null = null;
  const functionName = "selectHistoricalDataByAccount";
  console.log(`[${botName}]|[${functionName}]|Selecting historical data`, processRunCounter, { account, date_from: date_from?.toISO(), date_to: date_to?.toISO() });

  try {
    db = await getDbConnection(db_config.historical_data_path);

    let query = "SELECT * FROM historical_data WHERE 1=1";
    const queryParams: any[] = [];

    if (account) {
      query += " AND Account=?";
      queryParams.push(account);
    }

    if (date_from) {
      query += " AND Time >= ?";
      queryParams.push(date_from.toMillis());
    }

    if (date_to) {
      query += " AND Time <= ?";
      queryParams.push(date_to.toMillis());
    }

    query += " ORDER BY Time DESC";

    const records: HistoricalDataRecord[] = await db.all(query, queryParams);

    console.log(`[${botName}]|[${functionName}]|Successfully selected ${records.length} historical data records`, processRunCounter);
    return records;
  } catch (error: any) {
    console.error(`[${botName}]|[${functionName}]|Error selecting historical data`, processRunCounter, { error: error.message, account });
    return [];
  } finally {
    if (db) {
      await db.close();
    }
  }
}

export async function insertHistoricalData(
  data: InsertHistoricalDataDetails,
  botName: string = DEFAULT_BOT_NAME,
  processRunCounter: number = 0
): Promise<boolean> {
  let db: Database | null = null;
  const functionName = "insertHistoricalData";

  try {
    db = await getDbConnection(db_config.historical_data_path);

    const { account, token, symbol, tokenName, amount, usdPrice, time } = data;
    const timeMillis = time.toMillis();
    const dateTimeISO = convertTimestampToISO(timeMillis);

    await db.run(
      `
      INSERT INTO historical_data (Account, Token, Symbol, TokenName, Amount, USDPrice, Time, DateTime)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    `,
      [account, token, symbol, tokenName, amount, usdPrice, timeMillis, dateTimeISO]
    );

    console.log(`[${botName}]|[${functionName}]|Historical data inserted successfully`, processRunCounter, { account, token, time: dateTimeISO });
    return true;
  } catch (error: any) {
    console.error(`[${botName}]|[${functionName}]|Error inserting historical data`, processRunCounter, { error: error.message, data });
    return false;
  } finally {
    if (db) {
      await db.close();
    }
  }
}
