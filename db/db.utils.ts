import { open, Database } from 'sqlite';
import sqlite3 from 'sqlite3';
import { db_config } from './db.config';
import { createTableHoldings } from './db.holding'; // Import from specific file
import { createTableProfitLoss } from './db.profit-loss'; // Import from specific file
import { createTableTransactions } from './db.transactions'; // Import from specific file
import { createTableNewTokens } from './db.tokens'; // Import from specific file
import { createTableBotConfig } from './db.bots-config'; // Import from specific file
import { createTableHistoricalData } from './db.historical-data'; // Import from specific file
// Import logs table creator
import { createTableLogs } from './db.logs';

const DEFAULT_BOT_NAME = 'db.utils';

/**
 * Helper function to convert timestamps to ISO date strings
 * This handles both milliseconds and seconds timestamp formats
 * @param timestamp The timestamp to convert
 * @returns ISO date string
 */
export function convertTimestampToISO(timestamp: number): string {
  // If timestamp represents seconds (Unix timestamp), convert to ms
  // We assume timestamps before year 2001 (timestamp < 1000000000000) are in seconds
  const timeMs = timestamp < 1000000000000 ? timestamp * 1000 : timestamp;
  return new Date(timeMs).toISOString();
}

/**
 * Initialize all database tables at application startup by opening each DB file
 * and calling the respective table creation functions.
 * @returns Promise resolving to a boolean indicating success of all creations.
 */
export async function initializeDatabaseTables(): Promise<boolean> {
  const functionName = 'initializeDatabaseTables';
  console.log(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Initializing database tables...`);
  
  let allCreated = true;
  let db: Database | null = null;

  // Define all the database paths to initialize from db_config
  const dbPaths = [
    { path: db_config.tracker_holdings_path, tables: [createTableHoldings, createTableNewTokens, createTableProfitLoss, createTableTransactions] },
    { path: db_config.bot_config_path, tables: [createTableBotConfig] },
    { path: db_config.historical_data_path, tables: [createTableHistoricalData] }
  ];

  try {
    // Initialize each database path
    for (const dbConfig of dbPaths) {
      console.log(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Opening DB: ${dbConfig.path}`);
      db = await open({ filename: dbConfig.path, driver: sqlite3.Database });
      
      // Initialize all tables for this database
      for (const createTableFn of dbConfig.tables) {
        const tableCreated = await createTableFn(db);
        if (!tableCreated) {
          console.warn(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Failed to initialize table in ${dbConfig.path}`);
          allCreated = false;
        }
      }
      
      await db.close();
      console.log(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Closed DB: ${dbConfig.path}`);
      db = null;
    }

    // Handle logs databases for each module
    const apps = [
      'tracker-bot',
      'solana-sniper-bot',
      'telegram-trading-bot',
      'twitter-tracker-bot',
      'api'
    ];
    
    for (const moduleName of apps) {
      const logPath = db_config.logs_path(moduleName);
      console.log(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Opening logs DB: ${logPath}`);
      
      try {
        db = await open({ filename: logPath, driver: sqlite3.Database });
        const logsCreated = await createTableLogs(db, moduleName);
        await db.close();
        
        console.log(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Closed logs DB: ${logPath}`);
        if (!logsCreated) {
          console.warn(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Failed to initialize logs table for ${moduleName}`);
          allCreated = false;
        }
      } catch (error: any) {
        console.error(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Error initializing logs database for ${moduleName}`, 0, { error: error.message });
        if (db) {
          try { await db.close(); } catch (closeError) { /* Ignore close errors during error handling */ }
        }
        allCreated = false;
      }
      
      db = null;
    }

    if (allCreated) {
      console.log(`[${DEFAULT_BOT_NAME}]|[${functionName}]|All required database tables initialized successfully.`);
    } else {
      console.warn(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Some database tables failed to initialize.`);
    }
    return allCreated;

  } catch (error: any) {
    console.error(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Error initializing database tables`, 0, { error: error.message });
    // Ensure DB is closed even if error occurs mid-process
    if (db) {
      try { await db.close(); } catch (closeError: any) { 
         console.error(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Error closing database connection during error handling`, 0, { error: closeError.message });
      }
    }
    return false;
  } 
  // No finally block needed as DB closing is handled within try and catch
}

/**
 * Get a database connection using the sqlite wrapper (promisified)
 * @param dbPath Path to the database file
 * @returns Database connection object
 */
export async function getDbConnection(dbPath: string): Promise<Database> {
  // No logging here, keep it clean for frequent calls
  return open<sqlite3.Database>({
    filename: dbPath,
    driver: sqlite3.Database,
  });
}

/**
 * Validates if a module name follows the correct pattern
 * @param moduleName Name of the module to validate
 * @returns Boolean indicating if the module name is valid
 */
export function validateModuleName(moduleName: string): boolean {
    return typeof moduleName === 'string' && /^[a-zA-Z0-9_-]+$/.test(moduleName);
  }
  
  /**
   * Validates if a date string follows the correct format (YYYY-MM-DD)
   * @param dateString Date string to validate
   * @returns Boolean indicating if the date string is valid
   */
  export function validateDateFormat(dateString: string): boolean {
    return typeof dateString === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateString);
  }
  