import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { config } from './config';
import { v4 as uuidv4 } from 'uuid';

// Logger class to handle logging to console, file, and database
class Logger {
  private dbConnection: any = null;
  private logs: any[] = [];
  private cycle: number = 0;
  private runPrefix: string = '';
  private moduleName: string = '';
  private logsTableName: string = '';
  private originalConsoleLog: any;
  private originalConsoleError: any;
  private originalConsoleWarn: any;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.moduleName = config.name;
    this.logsTableName = `${this.moduleName.replace(/-/g, '_')}`;
    this.runPrefix = uuidv4();
    this.originalConsoleLog = console.log;
    this.originalConsoleError = console.error;
    this.originalConsoleWarn = console.warn;
  }

  /**
   * Initialize the logger
   */
  async init() {
    // Override console methods
    this.overrideConsoleMethods();

    // Create logs directory if it doesn't exist
    if (config.logger.file_logs) {
      const logsDir = path.dirname(config.logger.file_logs_path);
      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
      }
    }

    // Initialize database if needed
    if (config.logger.db_logs) {
      try {
        this.dbConnection = await open({
          filename: config.logger.db_logs_path,
          driver: sqlite3.Database
        });

        // Create logs table if it doesn't exist
        await this.dbConnection.exec(`
          CREATE TABLE IF NOT EXISTS ${this.logsTableName} (
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
          )
        `);

        // Initial cleanup
        await this.cleanOldLogs();
        
        // Set up daily cleanup
        this.setupDailyCleanup();
      } catch (error) {
        this.originalConsoleError('Failed to initialize logger database:', error);
      }
    }
  }

  /**
   * Set up daily cleanup of old logs
   */
  private setupDailyCleanup() {
    // Clear any existing interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    
    // Calculate time until next midnight
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    const timeUntilMidnight = tomorrow.getTime() - now.getTime();
    
    // Set initial timeout to run at midnight
    setTimeout(() => {
      // Run cleanup
      this.cleanOldLogs().catch(error => {
        this.originalConsoleError('Error during daily log cleanup:', error);
      });
      
      // Then set up daily interval (24 hours = 86400000 ms)
      this.cleanupInterval = setInterval(async () => {
        try {
          await this.cleanOldLogs();
        } catch (error) {
          this.originalConsoleError('Error during daily log cleanup:', error);
        }
      }, 86400000);
    }, timeUntilMidnight);
    
    this.originalConsoleLog(`[${this.moduleName}]|[logger]| Log cleanup scheduled to run at midnight`);
  }

  /**
   * Override console methods to use our logger
   */
  private overrideConsoleMethods() {
    console.log = (...args: any[]) => {
      this.log('info', args);
      if (config.logger.terminal_logs) {
        this.originalConsoleLog(...args);
      }
    };

    console.error = (...args: any[]) => {
      this.log('error', args);
      if (config.logger.terminal_logs) {
        this.originalConsoleError(...args);
      }
    };

    console.warn = (...args: any[]) => {
      this.log('warn', args);
      if (config.logger.terminal_logs) {
        this.originalConsoleWarn(...args);
      }
    };
  }

  /**
   * Parse the message to extract module, function, and actual message
   */
  private parseMessage(message: string): { module: string, func: string, message: string } {
    const parts = message.split('|');
    if (parts.length >= 3) {
      return {
        module: parts[0].replace('[', '').replace(']', '').trim(),
        func: parts[1].replace('[', '').replace(']', '').trim(),
        message: parts.slice(2).join('|').trim()
      };
    }
    return {
      module: this.moduleName,
      func: 'unknown',
      message: message
    };
  }

  /**
   * Log a message
   */
  private log(type: 'info' | 'error' | 'warn', args: any[]) {
    if (!args.length) return;

    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toISOString().split('T')[1].split('.')[0];
    
    let message = args[0]?.toString() || '';
    let cycle = 0;
    let data = null;
    let tag = '';

    // Parse arguments
    if (args.length >= 2 && typeof args[1] === 'number') {
      // If a cycle is provided and it's different from the current cycle, save logs first
      this.setCycle(args[1]);
      cycle = args[1];
    }

    if (args.length >= 3) {
      data = args[2];
    }

    if (args.length >= 4) {
      tag = args[3]?.toString() || '';
    }

    // Parse message to extract module, function, and actual message
    const parsedMessage = this.parseMessage(message);

    // Create log entry
    const logEntry = {
      date,
      time,
      run_prefix: this.runPrefix,
      full_message: message,
      message: parsedMessage.message,
      module: parsedMessage.module,
      function: parsedMessage.func,
      type,
      data: data ? JSON.stringify(data) : null,
      cycle,
      tag
    };

    // Add to logs array for database
    this.logs.push(logEntry);
  }

  /**
   * Format a log entry for file output
   */
  private formatLogForFile(logEntry: any): string {
    return `
*****[${logEntry.date}] [${logEntry.time}] [${logEntry.type}][${logEntry.module}] [${logEntry.function}]${logEntry.tag ? `[${logEntry.tag}]` : ''} ************
[${logEntry.message}]
${logEntry.data ? `DATA: \n[${this.prettyJson(logEntry.data)}]` : ''}
***********************************************************************************************************
`;
  }

  /**
   * Save logs to file synchronously
   */
  private saveFileLogsSync() {
    if (!config.logger.file_logs || this.logs.length === 0) {
      return;
    }

    try {
      let logContent = '';
      for (const log of this.logs) {
        logContent += this.formatLogForFile(log);
      }
      
      fs.appendFileSync(config.logger.file_logs_path, logContent);
    } catch (error) {
      this.originalConsoleError('Failed to write logs to file:', error);
    }
  }
  /**
   * Format JSON for pretty printing
   */
  private prettyJson(jsonString: string): string {
    try {
      const parsed = JSON.parse(jsonString);
      return JSON.stringify(parsed, null, 2);
    } catch (e) {
      return jsonString;
    }
  }

  /**
   * Save logs to database
   */
  async saveLogs() {
    // Save to file first
    this.saveFileLogsSync();
    
    // Then save to database
    if (!config.logger.db_logs || !this.dbConnection || this.logs.length === 0) {
      return;
    }

    try {
      // Begin transaction
      await this.dbConnection.exec('BEGIN TRANSACTION');

      // Insert logs
      const stmt = await this.dbConnection.prepare(`
        INSERT INTO ${this.logsTableName} (date, time, run_prefix, full_message, message, module, function, type, data, cycle, tag)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const log of this.logs) {
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

      // Commit transaction
      await this.dbConnection.exec('COMMIT');

      // Clear logs array
      this.logs = [];
    } catch (error) {
      // Rollback transaction on error
      await this.dbConnection.exec('ROLLBACK');
      this.originalConsoleError('Failed to save logs to database:', error);
    }
  }

  /**
   * Clean old logs from database
   */
  private async cleanOldLogs() {
    if (!config.logger.db_logs || !this.dbConnection) {
      return;
    }

    try {
      this.originalConsoleLog(`[${this.moduleName}]|[logger]| Cleaning logs older than ${config.logger.keeping_days_in_db} days`);
      
      const keepingDays = config.logger.keeping_days_in_db;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - keepingDays);
      const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

      // Delete logs older than the cutoff date
      const result = await this.dbConnection.run(`DELETE FROM ${this.logsTableName} WHERE date < ?`, cutoffDateStr);
      
      this.originalConsoleLog(`[${this.moduleName}]|[logger]| Cleaned ${result.changes} old log entries`);
    } catch (error) {
      this.originalConsoleError('Failed to clean old logs:', error);
    }
  }

  /**
   * Set the current cycle
   */
  setCycle(cycle: number) {
    // If cycle is changing and we have logs, save them first
    if (cycle > this.cycle && (this.logs.length > 0)) {
      const oldCycle = this.cycle;
      // Update cycle before saving so logs are saved with the correct cycle
      this.cycle = cycle;
      this.originalConsoleLog(`[${this.moduleName}]|[logger]| Cycle changing from ${oldCycle} to ${cycle}, saving logs`);
      
      // Save to database
      this.saveLogs().catch(error => {
        this.originalConsoleError('Failed to save logs on cycle change:', error);
      });
    }
  }

  /**
   * Close the logger and save any pending logs
   */
  async close() {
    // Clear the cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    await this.saveLogs();
    
    if (this.dbConnection) {
      await this.dbConnection.close();
    }
  }
}

// Create singleton instance
const logger = new Logger();

export default logger;
