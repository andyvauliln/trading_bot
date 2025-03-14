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

    constructor(param_config: TelegramConfig) {
        this.config = param_config || config;
        this.db = null;
        this.session = null;
        this.knownMessages = new Set<string>();
        this.processRunCounter = 1;
        this.isShuttingDown = false;
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
            console.log(`[telegram-trading-bot]|[start]|Session initialized`);

            // Initialize storage based on config
            await this.initializeStorage();
        } catch (error) {
            console.error(`[telegram-trading-bot]|[start]|Error during startup: ${error}`);
            throw error;
        }
    }

    async close() {
        try {
            this.isShuttingDown = true;
            console.log(`[telegram-trading-bot]|[close]|Gracefully shutting down...`);
            
            // Close database connection if using SQLite
            if (this.db) {
                return new Promise<void>((resolve, reject) => {
                    this.db!.close((err) => {
                        if (err) {
                            console.error(`[telegram-trading-bot]|[close]|Error closing database: ${err}`);
                            reject(err);
                        } else {
                            console.log(`[telegram-trading-bot]|[close]|Database connection closed successfully`);
                            this.db = null;
                            resolve();
                        }
                    });
                });
            }
        } catch (error) {
            console.error(`[telegram-trading-bot]|[close]|Error during shutdown: ${error}`);
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
                        console.log(`[telegram-trading-bot]|[initializeSqliteDb]|Created directory: ${dbDir}`);
                    } catch (error) {
                        console.error(`[telegram-trading-bot]|[initializeSqliteDb]|Error creating directory: ${error}`);
                        reject(error);
                        return;
                    }
                }

                this.db = new sqlite3.Database(this.config.messages_db_path, (err) => {
                    if (err) {
                        console.error(`[telegram-trading-bot]|[initializeSqliteDb]|Error opening database: ${err}`);
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
                            console.error(`[telegram-trading-bot]|[initializeSqliteDb]|Error creating table: ${err}`);
                            reject(err);
                        } else {
                            // Load known message IDs to avoid duplicates
                            this.loadKnownMessageIds().then(resolve).catch(reject);
                        }
                    });
                });
            } catch (error) {
                console.error(`[telegram-trading-bot]|[initializeSqliteDb]|Unexpected error: ${error}`);
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
                            console.error(`[telegram-trading-bot]|[loadKnownMessageIds]|Error loading known message IDs: ${err}`);
                            reject(err);
                            return;
                        }
                        
                        rows.forEach(row => this.knownMessages.add(`${row.channel_name}:${row.id}`));
                        console.log(`[telegram-trading-bot]|[loadKnownMessageIds]|Loaded ${this.knownMessages.size} known messages from today`);
                        resolve();
                    });
                } else {
                    resolve();
                }
            } catch (error) {
                console.error(`[telegram-trading-bot]|[loadKnownMessageIds]|Unexpected error loading known messages: ${error}`);
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
                        console.error(`[telegram-trading-bot]|[pruneKnownMessages]| Error pruning known messages: ${err}`);
                        return;
                    }
                    
                    // Clear the current set and refill with only today's messages
                    this.knownMessages.clear();
                    rows.forEach(row => this.knownMessages.add(`${row.channel_name}:${row.id}`));
                    console.log(`[telegram-trading-bot]|[pruneKnownMessages]|Pruned known messages, now tracking ${this.knownMessages.size} messages from today`);
                });
            }
        } catch (error) {
            console.error(`[telegram-trading-bot]|[pruneKnownMessages]|Unexpected error during pruning: ${error}`);
        }
    }
    async saveMessages(channelName: string, messages: any[]): Promise<any[]> {
        try {
            if (!this.db) {
                console.error(`[telegram-trading-bot]|[saveMessages]|Database not initialized`, this.processRunCounter);
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
            console.error(`[telegram-trading-bot]|[saveMessages]|Error saving messages: ${error}`, this.processRunCounter);
            return [];
        }
    }
    
    /**
     * Batch save messages to database for better performance
     */
    private async batchSaveMessages(messages: Message[]): Promise<void> {
        try {
            console.log(`[telegram-trading-bot]|[batchSaveMessages]|Saving ${messages.length} messages to database`, this.processRunCounter);
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
                            console.error(`[telegram-trading-bot]|[batchSaveMessages]|Error committing transaction: ${err}`, this.processRunCounter);
                            this.db!.run('ROLLBACK');
                            reject(err);
                        } else {
                            console.log(`[telegram-trading-bot]|[batchSaveMessages]|Batch saved ${messages.length} messages to database`, this.processRunCounter);
                            resolve();
                        }
                    });
                });
            });
        } catch (error) {
            console.error(`[telegram-trading-bot]|[batchSaveMessages]|Unexpected error during batch save: ${error}`, this.processRunCounter);
            throw error;
        }
    }


    private async processMessagesWithAI(messages: Message[]): Promise<void> {
        
        console.log(`[telegram-trading-bot][processMessagesWithAI]| PROCESSING MESSAGES WITH AI`, this.processRunCounter);
        const allMessageText = messages.map(message => message.message).join('\n');
        
        try {
            // Process the message with AI
            const analysisResults = await this.aiProcessor.processMessage(allMessageText, this.processRunCounter);
            
            // Log the results
            if (analysisResults.length === 0) {
                console.log(`[telegram-trading-bot][processMessagesWithAI]| No Solana tokens found in last messages`, this.processRunCounter);
                return;
            } else {
                console.log(`[telegram-trading-bot][processMessagesWithAI]| Found ${analysisResults.length} token(s) in last messages`, this.processRunCounter, analysisResults, TAGS.telegram_ai_token_analysis.name);
                for (const result of analysisResults) {
                    console.log(`[telegram-trading-bot][processMessagesWithAI]| TOKEN ANALYSIS ${result.solana_token_address}:`, this.processRunCounter, result);
                    if (result.is_potential_to_buy_token) {
                        await validateAndSwapToken(result.solana_token_address, this.processRunCounter);
                    }
                    else {
                        console.warn(`[telegram-trading-bot][processMessagesWithAI]| TOKEN DOES NOT HAVE POTENTIAL TO BUY`, this.processRunCounter);
                    }
                }
                await this.markMessageAsProcessed(messages);
                return;
            }
        } catch (error) {
            console.error(`[telegram-trading-bot][processMessagesWithAI]| Error processing messages with AI: ${error}`, this.processRunCounter);
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
                            console.error(`[telegram-trading-bot]|[markMessageAsProcessed]|Error committing transaction: ${err}`);
                            this.db!.run('ROLLBACK');
                            reject(err);
                        } else {
                            console.log(`[telegram-trading-bot]|[markMessageAsProcessed]|Marked ${messages.length} messages as processed`);
                            resolve();
                        }
                    });
                });
            });
        } catch (error) {
            console.error(`[telegram-trading-bot]|[markMessageAsProcessed]|Unexpected error marking messages as processed: ${error}`);
            throw error;
        }
    }

    async fetchMessages(channelName: string, limit?: number): Promise<any[]> {
        try {
            console.log(`[telegram-trading-bot]|[fetchMessages]|Fetching messages from ${channelName}`, this.processRunCounter);
            const params: any = {};
            if (limit) {
                params.limit = Math.min(limit, this.config.max_messages_per_channel);
            }

            try {
                const response = await this.session.get(`/json/${channelName}`, { params });
                if (response.status === 429) {
                    console.log(`[telegram-trading-bot]|[fetchMessages]|Rate limit exceeded, waiting ${this.config.rate_limit_delay} seconds`, this.processRunCounter);
                    await new Promise(resolve => setTimeout(resolve, this.config.rate_limit_delay * 1000));
                    return this.fetchMessages(channelName, limit);
                }
                if (!response.data || !response.data.messages || response.data.messages.length === 0) {
                    console.warn(`[telegram-trading-bot]|[fetchMessages]|NOT VALID DATA FROM RESPONSE ${channelName}`, this.processRunCounter);
                    return [];
                }
                console.log(`[telegram-trading-bot]|[fetchMessages]|FETCHED ${response.data.messages.length} messages from ${channelName}`, this.processRunCounter);
                
                return response.data.messages;
            } catch (error: any) {
                console.error(`[telegram-trading-bot]|[fetchMessages]|Error fetching messages for ${channelName}: ${error}`, this.processRunCounter);
                return [];
            }
        } catch (error) {
            console.error(`[telegram-trading-bot]|[fetchMessages]|Unexpected error in fetch messages: ${error}`, this.processRunCounter);
            return [];
        }
    }

    async monitorChannels() {
        try {
            console.log(`[telegram-trading-bot]|[monitorChannels]|MAINLOGS Start Monitoring Channels`);
            
            // Setup graceful shutdown handlers
            process.on('SIGINT', async () => {
                console.log(`[telegram-trading-bot]|[monitorChannels]|Received SIGINT signal`);
                await this.close();
                process.exit(0);
            });
            
            process.on('SIGTERM', async () => {
                console.log(`[telegram-trading-bot]|[monitorChannels]|Received SIGTERM signal`);
                await this.close();
                process.exit(0);
            });
            
            // Periodically prune known messages to manage memory usage
            const pruneInterval = setInterval(() => {
                this.pruneKnownMessages();
            }, 3600000); // Prune every hour
            
            while (!this.isShuttingDown) {
                try {
                    console.log(`[telegram-trading-bot]|[monitorChannels]|CYCLE_START`, this.processRunCounter);
                    const channels = this.config.channels;
                    
                    for (const channel of channels) {
                        if (this.isShuttingDown) break;
                        
                        try {
                            console.log(`[telegram-trading-bot]|[monitorChannels]|Checking channel: ${channel.username}`, this.processRunCounter);
                            const messages = await this.fetchMessages(
                                channel.username,
                                this.config.max_messages_per_channel
                            );

                            if (!messages || messages.length === 0) {
                                console.log(`[telegram-trading-bot]|[monitorChannels]|No messages received for channel ${channel.username}`, this.processRunCounter);
                                continue;
                            } else {
                                console.log(`[telegram-trading-bot]|[monitorChannels]|GET ${messages.length} messages from ${channel.username}`, this.processRunCounter);
                                const savedMessages = await this.saveMessages(channel.username, messages);
                                
                                if (savedMessages.length > 0) {
                                    await this.processMessagesWithAI(savedMessages);
                                }
                            }
                            
                            
                            if (!this.isShuttingDown) {
                                await new Promise(resolve => setTimeout(resolve, this.config.rate_limit_delay * 1000));
                            }
                        } catch (e) {
                            console.error(`[telegram-trading-bot]|[monitorChannels]|Error processing channel ${channel.username}: ${e}`, this.processRunCounter);
                            continue;
                        }
                    }
                    
                    if (!this.isShuttingDown) {
                        console.log(`[telegram-trading-bot]|[monitorChannels]|CYCLE_END Completed monitoring channels. Waiting ${this.config.check_interval} seconds before next check...`, this.processRunCounter++);
                        await new Promise(resolve => setTimeout(resolve, this.config.check_interval * 1000));
                    }
                } catch (e) {
                    console.error(`[telegram-trading-bot]|[monitorChannels]|Error in monitor loop: ${e}`);
                    console.log(`[telegram-trading-bot]|[monitorChannels]|CYCLE_END ${this.processRunCounter++}`, this.processRunCounter++);
                    
                    if (!this.isShuttingDown) {
                        await new Promise(resolve => setTimeout(resolve, this.config.retry_delay * 1000));
                    }
                }
            }
            
            // Clear the prune interval when shutting down
            clearInterval(pruneInterval);
        } catch (error) {
            console.error(`[telegram-trading-bot]|[monitorChannels]|Fatal error in monitor channels: ${error}`);
            throw error;
        }
    }
}

async function main() {
    try {
        console.log(`[telegram-trading-bot]|[main]|APPLICATION STARTED`);
        const reader = new TelegramReader(config);
        
        try {
            await reader.start();
            // No need to load channels again, they're already in the config
            await reader.monitorChannels();
        } catch (error) {
            console.error(`[telegram-trading-bot]|[main]|Fatal error: ${error}`);
        } finally {
            await reader.close();
            console.log(`[telegram-trading-bot]|[main]|APPLICATION SHUTDOWN COMPLETE`);
        }
    } catch (error) {
        console.error(`[telegram-trading-bot]|[main]|Unhandled error in main function: ${error}`);
        process.exit(1);
    }
}

logger.init().then(() => {
    try {
        main().catch(error => {
            console.error(`[telegram-trading-bot]|[main]|Unhandled promise rejection: ${error}`);
            process.exit(1);
        });
    } catch (error) {
        console.error(`[telegram-trading-bot]|[main]|Error starting application: ${error}`);
        process.exit(1);
    }
});