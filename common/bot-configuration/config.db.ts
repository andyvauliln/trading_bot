import sqlite3 from "sqlite3";
import { open } from "sqlite";
import path from "path";

// Database path
const CONFIG_DB_PATH = path.resolve(process.cwd(), 'data', 'config.db');

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
    console.error(`Error creating configs table: ${error.message}`);
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
      throw new Error("Could not create configs table");
    }
    
    // Serialize the configuration data to JSON
    const configJson = JSON.stringify(configData);
    const now = Date.now();
    
    // Check if configuration already exists
    const existingConfig = await db.get('SELECT id FROM configs WHERE bot_name = ?', [botName]);
    
    if (existingConfig) {
      // Update existing configuration
      await db.run(
        'UPDATE configs SET config_data = ?, updated_at = ? WHERE bot_name = ?',
        [configJson, now, botName]
      );
    } else {
      // Insert new configuration
      await db.run(
        'INSERT INTO configs (bot_name, config_data, updated_at) VALUES (?, ?, ?)',
        [botName, configJson, now]
      );
    }
    
    await db.close();
    return true;
  } catch (error: any) {
    console.error(`Error saving bot config: ${error.message}`);
    return false;
  }
}

/**
 * Get a bot configuration from the database
 * @param botName The name of the bot
 */
export async function getBotConfig<T extends BotConfig = BotConfig>(botName: string): Promise<T | null> {
  try {
    const db = await getDatabase();
    
    // Create table if it doesn't exist
    const tableExists = await createConfigsTable(db);
    if (!tableExists) {
      await db.close();
      throw new Error("Could not create configs table");
    }
    
    // Get the configuration data
    const result = await db.get('SELECT config_data FROM configs WHERE bot_name = ?', [botName]);
    await db.close();
    
    if (!result) {
      return null;
    }
    
    // Parse the JSON data
    return JSON.parse(result.config_data) as T;
  } catch (error: any) {
    console.error(`Error getting bot config: ${error.message}`);
    return null;
  }
}

/**
 * List all bot configurations
 */
export async function listBotConfigs(): Promise<{botName: string, updatedAt: Date}[]> {
  try {
    const db = await getDatabase();
    
    // Create table if it doesn't exist
    const tableExists = await createConfigsTable(db);
    if (!tableExists) {
      await db.close();
      throw new Error("Could not create configs table");
    }
    
    // Get all bot names and their update times
    const results = await db.all('SELECT bot_name, updated_at FROM configs ORDER BY bot_name');
    await db.close();
    
    return results.map(row => ({
      botName: row.bot_name,
      updatedAt: new Date(row.updated_at)
    }));
  } catch (error: any) {
    console.error(`Error listing bot configs: ${error.message}`);
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
      throw new Error("Could not create configs table");
    }
    
    // Delete the configuration
    await db.run('DELETE FROM configs WHERE bot_name = ?', [botName]);
    await db.close();
    return true;
  } catch (error: any) {
    console.error(`Error deleting bot config: ${error.message}`);
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
    console.error(`Error updating bot config: ${error.message}`);
    return false;
  }
}

/**
 * Get a specific section of a bot's configuration
 * @param botName The name of the bot
 * @param section The configuration section to retrieve
 */
export async function getBotConfigSection<T>(
  botName: string, 
  section: keyof BotConfig
): Promise<T | null> {
  try {
    const config = await getBotConfig(botName);
    if (!config || !(section in config)) {
      return null;
    }
    
    return config[section] as unknown as T;
  } catch (error: any) {
    console.error(`Error getting bot config section: ${error.message}`);
    return null;
  }
}

/**
 * Initialize the configuration database with default values from a config file
 * @param botName The name of the bot
 * @param defaultConfig The default configuration
 */
export async function initializeBotConfig(
  botName: string, 
  defaultConfig: BotConfig
): Promise<boolean> {
  try {
    // Check if configuration already exists
    const existingConfig = await getBotConfig(botName);
    
    // If it doesn't exist, save the default configuration
    if (!existingConfig) {
      return await saveBotConfig(botName, defaultConfig);
    }
    
    return true;
  } catch (error: any) {
    console.error(`Error initializing bot config: ${error.message}`);
    return false;
  }
}

/**
 * Utility to migrate an existing config.ts file to the database
 * @param botName The name of the bot
 * @param configObj The configuration object from the config.ts file
 */
export async function migrateConfigToDb(
  botName: string, 
  configObj: any
): Promise<boolean> {
  try {
    // Ensure it has a name property
    const configWithName = {
      ...configObj,
      name: botName
    };
    
    return await saveBotConfig(botName, configWithName as BotConfig);
  } catch (error: any) {
    console.error(`Error migrating config to DB: ${error.message}`);
    return false;
  }
}
