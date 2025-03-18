import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { open, Statement } from 'sqlite';
import { config } from './config';
import { v4 as uuidv4 } from 'uuid';
import { initializeDiscordClient, getDiscordChannel, sendMessageOnDiscord } from "../bots/discord/discordSend";

// Logger class to handle logging to console, file, and database
class Logger {
  private dbConnection: any = null;
  private logs: any[] = [];
  private runPrefix: string = '';
  private moduleName: string = '';
  private logsTableName: string = '';
  private originalConsoleLog: any;
  private originalConsoleError: any;
  private originalConsoleWarn: any;
  private discordChannel: string = '';
  private discordEnabled: boolean = false;

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
      console.log('ℹ️ Discord  logging is disabled by SEND_TO_DISCORD setting');
    } else if (!process.env.SEND_TO_DISCORD) {
      console.log('ℹ️ Discord  logging is disabled (SEND_TO_DISCORD not set)');
    } else if (this.discordEnabled) {
      console.log('✅ Discord  logging is enabled');
    } else {
      console.log('🚫 Discord  logging is disabled - missing DISCORD_BOT_TOKEN or DISCORD_CT_TRACKER_CHANNEL');
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
      try {
        this.dbConnection = await open({
          filename: config.logger.db_logs_path,
          driver: sqlite3.Database
        });

        // Configure SQLite for better concurrency
        await this.dbConnection.exec('PRAGMA journal_mode = WAL');
        await this.dbConnection.exec('PRAGMA busy_timeout = 10000');

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
      } catch (error) {
        this.originalConsoleError(`${config.name}|[logger]|Failed to initialize logger database:`, 0, error);
      }
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

    // Save to database and wait for it to complete
    if (this.logs.length > 10) {
      try {
        this.saveLogs();
      } catch (error) {
        this.originalConsoleError(`${config.name}|[logger]|Failed to save logs on cycle change:`, 0, error);
      }
    }
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
      console.error(`${config.name}|[logger]|Failed to write logs to file:`, 0, error);
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

  private async retryOperation<T>(operation: () => Promise<T>, maxRetries: number = 3): Promise<T> {
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        if (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED') {
          // Wait with exponential backoff: 100ms, 200ms, 400ms
          await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt - 1)));
          continue;
        }
        throw error;
      }
    }
    throw lastError;
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

    let stmt: Statement | undefined;
    try {
      await this.retryOperation(async () => {
        // Begin transaction
        await this.dbConnection.exec('BEGIN IMMEDIATE TRANSACTION');

        // Insert logs
        const preparedStmt = await this.dbConnection.prepare(`
          INSERT INTO ${this.logsTableName} (date, time, run_prefix, full_message, message, module, function, type, data, cycle, tag)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt = preparedStmt;

        for (const log of this.logs) {
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
        await this.dbConnection.exec('COMMIT');
      });

      // Clear logs array
      this.logs = [];
    } catch (error) {
      try {
        // Only try to rollback if we successfully began the transaction
        await this.dbConnection.exec('ROLLBACK');
      } catch (rollbackError) {
        // Ignore rollback errors as the transaction might have already been rolled back
      }
      this.originalConsoleError(`${config.name}|[logger]|Failed to save logs to database:`, error);
    } finally {
      // Ensure statement is finalized
      if (stmt?.finalize) {
        await stmt.finalize();
      }
    }
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
      const emoji = logEntry.type === 'error' ? '🚨' : '⚠️';
      const modulePart = logEntry.module ? `[${logEntry.module}]` : '';
      const functionPart = logEntry.function ? `[${logEntry.function}]` : '';
      const tagPart = logEntry.tag ? `[${logEntry.tag}]` : '';
      
      // Create a formatted message with timestamp and details
      const formattedMessage = [
        `${emoji} **${logEntry.type.toUpperCase()}** ${emoji} - ${logEntry.date} ${logEntry.time}`,
        `${modulePart}${functionPart}${tagPart} ${logEntry.message}`
      ];

      // Send the message to Discord
      return await sendMessageOnDiscord(this.discordChannel, [formattedMessage.join('\n')]);
    } catch (error) {
      this.originalConsoleError(`${config.name}|[logger]|Failed to send log to Discord:`, error);
      return false;
    }
  }

  /**
   * Close the logger and save any pending logs
   */
  async close() {
    // Save any pending logs
    await this.saveLogs();
    
    // Close database connection
    if (this.dbConnection) {
      await this.dbConnection.close();
    }
    
    // Shutdown Discord client if it was initialized
    if (this.discordEnabled) {
      try {
        await import("../bots/discord/discordSend").then(async (module) => {
          await module.shutdownDiscordClient();
        });
      } catch (error) {
        this.originalConsoleError('Error shutting down Discord client:', error);
      }
    }
  }
}

// Create singleton instance
const logger = new Logger();

export default logger;