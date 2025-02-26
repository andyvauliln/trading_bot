import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as sqlite3 from 'sqlite3';
import { Database } from 'sqlite3';
import { TelegramConfig, Message } from './types';
import { AIMessageProcessor } from './ai_message_processing';
import { config } from './config';
import { validateAndSwapToken } from './validate_token';

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
        // Initialize session
        this.session = axios.create({
            baseURL: this.config.base_url,
            timeout: this.config.request_timeout * 1000, // Convert seconds to milliseconds
        });
        console.log(`[telegram-trading-bot]|[start]|MAINLOGS|Session initialized`);

        // Initialize storage based on config
        await this.initializeStorage();
    }

    async close() {
        this.isShuttingDown = true;
        console.log(`[telegram-trading-bot]|[close]|MAINLOGS|Gracefully shutting down...`);
        
        // Close database connection if using SQLite
        if (this.db) {
            return new Promise<void>((resolve, reject) => {
                this.db!.close((err) => {
                    if (err) {
                        console.error(`[telegram-trading-bot]|[close]|MAINLOGS|Error closing database: ${err}`);
                        reject(err);
                    } else {
                        console.log(`[telegram-trading-bot]|[close]|MAINLOGS|Database connection closed successfully`);
                        this.db = null;
                        resolve();
                    }
                });
            });
        }
    }

    private async initializeStorage() {
        if (this.config.storage_type === "sqlite") {
            await this.initializeSqliteDb();
        } else {
            throw new Error(`Unsupported storage type: ${this.config.storage_type}`);
        }
    }

    private async initializeSqliteDb() {
        return new Promise<void>((resolve, reject) => {
            // Ensure the data directory exists
            const dbDir = path.dirname(this.config.messages_db_path);
            if (!fs.existsSync(dbDir)) {
                try {
                    fs.mkdirSync(dbDir, { recursive: true });
                    console.log(`[telegram-trading-bot]|[initializeSqliteDb]|MAINLOGS|Created directory: ${dbDir}`);
                } catch (error) {
                    console.error(`[telegram-trading-bot]|[initializeSqliteDb]|MAINLOGS|Error creating directory: ${error}`);
                    reject(error);
                    return;
                }
            }

            this.db = new sqlite3.Database(this.config.messages_db_path, (err) => {
                if (err) {
                    console.error(`[telegram-trading-bot]|[initializeSqliteDb]|MAINLOGS|Error opening database: ${err}`);
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
                        console.error(`[telegram-trading-bot]|[initializeSqliteDb]|MAINLOGS|Error creating table: ${err}`);
                        reject(err);
                    } else {
                        // Load known message IDs to avoid duplicates
                        this.loadKnownMessageIds().then(resolve).catch(reject);
                    }
                });
            });
        });
    }

    private async loadKnownMessageIds(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (this.db) {
                // Get today's date at midnight
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const todayTimestamp = Math.floor(today.getTime() / 1000);
                
                this.db.all('SELECT id, channel_name FROM messages WHERE date >= ?', [todayTimestamp], (err, rows: any[]) => {
                    if (err) {
                        console.error(`[telegram-trading-bot]|[loadKnownMessageIds]|MAINLOGS|Error loading known message IDs: ${err}`);
                        reject(err);
                        return;
                    }
                    
                    rows.forEach(row => this.knownMessages.add(`${row.channel_name}:${row.id}`));
                    console.log(`[telegram-trading-bot]|[loadKnownMessageIds]|MAINLOGS|Loaded ${this.knownMessages.size} known messages from today`);
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }

    /**
     * Prunes the knownMessages set to only keep today's messages
     * This helps manage memory usage for long-running processes
     */
    private pruneKnownMessages(): void {
        // Only keep messages from today in memory
        if (this.db) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayTimestamp = Math.floor(today.getTime() / 1000);
            
            this.db.all('SELECT id, channel_name FROM messages WHERE date >= ?', [todayTimestamp], (err, rows: any[]) => {
                if (err) {
                    console.error(`[telegram-trading-bot]|[pruneKnownMessages]|MAINLOGS| Error pruning known messages: ${err}`);
                    return;
                }
                
                // Clear the current set and refill with only today's messages
                this.knownMessages.clear();
                rows.forEach(row => this.knownMessages.add(`${row.channel_name}:${row.id}`));
                console.log(`[telegram-trading-bot]|[pruneKnownMessages]|MAINLOGS|Pruned known messages, now tracking ${this.knownMessages.size} messages from today`);
            });
        }
    }
    async saveMessages(channelName: string, messages: any[]): Promise<any[]> {
        if (!this.db) {
            console.error(`[telegram-trading-bot]|[saveMessages]|MAINLOGS|Database not initialized`, this.processRunCounter);
            return [];
        }
        
        const savedMessages = [];
        const messagesToSave = [];
        
        for (const message of messages) {
            if (!message.id || !message.date || !message.message) {
                console.warn(`[telegram-trading-bot]|[saveMessages]|Skipping message with missing required fields:`, this.processRunCounter, message);
                continue;
            }
            
            // Create composite key from channel name and message ID
            const messageKey = `${channelName}:${message.id}`;
            
            // Check if message is already known
            if (this.knownMessages.has(messageKey)) {
                console.log(`[telegram-trading-bot]|[saveMessages]|Skipping already processed message ID: ${message.id} from channel: ${channelName}`, this.processRunCounter);
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
    }
    
    /**
     * Batch save messages to database for better performance
     */
    private async batchSaveMessages(messages: Message[]): Promise<void> {
        console.log(`[telegram-trading-bot]|[batchSaveMessages]|MAINLOGS|Saving ${messages.length} messages to database`, this.processRunCounter);
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
    }


    private async processMessagesWithAI(messages: Message[]): Promise<boolean> {
        console.log(`[telegram-trading-bot][processMessagesWithAI] PROCESSING MESSAGES WITH AI`, this.processRunCounter);
        const allMessageText = messages.map(message => message.message).join('\n');
        
        try {
            // Process the message with AI
            const analysisResults = await this.aiProcessor.processMessage(allMessageText, this.processRunCounter);
            
            // Log the results
            if (analysisResults.length === 0) {
                console.log(`[telegram-trading-bot][processMessagesWithAI] No Solana tokens found in last messages`, this.processRunCounter);
                return false
            } else {
                console.log(`[telegram-trading-bot][processMessagesWithAI] Found ${analysisResults.length} token(s) in last messages`, this.processRunCounter);
                let is_any_swap = false;
                for (const result of analysisResults) {
                    console.log(`[telegram-trading-bot][processMessagesWithAI] TOKEN ANALYSIS ${result.solana_token_address}:`, this.processRunCounter, result);
                    if (result.is_potential_to_buy_token) {
                       const response = await validateAndSwapToken(result.solana_token_address, this.processRunCounter);
                       if (response) {
                        is_any_swap = true;
                       }
                    }
                    else {
                        console.log(`[telegram-trading-bot][processMessagesWithAI] TOKEN DOES NOT HAVE POTENTIAL TO BUY`, this.processRunCounter);
                        return false
                    }
                }
                await this.markMessageAsProcessed(messages);
                return is_any_swap;
            }
        } catch (error) {
            console.error(`[telegram-trading-bot][processMessagesWithAI] Error processing messages: ${error}`, this.processRunCounter);
            return false
        } 
    }

    private async markMessageAsProcessed(messages: Message[]): Promise<void> {
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
    }

    async fetchMessages(channelName: string, limit?: number, page?: number): Promise<any[]> {
        console.log(`[telegram-trading-bot]|[fetchMessages]|MAINLOGS|Fetching messages from ${channelName}`, this.processRunCounter);
        const params: any = {};
        if (limit) {
            params.limit = Math.min(limit, this.config.max_messages_per_channel);
        }

        try {
            const response = await this.session.get(`/json/${channelName}`, { params });
            if (response.status === 429) {
                console.log(`[telegram-trading-bot]|[fetchMessages]|Rate limit exceeded, waiting ${this.config.rate_limit_delay} seconds`, this.processRunCounter);
                await new Promise(resolve => setTimeout(resolve, this.config.rate_limit_delay * 1000));
                return this.fetchMessages(channelName, limit, page);
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
    }

    async monitorChannels() {
        console.log(`[telegram-trading-bot]|[monitorChannels]|MAINLOGS Start Monitoring Channels`);
        
        // Setup graceful shutdown handlers
        process.on('SIGINT', async () => {
            console.log(`[telegram-trading-bot]|[monitorChannels]|MAINLOGS|Received SIGINT signal`);
            await this.close();
            process.exit(0);
        });
        
        process.on('SIGTERM', async () => {
            console.log(`[telegram-trading-bot]|[monitorChannels]|MAINLOGS|Received SIGTERM signal`);
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
                let is_any_swap = false;
                
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
                                is_any_swap = await this.processMessagesWithAI(savedMessages);
                                
                            }
                        }
                        
                        this.processRunCounter++;
                        console.log(`[telegram-trading-bot]|[monitorChannels]|CYCLE_END`, this.processRunCounter, is_any_swap);
                        is_any_swap = false;
                        
                        if (!this.isShuttingDown) {
                            await new Promise(resolve => setTimeout(resolve, this.config.rate_limit_delay * 1000));
                        }
                    } catch (e) {
                        console.error(`[telegram-trading-bot]|[monitorChannels]|Error processing channel ${channel.username}: ${e}`, this.processRunCounter);
                        this.processRunCounter++;
                        console.log(`[telegram-trading-bot]|[monitorChannels]|CYCLE_END`, this.processRunCounter, is_any_swap);
                        is_any_swap = false;
                        continue;
                    }
                }

                if (!this.isShuttingDown) {
                    console.log(`[telegram-trading-bot]|[monitorChannels]|Completed monitoring channels. Waiting ${this.config.check_interval} seconds before next check...`, this.processRunCounter);
                    await new Promise(resolve => setTimeout(resolve, this.config.check_interval * 1000));
                }
            } catch (e) {
                console.error(`[telegram-trading-bot]|[monitorChannels]|MAINLOGS Error in monitor loop: ${e}`);
                
                if (!this.isShuttingDown) {
                    await new Promise(resolve => setTimeout(resolve, this.config.retry_delay * 1000));
                }
            }
        }
        
        // Clear the prune interval when shutting down
        clearInterval(pruneInterval);
    }
}

async function main() {
    console.log(`[telegram-trading-bot]|[main]|MAINLOGS|APPLICATION STARTED`);
    const reader = new TelegramReader(config);
    
    try {
        await reader.start();
        // No need to load channels again, they're already in the config
        await reader.monitorChannels();
    } catch (error) {
        console.error(`[telegram-trading-bot]|[main]|MAINLOGS|Fatal error: ${error}`);
    } finally {
        await reader.close();
        console.log(`[telegram-trading-bot]|[main]|MAINLOGS|APPLICATION SHUTDOWN COMPLETE`);
    }
}

main().catch(console.error);