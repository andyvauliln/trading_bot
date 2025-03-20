import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open, Statement } from 'sqlite';
import { config } from './config';
import { v4 as uuidv4 } from 'uuid';
import { initializeDiscordClient, getDiscordChannel, sendMessageOnDiscord } from "../discord/discordSend";

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

  // Add method to check if mutex is locked
  isLocked(): boolean {
    return this.locked;
  }
}

// Logger class to handle logging to console, file, and database
class Logger {
  private dbConnection: any = null;
  private logs: any[] = [];
  private logBatchQueue: any[][] = []; // Queue for batches of logs waiting to be saved
  private cycle: number = 0;
  private runPrefix: string = '';
  private moduleName: string = '';
  private logsTableName: string = '';
  private originalConsoleLog: any;
  private originalConsoleError: any;
  private originalConsoleWarn: any;
  private discordChannel: string = '';
  private discordEnabled: boolean = false;
  private dbMutex = new Mutex(); // Mutex to prevent concurrent database operations
  private saveInProgress: boolean = false; // Flag to prevent concurrent save operations
  private isInTransaction: boolean = false; // Flag to track transaction state
  private lastSaveAttempt: number = 0; // Timestamp of last save attempt
  private lastVacuumTime: number = 0; // Timestamp of last database vacuum

  constructor() {
    this.moduleName = config.name;
    this.logsTableName = `${this.moduleName.replace(/-/g, '_')}`;
    this.runPrefix = uuidv4();
    this.originalConsoleLog = console.log;
    this.originalConsoleError = console.error;
    this.originalConsoleWarn = console.warn;

    // Initialize Discord settings
    this.discordChannel = process.env.DISCORD_CT_TRACKER_CHANNEL || '';
    
    // Check if Discord logging is explicitly enabled/disabled via SEND_TO_DISCORD flag
    const sendToDiscord = process.env.SEND_TO_DISCORD?.toLowerCase();
    const isDiscordExplicitlyEnabled = sendToDiscord === 'true' || sendToDiscord === '1' || sendToDiscord === 'yes';
    const isDiscordExplicitlyDisabled = sendToDiscord === 'false' || sendToDiscord === '0' || sendToDiscord === 'no';
    
    // Enable Discord only if:
    // 1. SEND_TO_DISCORD is explicitly set to true/1/yes, AND
    // 2. We have both a bot token and channel ID
    this.discordEnabled = isDiscordExplicitlyEnabled && 
                          !!process.env.DISCORD_BOT_TOKEN && 
                          !!this.discordChannel;
    
    if (isDiscordExplicitlyDisabled) {
      console.log(`${config.name}|[logger]|ℹ️ Discord logging is disabled by SEND_TO_DISCORD setting`);
    } else if (!process.env.SEND_TO_DISCORD) {
      console.log(`${config.name}|[logger]|ℹ️ Discord logging is disabled (SEND_TO_DISCORD not set)`);
    } else if (this.discordEnabled) {
      console.log(`${config.name}|[logger]|✅ Discord logging is enabled`);
    } else {
      console.log(`${config.name}|[logger]|🚫 Discord logging is disabled - missing DISCORD_BOT_TOKEN or DISCORD_CT_TRACKER_CHANNEL`);
    }
  }

  /**
   * Initialize the database for better performance and reliability
   */
  private async initializeDatabase() {
    if (!config.logger.db_logs) {
      return;
    }

    try {
      // Ensure the database directory exists
      const dbDir = path.dirname(config.logger.db_logs_path);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      // Close any existing connection
      if (this.dbConnection) {
        try {
          await this.dbConnection.close();
        } catch (err) {
          // Ignore errors during closing
        }
      }

      // Attempt to open the database with retry logic
      let attempts = 0;
      const maxAttempts = 3;
      
      while (attempts < maxAttempts) {
        try {
          // Open the database with improved settings
          this.dbConnection = await open({
            filename: config.logger.db_logs_path,
            driver: sqlite3.Database
          });
          
          // Successfully opened
          break;
        } catch (err) {
          attempts++;
          
          this.originalConsoleWarn(`${config.name}|[logger]|Database open attempt ${attempts} failed:`, err);
          
          if (attempts >= maxAttempts) {
            throw err;
          }
          
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Configure SQLite for better concurrency and performance
      // Use a longer busy_timeout to allow other processes to complete their operations
      await this.dbConnection.exec('PRAGMA journal_mode = WAL');
      await this.dbConnection.exec('PRAGMA busy_timeout = 60000'); // Increase to 60 seconds
      await this.dbConnection.exec('PRAGMA synchronous = NORMAL');
      await this.dbConnection.exec('PRAGMA temp_store = MEMORY');
      await this.dbConnection.exec('PRAGMA cache_size = 10000'); // Increase cache size
      await this.dbConnection.exec('PRAGMA page_size = 4096');
      await this.dbConnection.exec('PRAGMA mmap_size = 30000000');
      await this.dbConnection.exec('PRAGMA foreign_keys = ON');
      await this.dbConnection.exec('PRAGMA auto_vacuum = INCREMENTAL');

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

      // Optimize table structure
      await this.dbConnection.exec(`PRAGMA optimize_table=${this.logsTableName}`);

      // Create indexes for better query performance - add IF NOT EXISTS to prevent errors
      await this.dbConnection.exec(`CREATE INDEX IF NOT EXISTS idx_${this.logsTableName}_run_prefix ON ${this.logsTableName}(run_prefix)`);
      await this.dbConnection.exec(`CREATE INDEX IF NOT EXISTS idx_${this.logsTableName}_cycle ON ${this.logsTableName}(cycle)`);
      await this.dbConnection.exec(`CREATE INDEX IF NOT EXISTS idx_${this.logsTableName}_date ON ${this.logsTableName}(date)`);
      await this.dbConnection.exec(`CREATE INDEX IF NOT EXISTS idx_${this.logsTableName}_type ON ${this.logsTableName}(type)`);

      // Checkpoint WAL file to ensure it doesn't grow too large
      await this.dbConnection.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      
      // Only VACUUM if it's been a while (vacuum is an expensive operation)
      const now = Date.now();
      if (now - this.lastVacuumTime > 86400000) { // 24 hours
        this.originalConsoleLog(`${config.name}|[logger]|Running initial VACUUM on database`);
        await this.dbConnection.exec('VACUUM');
        this.lastVacuumTime = now;
      }

      this.originalConsoleLog(`${config.name}|[logger]|Database initialized successfully`);

    } catch (error) {
      this.originalConsoleError(`${config.name}|[logger]|Failed to initialize database:`, error);
      // Set dbConnection to null so we don't try to use it
      this.dbConnection = null;
      // If we fail to initialize after retries, we'll fallback to file logging only
    }
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

    // Initialize Discord client if enabled
    if (this.discordEnabled) {
      try {
        const discordClient = await initializeDiscordClient();
        if (discordClient) {
          console.log(`${config.name}|[logger]|✅ Discord client initialized for error logging`);
          
          // Test the channel to ensure it exists
          const channel = await getDiscordChannel(this.discordChannel);
          if (channel) {
            console.log(`${config.name}|[logger]|✅ Successfully connected to Discord error channel: ${this.discordChannel}`);
          } else {
            console.warn(`${config.name}|[logger]|⚠️ Could not find Discord error channel with ID: ${this.discordChannel}`);
            this.discordEnabled = false;
          }
        } else {
          console.warn(`${config.name}|[logger]|⚠️ Failed to initialize Discord client for error logging`);
          this.discordEnabled = false;
        }
      } catch (error) {
        console.error(`${config.name}|[logger]|🚫 Error initializing Discord for error logging:`, error);
        this.discordEnabled = false;
      }
    }

    // Initialize database if needed
    if (config.logger.db_logs) {
      await this.initializeDatabase();
    }
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

    // Send error and warning logs to Discord
    if ((type === 'error' || type === 'warn' || tag !== '') && this.discordEnabled) {
      // Use a non-blocking call to avoid delaying the logging process
      this.sendLogsToDiscord(logEntry).catch(err => {
        this.originalConsoleError(`${config.name}|[logger]|Failed to send log to Discord:`, err);
      });
    }

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
      this.originalConsoleError(`${config.name}|[logger]|Failed to write logs to file:`, error);
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
   * Check the actual transaction state in the database
   * This helps ensure our isInTransaction flag matches reality
   */
  private async checkTransactionState(): Promise<boolean> {
    try {
      // SQLite keeps track of transaction state in a special table
      const result = await this.dbConnection.get("PRAGMA transaction_status");
      return result && result.transaction_status !== 0;
    } catch (error) {
      // If we can't check, assume we're not in a transaction to be safe
      return false;
    }
  }

  private async retryOperation<T>(operation: () => Promise<T>, maxRetries: number = 10): Promise<T> {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        
        // Reset transaction state if SQLite already rolled back
        if (error.code === 'SQLITE_ERROR') {
          if (error.message?.includes('no transaction is active')) {
            this.isInTransaction = false;
          } else if (error.message?.includes('cannot start a transaction within a transaction')) {
            await this.forceRollbackTransaction();
            continue; // Try again after rollback
          }
        }
        
        if (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED') {
          // Log retry attempt
          this.originalConsoleLog(`${config.name}|[logger]|Database busy/locked, retrying operation (attempt ${attempt}/${maxRetries})`);
          
          // Wait with exponential backoff: longer delays
          // 1000ms, 2000ms, 4000ms, 8000ms, 16000ms, etc.
          const delay = 1000 * Math.pow(2, attempt - 1);
          const cappedDelay = Math.min(delay, 30000); // Cap at 30 seconds
          await new Promise(resolve => setTimeout(resolve, cappedDelay));
          
          // Check database connection and reinitialize if needed
          if (!this.dbConnection) {
            this.originalConsoleLog(`${config.name}|[logger]|Attempting to reinitialize database connection...`);
            await this.initializeDatabase();
          }
          
          // Ensure we're not in a transaction before retrying
          await this.forceRollbackTransaction();
          continue;
        }
        throw error;
      }
    }
    throw lastError;
  }

  private async beginTransaction() {
    try {
      // Double-check if we're actually in a transaction in the database
      const actuallyInTransaction = await this.checkTransactionState();
      
      if (actuallyInTransaction || this.isInTransaction) {
        // Instead of warning, log at debug level since this is expected behavior
        this.isInTransaction = true;
        await this.forceRollbackTransaction();
      }
      
      await this.dbConnection.exec('BEGIN IMMEDIATE TRANSACTION');
      this.isInTransaction = true;
      // Add transaction tracking log
      this.originalConsoleLog(`${config.name}|[logger]|Transaction STARTED successfully`);
    } catch (error: any) {
      if (error.code === 'SQLITE_ERROR' && error.message?.includes('no transaction is active')) {
        this.isInTransaction = false;
      }
      throw error;
    }
  }

  private async commitTransaction() {
    try {
      // Verify we actually have an active transaction before committing
      if (!this.isInTransaction) {
        // Log at debug level only since this is now expected
        return;
      }
      
      const actuallyInTransaction = await this.checkTransactionState();
      if (!actuallyInTransaction) {
        // Log at debug level only since this is now expected
        this.isInTransaction = false;
        return;
      }
      
      await this.dbConnection.exec('COMMIT');
      this.isInTransaction = false;
      // Add transaction tracking log
      this.originalConsoleLog(`${config.name}|[logger]|Transaction COMMITTED successfully`);
    } catch (error: any) {
      this.originalConsoleError(`${config.name}|[logger]|Transaction COMMIT failed: ${error.message}`);
      if (error.code === 'SQLITE_ERROR' && error.message?.includes('no transaction is active')) {
        this.isInTransaction = false;
      }
      throw error;
    }
  }

  /**
   * Force rollback regardless of our internal state
   * This is used as a recovery mechanism when we detect inconsistencies
   */
  private async forceRollbackTransaction() {
    try {
      // Try to rollback even if our flag says we're not in a transaction
      await this.dbConnection.exec('ROLLBACK');
      // Log successful rollback
      this.originalConsoleLog(`${config.name}|[logger]|Transaction ROLLED BACK successfully`);
    } catch (error: any) {
      // Only warn about errors that aren't "no transaction is active"
      if (!(error.code === 'SQLITE_ERROR' && error.message?.includes('no transaction is active'))) {
        this.originalConsoleError(`${config.name}|[logger]|Transaction ROLLBACK failed: ${error.message}`);
      }
    } finally {
      this.isInTransaction = false;
    }
  }

  private async rollbackTransaction() {
    try {
      if (!this.isInTransaction) {
        return;
      }
      await this.dbConnection.exec('ROLLBACK');
    } catch (error: any) {
      // Ignore rollback errors as the transaction might have already been rolled back
      if (error.code === 'SQLITE_ERROR' && error.message?.includes('no transaction is active')) {
        // Do nothing, this is expected sometimes
      } else {
        this.originalConsoleWarn(`${config.name}|[logger]|Error during rollback:`, error);
      }
    } finally {
      this.isInTransaction = false;
    }
  }

  /**
   * Save logs to database with improved transaction handling and concurrency control
   */
  async saveLogs() {
    // Skip if no logs to save
    if (this.logs.length === 0) {
      return;
    }
    
    // Make a copy of the logs array and clear the original to allow new logs to be collected
    const logsToSave = [...this.logs];
    this.logs = [];
    
    // Add to batch queue if a save is already in progress or mutex is locked
    if (this.saveInProgress || this.dbMutex.isLocked()) {
      this.logBatchQueue.push(logsToSave);
      this.originalConsoleLog(`${config.name}|[logger]|Queued ${logsToSave.length} logs. Total queued batches: ${this.logBatchQueue.length + 1}`);
      return;
    }
    
    // Current time to enforce minimum delay between save attempts
    const now = Date.now();
    if (now - this.lastSaveAttempt < 2000) { // 2 second minimum delay (increased from 1 second)
      this.logBatchQueue.push(logsToSave);
      
      // If we're not currently saving, schedule the next save
      if (!this.saveInProgress) {
        setTimeout(() => this.processLogBatchQueue(), 2000);
      }
      return;
    }
    
    // Check if database connection exists, if not try to initialize it
    if (config.logger.db_logs && !this.dbConnection) {
      try {
        await this.initializeDatabase();
      } catch (error) {
        this.originalConsoleError(`${config.name}|[logger]|Failed to initialize database before saving logs:`, error);
        this.logBatchQueue.push(logsToSave);
        return;
      }
    }
    
    // Mark save as in progress
    this.saveInProgress = true;
    this.lastSaveAttempt = now;
    const logsCount = logsToSave.length;
    
    // Save to file first (outside of mutex lock since file operations are separate)
    this.saveFileLogsSync();
    
    // Then save to database
    if (!config.logger.db_logs || !this.dbConnection) {
      this.saveInProgress = false;
      // Process next batch if available
      this.processLogBatchQueue();
      return;
    }
    
    let stmt: Statement | undefined;
    let retryCount = 0;
    const MAX_DB_LOCK_RETRIES = 3;
    
    try {
      // Acquire mutex lock for database operations
      await this.dbMutex.acquire();
      
      this.originalConsoleLog(`${config.name}|[logger]|Starting to save ${logsCount} logs to database`);
      
      // Retry loop for database lock errors
      while (retryCount <= MAX_DB_LOCK_RETRIES) {
        try {
          await this.retryOperation(async () => {
            // Begin transaction
            await this.beginTransaction();
  
            // Insert logs
            const preparedStmt = await this.dbConnection.prepare(`
              INSERT INTO ${this.logsTableName} (date, time, run_prefix, full_message, message, module, function, type, data, cycle, tag)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            stmt = preparedStmt;
  
            for (const log of logsToSave) {
              await preparedStmt.run(
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
            await this.commitTransaction();
            
            // Log successful save
            this.originalConsoleLog(`${config.name}|[logger]|Successfully saved ${logsToSave.length} logs to database`);
          });
          
          // If we reach here, the operation was successful
          break;
        } catch (error: any) {
          retryCount++;
          
          if (retryCount <= MAX_DB_LOCK_RETRIES && 
              (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED')) {
            // Try recovery if we hit max retries
            if (retryCount === MAX_DB_LOCK_RETRIES) {
              this.originalConsoleLog(`${config.name}|[logger]|Persistent database lock detected, attempting recovery...`);
              
              // Release mutex before recovery
              this.dbMutex.release();
              
              // Attempt database recovery
              const recovered = await this.recoverFromDatabaseErrors();
              
              // Reacquire mutex
              await this.dbMutex.acquire();
              
              if (!recovered) {
                // If recovery failed, rethrow to handle in the catch block
                throw error;
              }
            } else {
              // Wait progressively longer between retries
              const waitTime = 5000 * Math.pow(2, retryCount);
              this.originalConsoleLog(`${config.name}|[logger]|Database locked, waiting ${waitTime/1000} seconds before retry ${retryCount}/${MAX_DB_LOCK_RETRIES}`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
            }
          } else {
            // For non-lock errors or if we've exhausted retries, rethrow
            throw error;
          }
        }
      }
    } catch (error) {
      this.originalConsoleError(`${config.name}|[logger]|Failed to save logs to database: ${error}, ${this.logs.length}`);
      
      // If we failed to save logs, put them back at the front of the queue
      this.logBatchQueue.unshift(logsToSave);
      
      // Attempt rollback
      try {
        await this.forceRollbackTransaction();
      } catch (rollbackError) {
        // Already handled in forceRollbackTransaction
      }
    } finally {
      // Ensure statement is finalized
      if (stmt?.finalize) {
        try {
          await stmt.finalize();
        } catch (error) {
          // Ignore finalization errors
        }
      }
      
      // Release the mutex
      this.dbMutex.release();
      
      // Mark save as no longer in progress
      this.saveInProgress = false;
      
      // Process next batch if available
      this.processLogBatchQueue();
    }
  }
  
  /**
   * Process the next batch of logs in the queue
   */
  private processLogBatchQueue() {
    // Skip if no logs or save is already in progress
    if (this.logBatchQueue.length === 0 || this.saveInProgress) {
      return;
    }
    
    // Take the next batch
    const nextBatch = this.logBatchQueue.shift()!;
    
    // Put logs back in the main logs array
    this.logs = [...nextBatch, ...this.logs];
    
    // Kick off save
    this.saveLogs().catch(error => {
      this.originalConsoleError(`${config.name}|[logger]|Error processing log batch: ${error}`);
      // Schedule next attempt
      setTimeout(() => this.processLogBatchQueue(), 5000);
    });
  }

  /** 
   * Send logs to Discord 
   * Sends error and warning logs to a dedicated Discord channel for monitoring
   */
  private async sendLogsToDiscord(logEntry: any): Promise<boolean> {
    if (!this.discordEnabled || !this.discordChannel) {
      return false;
    }

    try {
      // Format the message for Discord
      const emoji = logEntry.type === 'error' ? '🚨' : logEntry.type === 'warn' ? '⚠️' : '🟢';
      const modulePart = logEntry.module ? `[${logEntry.module}]` : '';
      const functionPart = logEntry.function ? `[${logEntry.function}]` : '';
      const tagPart = logEntry.tag ? `[${logEntry.tag}]` : '';
      
      // Create a formatted message with timestamp and details
      const formattedMessage = [
        `${emoji} **${logEntry.type.toUpperCase()}** ${logEntry.date} ${logEntry.time}\n`,
        `${modulePart}${functionPart}${tagPart} ${logEntry.message}\n`
      ];

      // Send the message to Discord
      return await sendMessageOnDiscord(this.discordChannel, [formattedMessage.join('\n')]);
    } catch (error) {
      this.originalConsoleError(`${config.name}|[logger]|Failed to send log to Discord:`, error);
      return false;
    }
  }

  /**
   * Perform database maintenance on a schedule or when needed
   * Enhanced to try to fix database issues
   */
  async performDatabaseMaintenance(force: boolean = false) {
    if (!this.dbConnection) return;
    
    const now = Date.now();
    // Only vacuum once per day (86400000 ms) unless forced
    if (!force && now - this.lastVacuumTime < 86400000) return;
    
    try {
      await this.dbMutex.acquire();
      
      // Wait for any ongoing operations to complete
      if (this.saveInProgress) {
        this.dbMutex.release();
        return;
      }
      
      this.originalConsoleLog(`${config.name}|[logger]|Performing database maintenance...`);
      
      // Check database integrity
      try {
        const integrityCheck = await this.dbConnection.get('PRAGMA integrity_check');
        if (integrityCheck && integrityCheck.integrity_check !== 'ok') {
          this.originalConsoleWarn(`${config.name}|[logger]|Database integrity check failed:`, integrityCheck);
        }
      } catch (error) {
        this.originalConsoleError(`${config.name}|[logger]|Error checking database integrity:`, error);
      }
      
      // Run optimizations
      await this.dbConnection.exec('PRAGMA optimize');
      await this.dbConnection.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      await this.dbConnection.exec('VACUUM');
      
      this.lastVacuumTime = now;
      this.originalConsoleLog(`${config.name}|[logger]|Database maintenance completed`);
      
    } catch (error) {
      this.originalConsoleError(`${config.name}|[logger]|Error during database maintenance:`, error);
      
      // If we encounter an error during maintenance, try to reconnect to the database
      try {
        this.originalConsoleLog(`${config.name}|[logger]|Attempting to reinitialize database connection after maintenance error`);
        await this.initializeDatabase();
      } catch (reconnectError) {
        this.originalConsoleError(`${config.name}|[logger]|Failed to reinitialize database after maintenance error:`, reconnectError);
      }
    } finally {
      this.dbMutex.release();
    }
  }

  /**
   * Recover from repeated database errors
   * This method attempts to recover from persistent database issues
   */
  private async recoverFromDatabaseErrors() {
    this.originalConsoleLog(`${config.name}|[logger]|Attempting to recover from database errors...`);

    try {
      // Close existing connection if it exists
      if (this.dbConnection) {
        await this.dbConnection.close().catch(() => {
          // Ignore errors during close
        });
        this.dbConnection = null;
      }

      // Wait a bit to ensure file system operations can complete
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Try to reopen the database with fresh settings
      await this.initializeDatabase();
      
      // Force maintenance to ensure clean state
      await this.performDatabaseMaintenance(true);
      
      this.originalConsoleLog(`${config.name}|[logger]|Database recovery completed successfully`);
      return true;
    } catch (error) {
      this.originalConsoleError(`${config.name}|[logger]|Database recovery failed:`, error);
      return false;
    }
  }

  /**
   * Set the current cycle
   */
  async setCycle(cycle: number) {
    // Update cycle immediately to avoid race conditions
    const oldCycle = this.cycle;
    this.cycle = cycle;
    
    // Only trigger a save if it's necessary, not already in progress, and we have logs
    if (cycle > oldCycle && this.logs.length > 0 && !this.saveInProgress) {
      this.originalConsoleLog(`${config.name}|[logger]|Cycle changing from ${oldCycle} to ${cycle}, saving logs`);
      
      // Save to database and wait for it to complete
      try {
        await this.saveLogs();
        
        // Perform database maintenance occasionally
        if (cycle % 100 === 0) {
          await this.performDatabaseMaintenance();
        }
      } catch (error) {
        this.originalConsoleError(`${config.name}|[logger]|Failed to save logs on cycle change: ${error}`);
      }
    }
  }

  /**
   * Close the logger and save any pending logs
   */
  async close() {
    try {
      // Acquire mutex to ensure no other operations are happening
      await this.dbMutex.acquire();
      
      await this.saveLogs();
    } finally {
      if (this.isInTransaction) {
        await this.forceRollbackTransaction();
      }
      if (this.dbConnection) {
        await this.dbConnection.close();
      }
      
      // Release mutex
      this.dbMutex.release();
      
      // Shutdown Discord client if it was initialized
      if (this.discordEnabled) {
        try {
          await import("../discord/discordSend").then(async (module) => {
            await module.shutdownDiscordClient();
          });
        } catch (error) {
          this.originalConsoleError(`${config.name}|[logger]|Error shutting down Discord client:`, error);
        }
      }
    }
  }
}

// Create singleton instance
const logger = new Logger();

export default logger;
