import { Database } from 'sqlite';
import { ProfitLossRecord } from "./db.types";
import { convertTimestampToISO, getDbConnection } from "./db.utils";
import { db_config } from "./db.config";

const DEFAULT_BOT_NAME = 'db.profit-loss'; // Define a default bot name for logging when not provided

/**
 * Creates the profit_loss table if it doesn't exist
 * @param database SQLite database connection (from sqlite wrapper)
 * @returns Promise resolving to a boolean indicating success
 */
export async function createTableProfitLoss(database: Database): Promise<boolean> {
  const functionName = 'createTableProfitLoss';
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
      ConfigTakeProfit TEXT NOT NULL,
      ConfigStopLoss TEXT NOT NULL,
      IsTakeProfit INTEGER NOT NULL,
      WalletPublicKey TEXT NOT NULL,
      TxId TEXT
    );
  `);
    console.log(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Profit/Loss table checked/created successfully.`);
    return true;
  } catch (error: any) {
    console.error(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Error creating profit_loss table`, 0, { error: error.message });
    return false;
  }
}

/**
 * Insert a new profit/loss record into the database
 * @param record Profit/loss details to insert
 * @param botName Name of the bot initiating the action
 * @param processRunCounter Process run counter for logging
 * @returns Promise resolving when the operation is complete
 */
export async function insertProfitLoss(record: ProfitLossRecord, processRunCounter: number): Promise<void> {
  let db: Database | null = null;
  const functionName = 'insertProfitLoss';
  try {
    db = await getDbConnection(db_config.tracker_holdings_path);

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
      BotName, // Use the BotName from the record if available, otherwise use the passed parameter
      ConfigTakeProfit,
      ConfigStopLoss,
      IsTakeProfit,
      WalletPublicKey,
      TxId
    } = record;

    const effectiveBotName = BotName || DEFAULT_BOT_NAME; // Prioritize record's BotName, then param, then default

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
      ConfigTakeProfit: JSON.stringify(ConfigTakeProfit),
      ConfigStopLoss: JSON.stringify(ConfigStopLoss),
      IsTakeProfit: IsTakeProfit ? 1 : 0,
      WalletPublicKey: WalletPublicKey,
      TxId: TxId,
      BotName: BotName,
      Token: Token,
      TokenName: TokenName,
      Program: Program
    };

    // Insert the record
    await db.run(`
      INSERT INTO profit_loss (
        Time, TimeDate, EntryTime, EntryTimeDate, Token, TokenName, 
        EntryBalance, ExitBalance, EntrySolPaid, ExitSolReceived, 
        TotalSolFees, ProfitLossSOL, ProfitLossUSDC, ROIPercentage,
        ProfitLossSOLWithFees, ProfitLossUSDCWithFees, ROIPercentageWithFees,
        EntryPriceUSDC, ExitPriceUSDC, HoldingTimeSeconds, Slot, Program, BotName,
        ConfigTakeProfit, ConfigStopLoss, IsTakeProfit, WalletPublicKey, TxId
      )
      VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?
      );
    `, [
      formattedRecord.Time, formattedRecord.TimeDate, formattedRecord.EntryTime, formattedRecord.EntryTimeDate,
      formattedRecord.Token, formattedRecord.TokenName, formattedRecord.EntryBalance, formattedRecord.ExitBalance,
      formattedRecord.EntrySolPaid, formattedRecord.ExitSolReceived, formattedRecord.TotalSolFees,
      formattedRecord.ProfitLossSOL, formattedRecord.ProfitLossUSDC, formattedRecord.ROIPercentage,
      formattedRecord.ProfitLossSOLWithFees, formattedRecord.ProfitLossUSDCWithFees, formattedRecord.ROIPercentageWithFees,
      formattedRecord.EntryPriceUSDC, formattedRecord.ExitPriceUSDC, formattedRecord.HoldingTimeSeconds,
      formattedRecord.Slot, formattedRecord.Program, BotName, // Use effectiveBotName here
      formattedRecord.ConfigTakeProfit, formattedRecord.ConfigStopLoss, formattedRecord.IsTakeProfit ? 1 : 0,
      formattedRecord.WalletPublicKey, formattedRecord.TxId
    ]);

    console.log(`[${effectiveBotName}]|[${functionName}]|Profit/Loss record inserted successfully`, processRunCounter, {
      Token,
      ProfitLossUSDC: formattedRecord.ProfitLossUSDC.toFixed(2),
      ROIPercentage: formattedRecord.ROIPercentage.toFixed(2),
      ProfitLossUSDCWithFees: formattedRecord.ProfitLossUSDCWithFees.toFixed(2),
      ROIPercentageWithFees: formattedRecord.ROIPercentageWithFees.toFixed(2),
      TxId
    });

  } catch (error) {
    const effectiveBotName = record.BotName;
    console.error(`[${effectiveBotName}]|[${functionName}]|Error inserting profit/loss record`, processRunCounter, { error, record });
    // Decide if you want to re-throw the error or handle it differently
    throw error; // Re-throwing the error might be appropriate for the caller to handle
  } finally {
    if (db) {
      await db.close();
    }
  }
}

/**
 * Get profit/loss records with filtering options
 * @param options Filter options
 * @param botName Optional: Name of the bot initiating the action for logging
 * @param processRunCounter Optional: Process run counter for logging
 * @returns Promise resolving to filtered profit/loss records
 */
export async function getProfitLoss(
  options?: {
    walletPublicKey?: string;
    token?: string;
    botName?: string; // Filter by BotName in the record
    startTime?: number;
    endTime?: number;
    isTakeProfit?: boolean;
    limit?: number;
    offset?: number;
  },
  processRunCounter: number = 0 // Optional logger process counter
): Promise<ProfitLossRecord[]> {
  let db: Database | null = null;
  const functionName = 'getProfitLoss';
  const effectiveBotName = options?.botName || DEFAULT_BOT_NAME;
  console.log(`[${effectiveBotName}]|[${functionName}]|Fetching profit/loss records`, processRunCounter, { options });

  try {
    db = await getDbConnection(db_config.tracker_holdings_path);

    let query = `SELECT * FROM profit_loss WHERE 1=1`;
    const params: any[] = [];

    if (options?.walletPublicKey) {
      query += ` AND WalletPublicKey = ?`;
      params.push(options.walletPublicKey);
    }

    if (options?.token) {
      query += ` AND Token = ?`;
      params.push(options.token);
    }

    // Filter by BotName stored in the record
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

    if (options?.isTakeProfit !== undefined) {
      query += ` AND IsTakeProfit = ?`;
      params.push(options.isTakeProfit ? 1 : 0);
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

    const profitLossRecords: ProfitLossRecord[] = await db.all(query, params);
    console.log(`[${effectiveBotName}]|[${functionName}]|Successfully fetched ${profitLossRecords.length} profit/loss records`, processRunCounter);
    return profitLossRecords;

  } catch (error) {
    console.error(`[${effectiveBotName}]|[${functionName}]|Error fetching profit/loss records`, processRunCounter, { error, options });
    throw error;
  } finally {
    if (db) {
      await db.close();
    }
  }
}

/**
 * Get profit/loss summary statistics
 * @param options Filter options
 * @param botName Optional: Name of the bot initiating the action for logging
 * @param processRunCounter Optional: Process run counter for logging
 * @returns Promise resolving to summary statistics
 */
export async function getProfitLossSummary(
  options?: {
    walletPublicKey?: string;
    botName?: string; // Filter by BotName in the record
    startTime?: number;
    endTime?: number;
  },
  processRunCounter: number = 0 // Optional logger process counter
): Promise<{
  totalProfit: number;
  totalProfitWithFees: number;
  averageROI: number;
  averageROIWithFees: number;
  totalTrades: number;
  profitableTrades: number;
  lossMakingTrades: number;
}> {
  let db: Database | null = null;
  const functionName = 'getProfitLossSummary';
  const effectiveBotName = options?.botName || DEFAULT_BOT_NAME;
  console.log(`[${effectiveBotName}]|[${functionName}]|Fetching profit/loss summary`, processRunCounter, { options });

  try {
    db = await getDbConnection(db_config.tracker_holdings_path);

    let query = `SELECT 
      SUM(ProfitLossUSDC) as totalProfit,
      SUM(ProfitLossUSDCWithFees) as totalProfitWithFees,
      AVG(ROIPercentage) as averageROI,
      AVG(ROIPercentageWithFees) as averageROIWithFees,
      COUNT(*) as totalTrades,
      SUM(CASE WHEN ProfitLossUSDC > 0 THEN 1 ELSE 0 END) as profitableTrades,
      SUM(CASE WHEN ProfitLossUSDC <= 0 THEN 1 ELSE 0 END) as lossMakingTrades
    FROM profit_loss WHERE 1=1`;
    
    const params: any[] = [];

    if (options?.walletPublicKey) {
      query += ` AND WalletPublicKey = ?`;
      params.push(options.walletPublicKey);
    }

    // Filter by BotName stored in the record
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

    const summary = await db.get(query, params);

    const result = {
      totalProfit: summary?.totalProfit || 0,
      totalProfitWithFees: summary?.totalProfitWithFees || 0,
      averageROI: summary?.averageROI || 0,
      averageROIWithFees: summary?.averageROIWithFees || 0,
      totalTrades: summary?.totalTrades || 0,
      profitableTrades: summary?.profitableTrades || 0,
      lossMakingTrades: summary?.lossMakingTrades || 0
    };

    console.log(`[${effectiveBotName}]|[${functionName}]|Successfully fetched profit/loss summary`, processRunCounter, { summary: result });
    return result;

  } catch (error) {
    console.error(`[${effectiveBotName}]|[${functionName}]|Error fetching profit/loss summary`, processRunCounter, { error, options });
    throw error;
  } finally {
    if (db) {
      await db.close();
    }
  }
} 