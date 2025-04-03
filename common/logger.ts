import { v4 as uuidv4 } from 'uuid';
import { initializeDiscordClient, getDiscordChannel, sendMessageOnDiscord } from "../services/discord/discord-send";
import { saveLogs as dbSaveLogs } from '../db/db.logs';
import { LogEntry } from '../db/db.types';

export const TAGS = {
    sell_tx_confirmed: {name: "sell-tx-confirmed", description: "Sell transaction confirmed", color: "green"},
    buy_tx_confirmed: {name: "buy-tx-confirmed", description: "Buy transaction confirmed", color: "green"},
    rug_validation: {name: "rug-validation", description: "Rug validation", color: "yellow"},
    telegram_ai_token_analysis: {name: "telegram-ai-token-analysis", description: "Telegram AI token analysis", color: "blue"},
    tokens_finished: {name: "tokens-finished", description: "Tokens finished", color: "blue"},
    no_txid: {name: "no-txid", description: "No txid", color: "red"},
    saved_in_holding: {name: "saved-in-holding", description: "Saved in holding", color: "green"},
    pnl_change_alert: {name: "pnl-change-alert", description: "PnL change alert", color: "yellow"},
  };
  
// Logger class to handle logging to console, file, and database
class Logger {
  private logs: LogEntry[] = [];
  private cycle: number = 0;
  private default_name: string = '';
  private runPrefix: string = '';
  private originalConsoleLog: any;
  private originalConsoleError: any;
  private originalConsoleWarn: any;
  private discordChannel: string = '';
  private discordEnabled: boolean = false;
  private is_db_logs_enabled: boolean = false;
  private is_terminal_logs_enabled: boolean = false;
  private excludedMessagesFromDiscord: string[] = [
    "Server responded with 429 Too Many Requests.",
  ];

  constructor() {
    this.runPrefix = uuidv4();
    this.originalConsoleLog = console.log;
    this.originalConsoleError = console.error;
    this.originalConsoleWarn = console.warn;
    this.is_db_logs_enabled = process.env.IS_DB_LOG === 'true';
    this.is_terminal_logs_enabled = process.env.IS_TERMINAL_LOG === 'true';
    

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
      console.log(`${this.default_name}|[logger]| ℹ️ Discord logging is disabled by SEND_TO_DISCORD setting`);
    } else if (!process.env.SEND_TO_DISCORD) {
      console.log(`${this.default_name}|[logger]| ℹ️ Discord logging is disabled (SEND_TO_DISCORD not set)`);
    } else if (this.discordEnabled) {
      console.log(`${this.default_name}|[logger]| ✅ Discord logging is enabled`);
    } else {
      console.log(`${this.default_name}|[logger]| 🚫 Discord logging is disabled - missing DISCORD_BOT_TOKEN or DISCORD_CT_TRACKER_CHANNEL`);
    }
  }

  /**
   * Initialize the logger
   */
  async init(default_name: string) {
    this.default_name = default_name;
    // Override console methods
    this.overrideConsoleMethods();
    console.log(`${this.default_name}|[logger]|INITIALIZING LOGGER`);
    console.log(`${this.default_name}|[logger]|DB_LOGS: ${this.is_db_logs_enabled}`);
    console.log(`${this.default_name}|[logger]|TERMINAL_LOGS: ${this.is_terminal_logs_enabled}`);

    // Initialize Discord client if enabled
    if (this.discordEnabled) {
      try {
        const discordClient = await initializeDiscordClient();
        if (discordClient) {
          console.log(`${this.default_name}|[logger]|✅ Discord client initialized for error logging`);
          
          // Test the channel to ensure it exists
          const channel = await getDiscordChannel(this.discordChannel);
          if (channel) {
            console.log(`${this.default_name}|[logger]|✅ Successfully connected to Discord error channel: ${this.discordChannel}`);
          } else {
            console.warn(`${this.default_name}|[logger]|⚠️ Could not find Discord error channel with ID: ${this.discordChannel}`);
            this.discordEnabled = false;
          }
        } else {
          console.warn(`${this.default_name}|[logger]|⚠️ Failed to initialize Discord client for error logging`);
          this.discordEnabled = false;
        }
      } catch (error) {
        console.error(`${this.default_name}|[logger]|🚫 Error initializing Discord for error logging:`, error);
        this.discordEnabled = false;
      }
    }
  }

  /**
   * Override console methods to use our logger
   */
  private overrideConsoleMethods() {
    console.log = (...args: any[]) => {
      this.log('info', args);
      if (this.is_terminal_logs_enabled) {
        this.originalConsoleLog(...args);
      }
    };

    console.error = (...args: any[]) => {
      this.log('error', args);
      if (this.is_terminal_logs_enabled) {
        this.originalConsoleError(...args);
      }
    };

    console.warn = (...args: any[]) => {
      this.log('warn', args);
      if (this.is_terminal_logs_enabled) {
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
      module: this.default_name,
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
        this.originalConsoleError(`${this.default_name}|[logger]|Failed to send log to Discord:`, err);
      });
    }

    // Add to logs array for database
    this.logs.push(logEntry);
  }

  /**
   * Save logs to database with improved transaction handling and concurrency control
   */
  async saveLogs() {
    // Skip if no logs to save
    if (this.logs.length === 0) {
      return;
    }
   
    
    // Skip if database logging is disabled
    if (!this.is_db_logs_enabled) {
      this.logs = [];
      return;
    }
    
    try {
      // Use the dbSaveLogs function from db.logs.ts which now handles database connection internally
      const success = await dbSaveLogs(this.default_name, this.logs);
      
      if (!success) {
        this.originalConsoleError(`${this.default_name}|[logger]|Failed to save logs to database`);
      }
      this.logs = [];
    } catch (error) {
      this.originalConsoleError(`${this.default_name}|[logger]|Failed to save logs to database: ${error}`);
    }
  }

  /** 
   * Send logs to Discord 
   * Sends error and warning logs to a dedicated Discord channel for monitoring
   */
  
  private async sendLogsToDiscord(logEntry: any): Promise<boolean> {
    const isExcluded = this.excludedMessagesFromDiscord.some(excludedMessage => logEntry.message.includes(excludedMessage));
    if (!this.discordEnabled || !this.discordChannel || isExcluded) {
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
        `${emoji} **${logEntry.type.toUpperCase()}** ${logEntry.date} ${logEntry.time}`,
        `${modulePart}${functionPart}${tagPart} ${logEntry.message}`,
        "\n"
      ];

      // Send the message to Discord
      return await sendMessageOnDiscord(this.discordChannel, [formattedMessage.join('\n')]);
    } catch (error) {
      this.originalConsoleError(`${this.default_name}|[logger]|Failed to send log to Discord:`, error);
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
    
    // Only trigger a save if it's necessary and we have logs
    if (cycle > oldCycle && this.logs.length > 0) {
      this.originalConsoleLog(`${this.default_name}|[logger]|Cycle changing from ${oldCycle} to ${cycle}, saving logs`);
      
      // Save to database and wait for it to complete
      try {
        await this.saveLogs();
      } catch (error) {
        this.originalConsoleError(`${this.default_name}|[logger]|Failed to save logs on cycle change: ${error}`);
      }
    }
  }

  /**
   * Close the logger and save any pending logs
   */
  async close() {
    await this.saveLogs();
    
    // Shutdown Discord client if it was initialized
    if (this.discordEnabled) {
      try {
        await import("../services/discord/discord-send").then(async (module) => {
          await module.shutdownDiscordClient();
        });
      } catch (error) {
        this.originalConsoleError(`${this.default_name}|[logger]|Error shutting down Discord client:`, error);
      }
    }
  }
}

// Create singleton instance
const logger = new Logger();

export default logger;
