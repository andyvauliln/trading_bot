import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";

// Database path
const CONFIG_DB_PATH = path.resolve(process.cwd(), 'data', 'config.db');

export interface BotConfig {
  id?: number;
  bot_name: string;
  bot_type: string;
  bot_version: string;
  bot_description: string;
  bot_author_wallet_address: string;
  send_notifications_to_discord: boolean;
  is_enabled: boolean;
  bot_data: object;
  updated_at?: number;
  created_at?: number;
  bot_wallet_address: string;
}
// Create the configs table if it doesn't exist
async function createConfigsTable(db: any): Promise<boolean> {
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bot_name TEXT NOT NULL UNIQUE,
        bot_type TEXT NOT NULL,
        bot_version TEXT NOT NULL,
        bot_description TEXT NOT NULL,
        bot_author_wallet_address TEXT,
        send_notifications_to_discord BOOLEAN NOT NULL,
        is_enabled BOOLEAN NOT NULL,
        trading_wallet_address TEXT NOT NULL,
        bot_data TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
    return true;
  } catch (error: any) {
    console.error(`[configs]|[createConfigsTable]|Error creating configs table: ${error.message}`);
    return false;
  }
}

// Get a database connection
async function getDatabase() {
  return open({
    filename: CONFIG_DB_PATH,
    driver: sqlite3.Database
  });
}

/**
 * Save a bot configuration to the database
 * @param botName The name of the bot
 * @param configData The configuration data for the bot
 */
export async function saveBotConfig(botName: string, configData: BotConfig): Promise<boolean> {
  try {
    const db = await getDatabase();
    
    // Create table if it doesn't exist
    const tableExists = await createConfigsTable(db);
    if (!tableExists) {
      await db.close();
      return false;
    }
    
    // Serialize the configuration data to JSON
    const botData = JSON.stringify(configData.bot_data);
    const now = Date.now();
    
    // Check if configuration already exists
    const existingConfig = await db.get('SELECT id FROM configs WHERE bot_name = ?', [botName]);
    
    if (existingConfig) {
      // Update existing configuration
      await db.run(
        'UPDATE configs SET bot_data = ?, bot_type = ?, bot_version = ?, bot_description = ?, bot_author_wallet_address = ?, send_notifications_to_discord = ?, is_enabled = ?, trading_wallet_address = ?, updated_at = ? WHERE bot_name = ?',
        [botData, configData.bot_type, configData.bot_version, configData.bot_description, configData.bot_author_wallet_address, configData.send_notifications_to_discord, configData.is_enabled, configData.trading_wallet_address, now, botName]
      );
    } else {
      // Insert new configuration
      await db.run(
        'INSERT INTO configs (bot_name, bot_data, bot_type, bot_version, bot_description, bot_author_wallet_address, send_notifications_to_discord, is_enabled, trading_wallet_address, updated_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [botName, botData, configData.bot_type, configData.bot_version, configData.bot_description, configData.bot_author_wallet_address, configData.send_notifications_to_discord, configData.is_enabled, configData.trading_wallet_address, now, now]
      );
    }
    
    await db.close();
    return true;
  } catch (error: any) {
    console.error(`[${botName}]|[saveBotConfig]|Error saving bot config: ${error.message}`);
    return false;
  }
}

/**
 * Get a bot configuration from the database
 * @param botName The name of the bot
 */
export async function getBotConfig(botName: string): Promise<BotConfig | null> {
  try {
    const db = await getDatabase();
    
    // Create table if it doesn't exist
    const tableExists = await createConfigsTable(db);
    if (!tableExists) {
      await db.close();
      return null;
    }
    
    // Get the configuration data
    const result = await db.get('SELECT * FROM configs WHERE bot_name = ?', [botName]);
    await db.close();
    
    if (!result) {
      return null;
    }
    
    // Parse the JSON data
    return result as BotConfig;
  } catch (error: any) {
    console.error(`[${botName}]|[getBotConfig]|Error getting bot config: ${error.message}`);
    return null;
  }
}

/**
 * List all bot configurations
 */
export async function getBotConfigs(bot_type: string, excludeNotEnabled: boolean = false): Promise<BotConfig[]> {
  try {
    const db = await getDatabase();
    
    // Create table if it doesn't exist
    const tableExists = await createConfigsTable(db);
    if (!tableExists) {
      await db.close();
      return [];
    }
    
    // Get all bot names and their update times
    let query = 'SELECT * FROM configs ORDER BY bot_name';
    if (excludeNotEnabled) {
      query += ' WHERE is_enabled = 1';
    }
    if (bot_type) {
      query += ` WHERE bot_type = '${bot_type}'`;
    }
    const results = await db.all(query);
    await db.close();
    
    return results.map(row => ({
      ...row,
      updatedAt: new Date(row.updated_at)
    }));
  } catch (error: any) {
    console.error(`[${bot_type}]|[getBotConfigs]|Error listing bot configs: ${error.message}`);
    return [];
  }
}

/**
 * Delete a bot configuration
 * @param botName The name of the bot
 */
export async function deleteBotConfig(botName: string): Promise<boolean> {
  try {
    const db = await getDatabase();
    
    // Create table if it doesn't exist
    const tableExists = await createConfigsTable(db);
    if (!tableExists) {
      await db.close();
      return false;
    }
    
    // Delete the configuration
    await db.run('DELETE FROM configs WHERE bot_name = ?', [botName]);
    await db.close();
    return true;
  } catch (error: any) {
    console.error(`[${botName}]|[deleteBotConfig]|Error deleting bot config: ${error.message}`);
    return false;
  }
}

/**
 * Update specific fields in a bot's configuration
 * @param botName The name of the bot
 * @param configUpdates Partial updates to apply to the configuration
 */
export async function updateBotConfig(
  botName: string, 
  configUpdates: Partial<BotConfig>
): Promise<boolean> {
  try {
    // Get the current configuration
    const currentConfig = await getBotConfig(botName);
    if (!currentConfig) {
      return false;
    }
    
    // Merge the updates with the current configuration
    const updatedConfig = {
      ...currentConfig,
      ...configUpdates
    };
    
    // Save the updated configuration
    return await saveBotConfig(botName, updatedConfig);
  } catch (error: any) {
    console.error(`[${botName}]|[updateBotConfig]|Error updating bot config: ${error.message}`);
    return false;
  }
}



export async function createDefaultBotConfig(config: BotConfig): Promise<BotConfig | null> {
  try {
    const db = await getDatabase();
    
    // Create table if it doesn't exist
    const tableExists = await createConfigsTable(db);
    if (!tableExists) {
      await db.close();
      return null;
    }
    const botConfig = await getBotConfig(config.bot_name);
    if (botConfig && botConfig.is_enabled) {
      return botConfig;
    }
    else if (botConfig && !botConfig.is_enabled) {
      return null;
    }
    else {
      await saveBotConfig(config.bot_name, config);
      console.log(`[${config.bot_name}]|[createDefaultBotConfig]|Created default bot config: ${config.bot_name}`);
      await db.close();
      return config;
    }
  } catch (error: any) {
    console.error(`[${config.bot_name}]|[createDefaultBotConfig]|Error creating default bot config: ${error.message}`);
    return null;
  }
}
