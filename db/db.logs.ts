import { Database } from 'sqlite';
import path from 'path';
import { getDbConnection } from './db.utils';
import { LogEntry } from './db.types';


const DEFAULT_BOT_NAME = 'db.logs';

/**
 * Simple mutex implementation to prevent concurrent database operations
 */
class Mutex {
  private locked: boolean = false;
  private waitingQueue: Array<() => void> = [];

  async acquire(): Promise<void> {
    return new Promise<void>(resolve => {
      if (!this.locked) {
        this.locked = true;
        resolve();
      } else {
        this.waitingQueue.push(resolve);
      }
    });
  }

  release(): void {
    if (this.waitingQueue.length > 0) {
      const nextResolve = this.waitingQueue.shift();
      if (nextResolve) nextResolve();
    } else {
      this.locked = false;
    }
  }

  isLocked(): boolean {
    return this.locked;
  }
}

// Create a map to store one mutex per module
const mutexMap: Map<string, Mutex> = new Map();

/**
 * Gets or creates a mutex for a specific module
 * @param moduleName Name of the module
 * @returns Mutex instance for the module
 */
function getModuleMutex(moduleName: string): Mutex {
  const key = moduleName.replace(/-/g, '_');
  if (!mutexMap.has(key)) {
    mutexMap.set(key, new Mutex());
  }
  return mutexMap.get(key)!;
}

/**
 * Initializes database connection for a specific module
 * @param moduleName Name of the module to open database for
 * @returns Promise resolving to the database connection
 */
export async function initDatabaseConnection(moduleName: string): Promise<Database> {
  const functionName = 'initDatabaseConnection';
  const db_path = path.resolve(process.cwd(), 'data', `${moduleName}-logs.db`);
  
  console.log(`[${DEFAULT_BOT_NAME}]|[${functionName}]|DB: ${db_path}`);
  return getDbConnection(db_path);
}

/**
 * Creates a logs table for a specific module
 * @param database SQLite database connection
 * @param moduleName Name of the module (used as table name prefix)
 * @returns Promise resolving to a boolean indicating success
 */
export async function createTableLogs(database: Database, moduleName: string): Promise<boolean> {
  const functionName = 'createTableLogs';
  const tableName = `${moduleName.replace(/-/g, '_')}`;
  
  try {
    await database.exec(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        time TEXT,
        run_prefix TEXT,
        full_message TEXT,
        message TEXT,
        module TEXT,
        function TEXT,
        type TEXT,
        data TEXT,
        cycle INTEGER,
        tag TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_${tableName}_date ON ${tableName}(date);
      CREATE INDEX IF NOT EXISTS idx_${tableName}_module ON ${tableName}(module);
      CREATE INDEX IF NOT EXISTS idx_${tableName}_type ON ${tableName}(type);
      CREATE INDEX IF NOT EXISTS idx_${tableName}_tag ON ${tableName}(tag);
    `);
    console.log(`[${DEFAULT_BOT_NAME}]|[${functionName}]|${tableName} table checked/created successfully.`);
    return true;
  } catch (error: any) {
    console.error(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Error creating ${tableName} table`, 0, { error: error.message });
    return false;
  }
}


/**
 * Retrieves logs from a module's log table with optional filters
 * @param database SQLite database connection
 * @param moduleName Name of the module
 * @param filters Optional filters (date, limit)
 * @returns Promise resolving to the filtered logs
 */
export async function getLogs(
  database: Database, 
  moduleName: string, 
  filters: { date?: string, limit?: number } = {}
): Promise<any[]> {
  const functionName = 'getLogs';
  const tableName = moduleName.replace(/-/g, '_');
  
  try {
    let query = `
      SELECT *
      FROM ${tableName}
      ${filters.date ? 'WHERE date = ?' : ''}
      ORDER BY date DESC, time DESC
      ${filters.limit ? 'LIMIT ?' : ''}
    `;
    
    const params = [];
    if (filters.date) params.push(filters.date);
    if (filters.limit) params.push(filters.limit);
    
    const logs = await database.all(query, ...params);
    
    // Parse JSON data field
    return logs.map(log => ({
      ...log,
      data: log.data ? JSON.parse(log.data) : null
    }));
  } catch (error: any) {
    console.error(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Error fetching logs from ${tableName}`, 0, { error: error.message });
    return [];
  }
}

/**
 * Retrieves logs for specific tags from a module's log table
 * @param database SQLite database connection
 * @param moduleName Name of the module
 * @param tags Array of tags to filter by
 * @param limit Maximum number of logs to retrieve 
 * @returns Promise resolving to the filtered logs
 */
export async function getLogsByTags(
  database: Database,
  moduleName: string,
  tags: string[],
  limit: number = 5
): Promise<any[]> {
  const functionName = 'getLogsByTags';
  const tableName = moduleName.replace(/-/g, '_');
  
  try {
    if (!tags.length) {
      return [];
    }
    
    // Build query with placeholders for each tag
    const placeholders = tags.map(() => '?').join(' OR tag = ');
    const query = `
      SELECT *
      FROM ${tableName}
      WHERE tag = ${placeholders}
      ORDER BY date DESC, time DESC
      LIMIT ${limit}
    `;
    
    const logs = await database.all(query, ...tags);
    
    // Parse JSON data field
    return logs.map(log => ({
      ...log,
      data: log.data ? JSON.parse(log.data) : null
    }));
  } catch (error: any) {
    console.error(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Error fetching logs by tags from ${tableName}`, 0, { error: error.message, tags });
    return [];
  }
}

/**
 * Cleans old logs from a module's log table
 * @param database SQLite database connection
 * @param moduleName Name of the module (used as table name prefix)
 * @param olderThanDays Delete logs older than this many days
 * @returns Promise resolving to a boolean indicating success
 */
export async function cleanOldLogs(database: Database, moduleName: string, olderThanDays: number = 7): Promise<boolean> {
  const functionName = 'cleanOldLogs';
  const tableName = `${moduleName.replace(/-/g, '_')}`;
  
  try {
    // Calculate date cutoff (older than olderThanDays)
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    const dateString = cutoffDate.toISOString().split('T')[0];
    
    // Delete old logs
    const result = await database.run(`DELETE FROM ${tableName} WHERE date < ?`, dateString);
    console.log(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Cleaned ${result.changes} old logs from ${tableName} (older than ${dateString}).`);
    return true;
  } catch (error: any) {
    console.error(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Error cleaning old logs from ${tableName}`, 0, { error: error.message });
    return false;
  }
}

/**
 * Saves a batch of logs to the database with retry mechanism and mutex protection
 * @param moduleName Name of the module (used as table name prefix)
 * @param logs Array of log entries to save
 * @returns Promise resolving to a boolean indicating success
 */
export async function saveLogs(
  moduleName: string,
  logs: LogEntry[]
): Promise<boolean> {
  const functionName = 'saveLogs';
  const tableName = `${moduleName.replace(/-/g, '_')}`;
  
  if (!logs.length) {
    return true;
  }
  
  // Get the module-specific mutex
  const mutex = getModuleMutex(moduleName);
  
  // Check if a save operation is already in progress
  if (mutex.isLocked()) {
    console.log(`[${DEFAULT_BOT_NAME}]|[${functionName}]|A save operation is already in progress for ${moduleName}, queuing ${logs.length} logs`);
    return false;
  }
  
  // Acquire the mutex
  await mutex.acquire();
  
  let database: Database | null = null;
  
  try {
    // Get database connection
    database = await initDatabaseConnection(moduleName);
    
    // Ensure the logs table exists
    await createTableLogs(database, moduleName);
    
    let retryCount = 0;
    const MAX_RETRIES = 3;
    
    while (retryCount < MAX_RETRIES) {
      try {
        const stmt = await database.prepare(`
          INSERT INTO ${tableName} (date, time, run_prefix, full_message, message, module, function, type, data, cycle, tag)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const log of logs) {
          await stmt.run(
            log.date,
            log.time,
            log.run_prefix,
            log.full_message,
            log.message,
            log.module,
            log.function,
            log.type,
            log.data,
            log.cycle,
            log.tag
          );
        }

        await stmt.finalize();
        console.log(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Successfully saved ${logs.length} logs to database`);
        return true;
      } catch (error: any) {
        retryCount++;
        if (retryCount === MAX_RETRIES) {
          console.error(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Failed to save logs to database after ${MAX_RETRIES} attempts`, 0, { error: error.message });
          return false;
        } else {
          console.log(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Retry ${retryCount}/${MAX_RETRIES} saving logs to database`);
          await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
        }
      }
    }
    
    return false;
  } catch (error: any) {
    console.error(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Error saving logs:`, 0, { error: error.message });
    return false;
  } finally {
    // Close the database connection if it was opened
    if (database) {
      try {
        await database.close();
      } catch (error) {
        console.error(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Error closing database connection:`, 0, { error });
      }
    }
    
    // Always release the mutex, even if an error occurs
    mutex.release();
  }
} 