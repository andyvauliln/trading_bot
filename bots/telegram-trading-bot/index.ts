import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as sqlite3 from 'sqlite3';
import { Database } from 'sqlite3';
import { TelegramConfig, Message } from './types';
import { AIMessageProcessor } from './ai_message_processing';
import { config } from './telegram-trading-bot-config';
import { validateAndSwapToken } from './validate_token';

class TelegramReader {
    private config: TelegramConfig;
    private session: any;
    private db: Database | null;
    private knownMessages: Set<string>; // Will store "channelName:messageId" as composite key
    private aiProcessor: AIMessageProcessor;

    constructor(param_config: TelegramConfig) {
        this.config = param_config || config;
        this.db = null;
        this.session = null;
        this.knownMessages = new Set<string>();
        // Initialize AI message processor with config
        this.aiProcessor = new AIMessageProcessor(this.config?.ai_config);
    }

    async start() {
        // Initialize session
        this.session = axios.create({
            baseURL: this.config.base_url,
            timeout: this.config.request_timeout * 1000, // Convert seconds to milliseconds
        });

        // Initialize storage based on config
        await this.initializeStorage();
    }

    async close() {
        // Close database connection if using SQLite
        if (this.config.storage_type === "sqlite" && this.db) {
            return new Promise<void>((resolve, reject) => {
                this.db!.close((err) => {
                    if (err) {
                        console.error(`Error closing database: ${err}`);
                        reject(err);
                    } else {
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
        } else if (this.config.storage_type === "json") {
            await this.initializeJsonStorage();
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
                    console.log(`Created directory: ${dbDir}`);
                } catch (error) {
                    console.error(`Error creating directory: ${error}`);
                    reject(error);
                    return;
                }
            }

            this.db = new sqlite3.Database(this.config.messages_db_path, (err) => {
                if (err) {
                    console.error(`Error opening database: ${err}`);
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
                        console.error(`Error creating table: ${err}`);
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
            if (this.config.storage_type === "sqlite" && this.db) {
                this.db.all('SELECT id, channel_name FROM messages', (err, rows: any[]) => {
                    if (err) {
                        console.error(`Error loading known message IDs: ${err}`);
                        reject(err);
                        return;
                    }
                    
                    rows.forEach(row => this.knownMessages.add(`${row.channel_name}:${row.id}`));
                    console.log(`Loaded ${this.knownMessages.size} known messages from database`);
                    resolve();
                });
            } else if (this.config.storage_type === "json") {
                try {
                    if (fs.existsSync(this.config.messages_json_path)) {
                        const data = JSON.parse(fs.readFileSync(this.config.messages_json_path, 'utf-8'));
                        data.messages.forEach((msg: Message) => this.knownMessages.add(`${msg.channelName}:${msg.id}`));
                        console.log(`Loaded ${this.knownMessages.size} known messages from JSON`);
                    }
                    resolve();
                } catch (error) {
                    console.error(`Error loading known messages from JSON: ${error}`);
                    resolve(); // Continue even if there's an error
                }
            } else {
                resolve();
            }
        });
    }

    private async initializeJsonStorage() {
        // Ensure the data directory exists
        const jsonDir = path.dirname(this.config.messages_json_path);
        if (!fs.existsSync(jsonDir)) {
            try {
                fs.mkdirSync(jsonDir, { recursive: true });
                console.log(`Created directory: ${jsonDir}`);
            } catch (error) {
                console.error(`Error creating directory: ${error}`);
                throw error;
            }
        }

        // Create JSON storage file if it doesn't exist
        if (!fs.existsSync(this.config.messages_json_path)) {
            fs.writeFileSync(this.config.messages_json_path, JSON.stringify({ messages: [] }), 'utf-8');
            console.log(`Created JSON storage file: ${this.config.messages_json_path}`);
        }
        
        // Load known message IDs
        await this.loadKnownMessageIds();
    }

    async processMessage(channelName: string, messageData: any): Promise<boolean> {
        if (!messageData.id || !messageData.date || !messageData.message) {
            console.warn(`Skipping message with missing required fields: ${JSON.stringify(messageData)}`);
            return false;
        }

        // Create composite key from channel name and message ID
        const messageKey = `${channelName}:${messageData.id}`;
        
        // Check if message is already known
        if (this.knownMessages.has(messageKey)) {
            console.log(`Skipping already processed message ID: ${messageData.id} from channel: ${channelName}`);
            return false;
        }

        try {
            const messageText = messageData.message.replace(/<br \/>/g, '\n');
            messageData.message = messageText;

            // Save to storage
            await this.saveMessage({
                id: messageData.id,
                date: messageData.date,
                message: messageData.message,
                channelName: channelName,
                processed: false
            });

            // Add to known messages using composite key
            this.knownMessages.add(`${channelName}:${messageData.id}`);

            if (this.config.environment === "test") {
                messageData.message = "Wow it's something cool happening here look at this token guys, 6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN recommended";
            }

            // Send to AI for processing
            await this.sendMessageToAI({
                id: messageData.id,
                date: messageData.date,
                message: messageData.message,
                channelName: channelName,
                processed: false
            });

            return true;
        } catch (e) {
            console.error(`Error processing message: ${e}`);
            return false;
        }
    }

    private async saveMessage(message: Message): Promise<void> {
        if (this.config.storage_type === "sqlite" && this.db) {
            return new Promise<void>((resolve, reject) => {
                this.db!.run(
                    'INSERT INTO messages (id, date, message, channel_name, processed) VALUES (?, ?, ?, ?, ?)',
                    [message.id, message.date, message.message, message.channelName, message.processed ? 1 : 0],
                    (err) => {
                        if (err) {
                            console.error(`Error saving message to SQLite: ${err}`);
                            reject(err);
                        } else {
                            console.log(`Message ID ${message.id} saved to SQLite database`);
                            resolve();
                        }
                    }
                );
            });
        } else if (this.config.storage_type === "json") {
            try {
                const data = JSON.parse(fs.readFileSync(this.config.messages_json_path, 'utf-8'));
                data.messages.push(message);
                fs.writeFileSync(this.config.messages_json_path, JSON.stringify(data, null, 2), 'utf-8');
                console.log(`Message ID ${message.id} saved to JSON storage`);
            } catch (error) {
                console.error(`Error saving message to JSON: ${error}`);
                throw error;
            }
        }
    }

    private async sendMessageToAI(message: Message): Promise<void> {
        console.log(`[AI] Processing message ID ${message.id} from channel ${message.channelName}`);
        console.log(`[AI] Message content: ${message.message.substring(0, 50)}...`);
        
        try {
            // Process the message with AI
            const analysisResults = await this.aiProcessor.processMessage(message.message);
            
            // Log the results
            if (analysisResults.length === 0) {
                console.log(`[AI] No Solana tokens found in message ID ${message.id}`);
            } else {
                console.log(`[AI] Found ${analysisResults.length} token(s) in message ID ${message.id}:`);
                analysisResults.forEach(result => {
                    console.log(`[AI] Token: ${result.solana_token_address}`);
                    console.log(`[AI] Analysis: ${result.analysis}`);
                    console.log(`[AI] Buy recommendation: ${result.is_potential_to_buy_token ? 'YES' : 'NO'}`);
                    if (result.is_potential_to_buy_token) {
                        validateAndSwapToken(result.solana_token_address);
                    }
                });
            }
           
            
        } catch (error) {
            console.error(`[AI] Error processing message: ${error}`);
        } finally {
            // Mark the message as processed regardless of the outcome
            await this.markMessageAsProcessed(message.id, message.channelName);
        }
    }

    private async markMessageAsProcessed(messageId: number, channelName: string): Promise<void> {
        if (this.config.storage_type === "sqlite" && this.db) {
            return new Promise<void>((resolve, reject) => {
                this.db!.run(
                    'UPDATE messages SET processed = 1 WHERE id = ? AND channel_name = ?',
                    [messageId, channelName],
                    (err) => {
                        if (err) {
                            console.error(`Error marking message as processed: ${err}`);
                            reject(err);
                        } else {
                            resolve();
                        }
                    }
                );
            });
        } else if (this.config.storage_type === "json") {
            try {
                const data = JSON.parse(fs.readFileSync(this.config.messages_json_path, 'utf-8'));
                const message = data.messages.find((m: Message) =>
                    m.id === messageId && m.channelName === channelName
                );
                if (message) {
                    message.processed = true;
                    fs.writeFileSync(this.config.messages_json_path, JSON.stringify(data, null, 2), 'utf-8');
                }
            } catch (error) {
                console.error(`Error marking message as processed in JSON: ${error}`);
                throw error;
            }
        }
    }

    async fetchMessages(channelName: string, limit?: number, page?: number): Promise<any[]> {
        if (this.config.environment === "test") {
            this.processMessage(channelName, {
                id: 1,
                date: 1,
                message: "Wow it's something cool happening here look at this token guys, 6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN recommended",
                channelName: channelName,
                processed: false
            });
        }
        const params: any = {};
        if (limit) {
            params.limit = Math.min(limit, this.config.max_messages_per_channel);
        }
        if (page) {
            params.page = page;
        }

        try {
            const response = await this.session.get(`/json/${channelName}`, { params });
            if (response.status === 429) {
                await new Promise(resolve => setTimeout(resolve, this.config.rate_limit_delay * 1000));
                return this.fetchMessages(channelName, limit, page);
            }

            const processedMessages = [];
            for (const message of response.data.messages) {
                const processed = await this.processMessage(channelName, message);
                if (processed) {
                    processedMessages.push(message);
                }
            }
            
            console.log(`Processed ${processedMessages.length} new messages from ${channelName}`);
            return processedMessages;
        } catch (error: any) {
            console.error(`Error fetching messages for ${channelName}: ${error}`);
            throw error;
        }
    }

    async monitorChannels() {
        console.log(`Starting to monitor ${this.config.channels.length} channels...`);
        
        while (true) {
            try {
                const channels = this.config.channels;

                for (const channel of channels) {
                    try {
                        console.log(`Checking channel: ${channel.username}`);
                        const messages = await this.fetchMessages(
                            channel.username,
                            this.config.max_messages_per_channel
                        );

                        if (!messages || messages.length === 0) {
                            console.log(`No new messages received for channel ${channel.username}`);
                        } else {
                            console.log(`Processed ${messages.length} new messages from ${channel.username}`);
                        }

                        // Rate limiting delay
                        await new Promise(resolve => setTimeout(resolve, this.config.rate_limit_delay * 1000));
                    } catch (e) {
                        console.error(`Error processing channel ${channel.username}: ${e}`);
                        continue;
                    }
                }

                console.log(`Completed monitoring cycle. Waiting ${this.config.check_interval} seconds before next check...`);
                await new Promise(resolve => setTimeout(resolve, this.config.check_interval * 1000));
            } catch (e) {
                console.error(`Error in monitor loop: ${e}`);
                await new Promise(resolve => setTimeout(resolve, this.config.retry_delay * 1000));
            }
        }
    }
}

async function main() {
    const reader = new TelegramReader(config);
    await reader.start();

    try {
        // No need to load channels again, they're already in the config
        await reader.monitorChannels();
    } finally {
        await reader.close();
    }
}

main().catch(console.error);