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

    constructor(param_config: TelegramConfig) {
        this.config = param_config || config;
        this.db = null;
        this.session = null;
        this.knownMessages = new Set<string>();
        this.processRunCounter = 1;
        // Initialize AI message processor with config
        this.aiProcessor = new AIMessageProcessor(this.config?.ai_config);
    }

    async start() {
        // Initialize session
        this.session = axios.create({
            baseURL: this.config.base_url,
            timeout: this.config.request_timeout * 1000, // Convert seconds to milliseconds
        });
        console.log(`[telegram-trading-bot]|[start]|INITAPPLICATION`);

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
                    console.log(`[telegram-trading-bot]|[initializeSqliteDb]|INITAPPLICATION|Created directory: ${dbDir}`);
                } catch (error) {
                    console.error(`[telegram-trading-bot]|[initializeSqliteDb]|INITAPPLICATION|Error creating directory: ${error}`);
                    reject(error);
                    return;
                }
            }

            this.db = new sqlite3.Database(this.config.messages_db_path, (err) => {
                if (err) {
                    console.error(`[telegram-trading-bot]|[initializeSqliteDb]|INITAPPLICATION|Error opening database: ${err}`);
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
                        console.error(`[telegram-trading-bot]|[initializeSqliteDb]|INITAPPLICATION|Error creating table: ${err}`);
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
                        console.error(`[telegram-trading-bot]|[loadKnownMessageIds]|INITAPPLICATION|Error loading known message IDs: ${err}`);
                        reject(err);
                        return;
                    }
                    
                    rows.forEach(row => this.knownMessages.add(`${row.channel_name}:${row.id}`));
                    console.log(`[telegram-trading-bot]|[loadKnownMessageIds]|INITAPPLICATION|Loaded ${this.knownMessages.size} known messages from database`);
                    resolve();
                });
            } else if (this.config.storage_type === "json") {
                try {
                    if (fs.existsSync(this.config.messages_json_path)) {
                        const data = JSON.parse(fs.readFileSync(this.config.messages_json_path, 'utf-8'));
                        data.messages.forEach((msg: Message) => this.knownMessages.add(`${msg.channelName}:${msg.id}`));
                        console.log(`[telegram-trading-bot]|[loadKnownMessageIds]|INITAPPLICATION|Loaded ${this.knownMessages.size} known messages from JSON`);
                    }
                    resolve();
                } catch (error) {
                    console.error(`[telegram-trading-bot]|[loadKnownMessageIds]|INITAPPLICATION|Error loading known messages from JSON: ${error}`);
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
                console.log(`[telegram-trading-bot]|[initializeJsonStorage]|INITAPPLICATION|Created directory: ${jsonDir}`);
            } catch (error) {
                console.error(`[telegram-trading-bot]|[initializeJsonStorage]|INITAPPLICATION|Error creating directory: ${error}`);
                throw error;
            }
        }

        // Create JSON storage file if it doesn't exist
        if (!fs.existsSync(this.config.messages_json_path)) {
            fs.writeFileSync(this.config.messages_json_path, JSON.stringify({ messages: [] }), 'utf-8');
            console.log(`[telegram-trading-bot]|[initializeJsonStorage]|INITAPPLICATION|Created JSON storage file: ${this.config.messages_json_path}`);
        }
        
        // Load known message IDs
        await this.loadKnownMessageIds();
    }
    async saveMessages(channelName: string, messages: any[]): Promise<any[]> {
        const savedMessages = [];
        for (const message of messages) {
            if (!message.id || !message.date || !message.message) {
                console.warn(`[telegram-trading-bot]|[saveMessages]|Skipping message with missing required fields:`, this.processRunCounter, message);
                continue;
            }
             // Create composite key from channel name and message ID
             const messageKey = `${channelName}:${message.id}`;
        
            // Check if message is already known
            if (this.knownMessages.has(messageKey)) {
                console.log(`[telegram-trading-bot]|[saveMessages]| Skipping already processed message ID: ${message.id} from channel: ${channelName}`);
                continue;
            }

            const saved = await this.saveMessage({
                id: message.id,
                date: message.date,
                message: message.message,
                channelName: channelName,
                processed: false
            });
            savedMessages.push(message);
        }
        return savedMessages;
    }


    private async saveMessage(message: Message): Promise<Message> {
        if (this.config.storage_type === "sqlite" && this.db) {
            return new Promise<Message>((resolve, reject) => {
                this.db!.run(
                    'INSERT INTO messages (id, date, message, channel_name, processed) VALUES (?, ?, ?, ?, ?)',
                    [message.id, message.date, message.message, message.channelName, message.processed ? 1 : 0],
                    (err) => {
                        if (err) {
                            console.error(`[telegram-trading-bot] [saveMessage] Error saving message to SQLite: ${err}`, this.processRunCounter);
                            reject(err);
                        } else {
                            console.log(`[telegram-trading-bot] [saveMessage] Message ID ${message.id} saved to SQLite database`, this.processRunCounter);
                            resolve(message);
                        }
                    }
                );
            });
        } else if (this.config.storage_type === "json") {
            try {
                const data = JSON.parse(fs.readFileSync(this.config.messages_json_path, 'utf-8'));
                data.messages.push(message);
                fs.writeFileSync(this.config.messages_json_path, JSON.stringify(data, null, 2), 'utf-8');
                console.log(`[telegram-trading-bot] [saveMessage] Message ID ${message.id} saved to JSON storage`, this.processRunCounter);
            } catch (error) {
                console.error(`[telegram-trading-bot] [saveMessage] Error saving message to JSON: ${error}`, this.processRunCounter);
                return message;
            }
        }
        return message;
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
                return is_any_swap;
            }
        } catch (error) {
            console.error(`[telegram-trading-bot][processMessagesWithAI] Error processing messages: ${error}`, this.processRunCounter);
            return false
        } 
    }

    private async markMessageAsProcessed(messages: Message[]): Promise<void> {
        if (this.config.storage_type === "sqlite" && this.db) {
            for (const message of messages) {
                this.db!.run(
                    'UPDATE messages SET processed = 1 WHERE id = ? AND channel_name = ?',
                    [message.id, message.channelName],
                    (err) => {
                        if (err) {
                            console.error(`Error marking message as processed: ${err}`);
                        }
                    }
                );
            }
        } else if (this.config.storage_type === "json") {
            try {
                const data = JSON.parse(fs.readFileSync(this.config.messages_json_path, 'utf-8'));
                for (const message of messages) {
                    const message = data.messages.find((m: Message) =>
                        m.id === message.id && m.channelName === message.channelName
                    );
                if (message) {
                    message.processed = true;
                    fs.writeFileSync(this.config.messages_json_path, JSON.stringify(data, null, 2), 'utf-8');
                    }
                }
            } catch (error) {
                console.error(`Error marking message as processed in JSON: ${error}`);
                throw error;
            }
        }
    }

    async fetchMessages(channelName: string, limit?: number, page?: number): Promise<any[]> {

        const params: any = {};
        if (limit) {
            params.limit = Math.min(limit, this.config.max_messages_per_channel);
        }

        try {
            const response = await this.session.get(`/json/${channelName}`, { params });
            if (response.status === 429) {
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
            console.error(`Error fetching messages for ${channelName}: ${error}`, this.processRunCounter);
            return [];
        }
    }

    async monitorChannels() {
       
        console.log(`[telegram-trading-bot]|[monitorChannels]|Starting to monitor ${this.config.channels.length} channels...`, this.processRunCounter);
        
        while (true) {
            try {
                console.log(`[telegram-trading-bot]|[monitorChannels]|RUNSTART`, this.processRunCounter);
                const channels = this.config.channels;
                let is_any_swap = false;
                for (const channel of channels) {
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
                            is_any_swap = await this.processMessagesWithAI(savedMessages);
                            this.markMessageAsProcessed(savedMessages);
                        }
                        this.processRunCounter++;
                        console.log(`[telegram-trading-bot]|[monitorChannels]|RUNEND`, this.processRunCounter, is_any_swap);
                        is_any_swap = false;
                        await new Promise(resolve => setTimeout(resolve, this.config.rate_limit_delay * 1000));
                    } catch (e) {
                        console.error(`[telegram-trading-bot]|[monitorChannels]|Error processing channel ${channel.username}: ${e}`, this.processRunCounter);
                        this.processRunCounter++;
                        console.log(`[telegram-trading-bot]|[monitorChannels]|RUNEND`, this.processRunCounter, is_any_swap);
                        is_any_swap = false;
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
    console.log(`[telegram-trading-bot]|[main]|INITAPPLICATION APPLICATION STARTED`);
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