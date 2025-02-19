import { createLogger, format, transports, Logger as WinstonLogger } from 'winston';
import sqlite3 from 'sqlite3';
import path from 'path';

interface LoggerConfig {
  terminal?: boolean;
  file?: boolean;
  db?: boolean;
  dbPath?: string;
  logFilePath?: string;
}

class Logger {
  private winston: WinstonLogger = createLogger({ transports: [] });
  private db: sqlite3.Database | null = null;
  private config: LoggerConfig;

  constructor(config: LoggerConfig = { terminal: true }) {
    this.config = config;
    this.initializeLogger();
    this.initializeDB();
  }

  private initializeLogger() {
    const loggerTransports: any[] = [];

    // Add console transport if terminal is enabled
    if (this.config.terminal) {
      loggerTransports.push(new transports.Console({
        format: format.combine(
          format.colorize(),
          format.timestamp(),
          format.printf((info) => {
            return `[${info.timestamp}] ${info.level}: ${info.message}`;
          })
        )
      }));
    }

    // Add file transport if file logging is enabled
    if (this.config.file && this.config.logFilePath) {
      loggerTransports.push(new transports.File({
        filename: this.config.logFilePath,
        format: format.combine(
          format.timestamp(),
          format.json()
        )
      }));
    }

    this.winston = createLogger({
      transports: loggerTransports
    });
  }

  private initializeDB() {
    if (this.config.db && this.config.dbPath) {
      this.db = new sqlite3.Database(this.config.dbPath);
      
      // Create logs table if it doesn't exist
      this.db.run(`
        CREATE TABLE IF NOT EXISTS logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          level TEXT,
          message TEXT
        )
      `);
    }
  }

  private async logToDB(level: string, message: string) {
    if (this.db) {
      return new Promise((resolve, reject) => {
        this.db?.run(
          'INSERT INTO logs (level, message) VALUES (?, ?)',
          [level, message],
          (err) => {
            if (err) reject(err);
            else resolve(true);
          }
        );
      });
    }
  }

  private async log(level: string, message: string) {
    // Log to winston (handles both console and file based on configuration)
    this.winston.log(level, message);

    // Log to database if enabled
    if (this.config.db) {
      await this.logToDB(level, message);
    }
  }

  async info(message: string) {
    await this.log('info', message);
  }

  async error(message: string) {
    await this.log('error', message);
  }

  async warn(message: string) {
    await this.log('warn', message);
  }

  async debug(message: string) {
    await this.log('debug', message);
  }

  // Method to close connections
  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

// Create default instance with only terminal logging
const defaultLogger = new Logger();

// Override console methods
console.log = (...args) => defaultLogger.info(args.join(' '));
console.error = (...args) => defaultLogger.error(args.join(' '));
console.warn = (...args) => defaultLogger.warn(args.join(' '));

// Export both the class and default instance
export { Logger, defaultLogger };
