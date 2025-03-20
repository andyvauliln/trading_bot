import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as sqlite3 from 'sqlite3';
import { Database } from 'sqlite3';
import { TelegramConfig, Message } from './types';
import { AIMessageProcessor } from './ai-message-processing';
import { config } from './config';
import { validateAndSwapToken } from './validate-token';
import { TAGS } from '../utils/log-tags';
import logger from './logger';

class TelegramReader {
    private config: TelegramConfig;
    private session: any;
    private db: Database | null;
    private knownMessages: Set<string>; // Will store "channelName:messageId" as composite key
    private aiProcessor: AIMessageProcessor;
    private processRunCounter: number;
    private isShuttingDown: boolean;
    private channelRateLimitRetries: Map<string, number>; // Track retry attempts per channel

    constructor(param_config: TelegramConfig) {
        this.config = param_config || config;
        this.db = null;
        this.session = null;
        this.knownMessages = new Set<string>();
        this.processRunCounter = 1;
        this.isShuttingDown = false;
        this.channelRateLimitRetries = new Map<string, number>();
        // Initialize AI message processor with config
        this.aiProcessor = new AIMessageProcessor(this.config?.ai_config);
    }

    async start() {
        try {
            // Initialize session
            this.session = axios.create({
                baseURL: this.config.base_url,
                timeout: this.config.request_timeout * 1000, // Convert seconds to milliseconds
            });
            console.log(`${config.name}|[start]|Session initialized`);

            // Initialize storage based on config
            await this.initializeStorage();
        } catch (error) {
            console.error(`${config.name}|[start]|Error during startup: ${error}`);
            throw error;
        }
    }

    async close() {
        try {
            this.isShuttingDown = true;
            console.log(`${config.name}|[close]|Gracefully shutting down...`);
            
            // Close database connection if using SQLite
            if (this.db) {
                return new Promise<void>((resolve, reject) => {
                    this.db!.close((err) => {
                        if (err) {
                            console.error(`${config.name}|[close]|Error closing database: ${err}`);
                            reject(err);
                        } else {
                            console.log(`${config.name}|[close]|Database connection closed successfully`);
                            this.db = null;
                            resolve();
                        }
                    });
                });
            }
        } catch (error) {
            console.error(`${config.name}|[close]|Error during shutdown: ${error}`);
            throw error;
        }
    }

    private async initializeStorage() {
        await this.initializeSqliteDb();
    }

    private async initializeSqliteDb() {
        return new Promise<void>((resolve, reject) => {
            try {
                // Ensure the data directory exists
                const dbDir = path.dirname(this.config.messages_db_path);
                if (!fs.existsSync(dbDir)) {
                    try {
                        fs.mkdirSync(dbDir, { recursive: true });
                        console.log(`${config.name}|[initializeSqliteDb]|Created directory: ${dbDir}`);
                    } catch (error) {
                        console.error(`${config.name}|[initializeSqliteDb]|Error creating directory: ${error}`);
                        reject(error);
                        return;
                    }
                }

                this.db = new sqlite3.Database(this.config.messages_db_path, (err) => {
                    if (err) {
                        console.error(`${config.name}|[initializeSqliteDb]|Error opening database: ${err}`);
                        reject(err);
                        return;
                    }

                    // Create messages table if it doesn't exist with composite primary key
                    this.db!.run(`
                        CREATE TABLE IF NOT EXISTS messages (
                            id INTEGER NOT NULL,
                            date INTEGER NOT NULL,
                            message TEXT NOT NULL,
                            channel_name TEXT NOT NULL,
                            processed BOOLEAN DEFAULT 0,
                            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                            PRIMARY KEY (id, channel_name)
                        )
                    `, (err) => {
                        if (err) {
                            console.error(`${config.name}|[initializeSqliteDb]|Error creating table: ${err}`);
                            reject(err);
                        } else {
                            // Load known message IDs to avoid duplicates
                            this.loadKnownMessageIds().then(resolve).catch(reject);
                        }
                    });
                });
            } catch (error) {
                console.error(`${config.name}|[initializeSqliteDb]|Unexpected error: ${error}`);
                reject(error);
            }
        });
    }

    private async loadKnownMessageIds(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            try {
                if (this.db) {
                    // Get today's date at midnight
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    const todayTimestamp = Math.floor(today.getTime() / 1000);
                    
                    this.db.all('SELECT id, channel_name FROM messages WHERE date >= ?', [todayTimestamp], (err, rows: any[]) => {
                        if (err) {
                            console.error(`${config.name}|[loadKnownMessageIds]|Error loading known message IDs: ${err}`);
                            reject(err);
                            return;
                        }
                        
                        rows.forEach(row => this.knownMessages.add(`${row.channel_name}:${row.id}`));
                        console.log(`${config.name}|[loadKnownMessageIds]|Loaded ${this.knownMessages.size} known messages from today`);
                        resolve();
                    });
                } else {
                    resolve();
                }
            } catch (error) {
                console.error(`${config.name}|[loadKnownMessageIds]|Unexpected error loading known messages: ${error}`);
                reject(error);
            }
        });
    }

    /**
     * Prunes the knownMessages set to only keep today's messages
     * This helps manage memory usage for long-running processes
     */
    private pruneKnownMessages(): void {
        try {
            // Only keep messages from today in memory
            if (this.db) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const todayTimestamp = Math.floor(today.getTime() / 1000);
                
                this.db.all('SELECT id, channel_name FROM messages WHERE date >= ?', [todayTimestamp], (err, rows: any[]) => {
                    if (err) {
                        console.error(`${config.name}|[pruneKnownMessages]| Error pruning known messages: ${err}`);
                        return;
                    }
                    
                    // Clear the current set and refill with only today's messages
                    this.knownMessages.clear();
                    rows.forEach(row => this.knownMessages.add(`${row.channel_name}:${row.id}`));
                    console.log(`${config.name}|[pruneKnownMessages]|Pruned known messages, now tracking ${this.knownMessages.size} messages from today`);
                });
            }
        } catch (error) {
            console.error(`${config.name}|[pruneKnownMessages]|Unexpected error during pruning: ${error}`);
        }
    }

    async saveMessages(channelName: string, messages: any[]): Promise<any[]> {
        try {
            if (!this.db) {
                console.error(`${config.name}|[saveMessages]|Database not initialized`, this.processRunCounter);
                return [];
            }
            
            const savedMessages = [];
            const messagesToSave = [];
            
            for (const message of messages) {
                if (!message.id || !message.date || !message.message) {
                    continue;
                }
                
                // Create composite key from channel name and message ID
                const messageKey = `${channelName}:${message.id}`;
                
                // Check if message is already known
                if (this.knownMessages.has(messageKey)) {
                    continue;
                }
                
                // Add to known messages set
                this.knownMessages.add(messageKey);
                
                // Add to batch for saving
                messagesToSave.push({
                    id: message.id,
                    date: message.date,
                    message: message.message,
                    channelName: channelName,
                    processed: false
                });
                
                savedMessages.push(message);
            }
            
            // Batch save messages to database
            if (messagesToSave.length > 0) {
                await this.batchSaveMessages(messagesToSave);
            }
            
            return savedMessages;
        } catch (error) {
            console.error(`${config.name}|[saveMessages]|Error saving messages: ${error}`, this.processRunCounter);
            return [];
        }
    }
    
    /**
     * Batch save messages to database for better performance
     */
    private async batchSaveMessages(messages: Message[]): Promise<void> {
        try {
            console.log(`${config.name}|[batchSaveMessages]|Saving ${messages.length} messages to database`, this.processRunCounter);
            if (!this.db || messages.length === 0) return;

            messages = messages.filter(message => message.id);
            
            return new Promise<void>((resolve, reject) => {
                const stmt = this.db!.prepare(
                    'INSERT OR IGNORE INTO messages (id, date, message, channel_name, processed) VALUES (?, ?, ?, ?, ?)'
                );
                
                this.db!.serialize(() => {
                    this.db!.run('BEGIN TRANSACTION');
                    
                    messages.forEach(message => {
                        stmt.run(
                            message.id,
                            message.date,
                            message.message,
                            message.channelName,
                            message.processed ? 1 : 0
                        );
                    });
                    
                    stmt.finalize();
                    
                    this.db!.run('COMMIT', (err) => {
                        if (err) {
                            console.error(`${config.name}|[batchSaveMessages]|Error committing transaction: ${err}`, this.processRunCounter);
                            this.db!.run('ROLLBACK');
                            reject(err);
                        } else {
                            console.log(`${config.name}|[batchSaveMessages]|Batch saved ${messages.length} messages to database`, this.processRunCounter);
                            resolve();
                        }
                    });
                });
            });
        } catch (error) {
            console.error(`${config.name}|[batchSaveMessages]|Unexpected error during batch save: ${error}`, this.processRunCounter);
            throw error;
        }
    }

    private async processMessagesWithAI(messages: Message[]): Promise<void> {
        console.log(`${config.name}|[processMessagesWithAI]| PROCESSING MESSAGES WITH AI`, this.processRunCounter);
        const allMessageText = "Messages:" + messages.map(message => message.message).join('\nMessage:');
        
        try {
            // Process the message with AI
            const analysisResults = await this.aiProcessor.processMessage(allMessageText, this.processRunCounter);
            
            // Log the results
            if (analysisResults.length === 0) {
                console.log(`${config.name}|[processMessagesWithAI]| No Solana tokens found in last messages`, this.processRunCounter);
                return;
            } else {
                for (const result of analysisResults) {
                    
                    if (result.is_potential_to_buy_token && result.token_address) {
                        console.log(`${config.name}|[processMessagesWithAI]| Detect potential to buy token ${result.token_address} ${JSON.stringify(result, null, 2)} `, this.processRunCounter, result, TAGS.telegram_ai_token_analysis.name);
                        await validateAndSwapToken(result.token_address, this.processRunCounter);
                    }
                    else {
                        console.log(`${config.name}|[processMessagesWithAI]| TOKEN DOES NOT HAVE POTENTIAL TO BUY or empty token address`, this.processRunCounter);
                    }
                }
                await this.markMessageAsProcessed(messages);
                return;
            }
        } catch (error) {
            console.error(`${config.name}|[processMessagesWithAI]| Error processing messages with AI: ${error}`, this.processRunCounter);
        } 
    }

    private async markMessageAsProcessed(messages: Message[]): Promise<void> {
        try {
            if (!this.db || messages.length === 0) return;
            
            return new Promise<void>((resolve, reject) => {
                const stmt = this.db!.prepare(
                    'UPDATE messages SET processed = 1 WHERE id = ? AND channel_name = ?'
                );
                
                this.db!.serialize(() => {
                    this.db!.run('BEGIN TRANSACTION');
                    
                    messages.forEach(msg => {
                        stmt.run(msg.id, msg.channelName);
                    });
                    
                    stmt.finalize();
                    
                    this.db!.run('COMMIT', (err) => {
                        if (err) {
                            console.error(`${config.name}|[markMessageAsProcessed]|Error committing transaction: ${err}`);
                            this.db!.run('ROLLBACK');
                            reject(err);
                        } else {
                            console.log(`${config.name}|[markMessageAsProcessed]|Marked ${messages.length} messages as processed`);
                            resolve();
                        }
                    });
                });
            });
        } catch (error) {
            console.error(`${config.name}|[markMessageAsProcessed]|Unexpected error marking messages as processed: ${error}`);
            throw error;
        }
    }

    async fetchMessages(channelName: string, limit?: number, retryCount: number = 0): Promise<any[]> {
        try {
            console.log(`${config.name}|[fetchMessages]|Fetching messages from ${channelName}`, this.processRunCounter);
            
            // Check if we've hit the maximum retry attempts
            const maxRetries = this.config.max_retries || 3;
            if (retryCount >= maxRetries) {
                console.warn(`${config.name}|[fetchMessages]|Maximum retry attempts (${maxRetries}) reached for ${channelName}, skipping for now`, this.processRunCounter);
                return [];
            }
            
            const params: any = {};
            if (limit) {
                params.limit = Math.min(limit, this.config.max_messages_per_channel);
            }

            try {
                const response = await this.session.get(`/json/${channelName}`, { params });
                
                // Handle both 429 and 420 status codes which indicate rate limiting
                if (response.status === 429 || response.status === 420) {
                    // Calculate exponential backoff delay
                    const currentRetries = retryCount + 1;
                    const exponentialDelay = Math.min(
                        this.config.rate_limit_delay * Math.pow(2, retryCount) * 1000,
                        60000 // Max delay of 60 seconds
                    );
                    
                    console.log(`${config.name}|[fetchMessages]|Rate limit exceeded (${response.status}), retry ${currentRetries}, waiting ${exponentialDelay/1000} seconds`, this.processRunCounter);
                    
                    // Update channel's retry counter
                    this.channelRateLimitRetries.set(channelName, currentRetries);
                    
                    await new Promise(resolve => setTimeout(resolve, exponentialDelay));
                    return this.fetchMessages(channelName, limit, currentRetries);
                }
                
                // Reset retry counter on success
                this.channelRateLimitRetries.delete(channelName);
                
                if (!response.data || !response.data.messages || response.data.messages.length === 0) {
                    console.warn(`${config.name}|[fetchMessages]|NOT VALID DATA FROM RESPONSE ${channelName}`, this.processRunCounter);
                    return [];
                }
                console.log(`${config.name}|[fetchMessages]|FETCHED ${response.data.messages.length} messages from ${channelName}`, this.processRunCounter);
                
                return response.data.messages;
            } catch (error: any) {
                // Check for rate limit errors in the caught error as well
                if (error.response && (error.response.status === 429 || error.response.status === 420)) {
                    // Calculate exponential backoff delay
                    const currentRetries = retryCount + 1;
                    const exponentialDelay = Math.min(
                        this.config.rate_limit_delay * Math.pow(2, retryCount) * 1000,
                        60000 // Max delay of 60 seconds
                    );
                    
                    console.log(`${config.name}|[fetchMessages]|Rate limit exceeded (${error.response.status}), retry ${currentRetries}, waiting ${exponentialDelay/1000} seconds`, this.processRunCounter);
                    
                    // Update channel's retry counter
                    this.channelRateLimitRetries.set(channelName, currentRetries);
                    
                    await new Promise(resolve => setTimeout(resolve, exponentialDelay));
                    return this.fetchMessages(channelName, limit, currentRetries);
                }
                
                console.log(`${config.name}|[fetchMessages]|Error fetching messages for ${channelName}: ${error}`, this.processRunCounter);
                return [];
            }
        } catch (error) {
            console.error(`${config.name}|[fetchMessages]|Unexpected error in fetch messages: ${error}`, this.processRunCounter);
            return [];
        }
    }

    async monitorChannels() {
        try {
            console.log(`${config.name}|[monitorChannels]|MAINLOGS Start Monitoring Channels`);
            
            // Setup graceful shutdown handlers
            process.on('SIGINT', async () => {
                console.log(`${config.name}|[monitorChannels]|Received SIGINT signal`);
                await this.close();
                process.exit(0);
            });
            
            process.on('SIGTERM', async () => {
                console.log(`${config.name}|[monitorChannels]|Received SIGTERM signal`);
                await this.close();
                process.exit(0);
            });
            
            // Periodically prune known messages to manage memory usage
            const pruneInterval = setInterval(() => {
                this.pruneKnownMessages();
            }, 3600000); // Prune every hour
            
            // Set to track rate-limited channels to give them a longer cooldown
            const rateLimitedChannels = new Set<string>();
            
            // Function to add random jitter to delay times to avoid predictable patterns
            const addJitter = (baseDelay: number, jitterFactor = 0.3) => {
                const jitter = baseDelay * jitterFactor * (Math.random() - 0.5);
                return Math.max(baseDelay + jitter, 0);
            };
            
            while (!this.isShuttingDown) {
                try {
                    console.log(`${config.name}|[monitorChannels]|CYCLE_START`, this.processRunCounter);
                    const channels = this.config.channels;
                    
                    for (const channel of channels) {
                        if (this.isShuttingDown) break;
                        
                        try {
                            // Skip this channel if it's in the rate-limited set
                            if (rateLimitedChannels.has(channel.username)) {
                                console.log(`${config.name}|[monitorChannels]|Skipping rate-limited channel: ${channel.username}`, this.processRunCounter);
                                continue;
                            }
                            
                            console.log(`${config.name}|[monitorChannels]|Checking channel: ${channel.username}`, this.processRunCounter);
                            const messages = await this.fetchMessages(
                                channel.username,
                                this.config.max_messages_per_channel
                            );

                            // Check if this channel hit the max retry limit
                            const retryCount = this.channelRateLimitRetries.get(channel.username) || 0;
                            if (retryCount >= (this.config.max_retries || 3)) {
                                console.warn(`${config.name}|[monitorChannels]|Channel ${channel.username} is being rate limited, adding to cooldown list`, this.processRunCounter);
                                rateLimitedChannels.add(channel.username);
                                // Clear the retry counter
                                this.channelRateLimitRetries.delete(channel.username);
                            }

                            if (!messages || messages.length === 0) {
                                console.log(`${config.name}|[monitorChannels]|No messages received for channel ${channel.username}`, this.processRunCounter);
                                continue;
                            } else {
                                console.log(`${config.name}|[monitorChannels]|GET ${messages.length} messages from ${channel.username}`, this.processRunCounter);
                                const savedMessages = await this.saveMessages(channel.username, messages);
                                
                                if (savedMessages.length > 0) {
                                    await this.processMessagesWithAI(savedMessages);
                                }
                            }
                            
                            if (!this.isShuttingDown) {
                                // Add jitter to the rate limit delay to avoid synchronized requests
                                const delayWithJitter = addJitter(this.config.rate_limit_delay * 1000);
                                console.log(`${config.name}|[monitorChannels]|Waiting ${delayWithJitter/1000} seconds before next channel check`, this.processRunCounter);
                                await new Promise(resolve => setTimeout(resolve, delayWithJitter));
                            }
                        } catch (e) {
                            console.error(`${config.name}|[monitorChannels]|Error processing channel ${channel.username}: ${e}`, this.processRunCounter);
                            continue;
                        }
                    }
                    
                    if (!this.isShuttingDown) {
                        // Also add jitter to the check interval
                        const checkIntervalWithJitter = addJitter(this.config.check_interval * 1000, 0.2);
                        console.log(`${config.name}|[monitorChannels]|CYCLE_END Completed monitoring channels. Waiting ${checkIntervalWithJitter/1000} seconds before next check...`, this.processRunCounter++);
                        
                        // Clear the rate-limited channels after a full cycle
                        if (rateLimitedChannels.size > 0) {
                            console.log(`${config.name}|[monitorChannels]|Clearing rate-limited channels: ${Array.from(rateLimitedChannels).join(', ')}`, this.processRunCounter);
                            rateLimitedChannels.clear();
                        }
                        
                        await new Promise(resolve => setTimeout(resolve, checkIntervalWithJitter));
                    }
                } catch (e) {
                    console.error(`${config.name}|[monitorChannels]|Error in monitor loop: ${e}`);
                    console.log(`${config.name}|[monitorChannels]|CYCLE_END ${this.processRunCounter}`, this.processRunCounter++);
                    
                    if (!this.isShuttingDown) {
                        await new Promise(resolve => setTimeout(resolve, this.config.retry_delay * 1000));
                    }
                }
            }
            
            // Clear the prune interval when shutting down
            clearInterval(pruneInterval);
        } catch (error) {
            console.error(`${config.name}|[monitorChannels]|Fatal error in monitor channels: ${error}`);
            throw error;
        }
    }
}

async function main() {
    try {
        console.log(`${config.name}|[main]|APPLICATION STARTED`);
        const reader = new TelegramReader(config);
        
        try {
            await reader.start();
            // No need to load channels again, they're already in the config
            await reader.monitorChannels();
        } catch (error) {
            console.error(`${config.name}|[main]|Fatal error: ${error}`);
        } finally {
            await reader.close();
            console.log(`${config.name}|[main]|APPLICATION SHUTDOWN COMPLETE`);
        }
    } catch (error) {
        console.error(`${config.name}|[main]|Unhandled error in main function: ${error}`);
        process.exit(1);
    }
}

logger.init().then(() => {
    try {
        main().catch(error => {
            console.error(`${config.name}|[main]|Unhandled promise rejection: ${error}`);
            process.exit(1);
        });
    } catch (error) {
        console.error(`${config.name}|[main]|Error starting application: ${error}`);
        process.exit(1);
    }
});