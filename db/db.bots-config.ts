import { Database } from "sqlite";
import { BotConfig } from "./db.types";
import { getDbConnection } from "./db.utils";
import { db_config } from "./db.config";

const DEFAULT_BOT_NAME = 'db.bots-config';

export async function createTableBotConfig(database: Database): Promise<boolean> {
  const functionName = 'createTableBotConfig';
  try {
    await database.exec(`
      CREATE TABLE IF NOT EXISTS configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bot_name TEXT NOT NULL UNIQUE,
        bot_type TEXT NOT NULL,
        bot_version TEXT NOT NULL,
        bot_description TEXT NOT NULL,
        bot_author_wallet_address TEXT,
        send_notifications_to_discord INTEGER NOT NULL, -- Store boolean as INTEGER 0/1
        is_enabled INTEGER NOT NULL,                   -- Store boolean as INTEGER 0/1
        trading_wallet_address TEXT NOT NULL,
        bot_data TEXT NOT NULL,                       -- Store complex data as JSON TEXT
        updated_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
    console.log(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Bot configs table checked/created successfully.`);
    return true;
  } catch (error: any) {
    console.error(`[${DEFAULT_BOT_NAME}]|[${functionName}]|Error creating bot configs table`, 0, { error: error.message });
    return false;
  }
}

// Removed local getDatabase(), use getDbConnection(CONFIG_DB_PATH)

/**
 * Save or update a bot configuration in the database.
 * @param botName The unique name of the bot.
 * @param configData The configuration data for the bot.
 * @param callingBotName Optional: Name of the bot/process calling this function (for logging).
 * @param processRunCounter Optional: Process run counter for logging.
 * @returns Promise resolving to true if successful, false otherwise.
 */
export async function saveBotConfig(
  botName: string, 
  configData: BotConfig,
  callingBotName: string = DEFAULT_BOT_NAME,
  processRunCounter: number = 0
): Promise<boolean> {
  let db: Database | null = null;
  const functionName = 'saveBotConfig';
  const effectiveBotName = configData.bot_name || botName; // Use botName from data if available

  try {
    db = await getDbConnection(db_config.bot_config_path);
    
    // Removed redundant createConfigsTable call
    
    // Serialize the bot_data object to JSON string
    const botDataJson = JSON.stringify(configData.bot_data);
    const now = Date.now(); // Use milliseconds timestamp
    
    // Check if configuration already exists
    const existingConfig = await db.get('SELECT id FROM configs WHERE bot_name = ?', [effectiveBotName]);
    
    if (existingConfig) {
      // Update existing configuration
      console.log(`[${callingBotName}]|[${functionName}]|Updating existing config`, processRunCounter, { botName: effectiveBotName });
      await db.run(
        `UPDATE configs SET 
          bot_data = ?, bot_type = ?, bot_version = ?, bot_description = ?, 
          bot_author_wallet_address = ?, send_notifications_to_discord = ?, 
          is_enabled = ?, trading_wallet_address = ?, updated_at = ? 
         WHERE bot_name = ?`,
        [
          botDataJson, 
          configData.bot_type, 
          configData.bot_version, 
          configData.bot_description, 
          configData.bot_author_wallet_address,
          configData.send_notifications_to_discord ? 1 : 0, // Convert boolean to 0/1
          configData.is_enabled ? 1 : 0,                   // Convert boolean to 0/1
          configData.bot_wallet_address, // Standardized column name
          now, 
          effectiveBotName
        ]
      );
    } else {
      // Insert new configuration
      console.log(`[${callingBotName}]|[${functionName}]|Inserting new config`, processRunCounter, { botName: effectiveBotName });
      await db.run(
        `INSERT INTO configs (
          bot_name, bot_data, bot_type, bot_version, bot_description, 
          bot_author_wallet_address, send_notifications_to_discord, is_enabled, 
          trading_wallet_address, updated_at, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          effectiveBotName, 
          botDataJson, 
          configData.bot_type, 
          configData.bot_version, 
          configData.bot_description, 
          configData.bot_author_wallet_address, 
          configData.send_notifications_to_discord ? 1 : 0, // Convert boolean to 0/1
          configData.is_enabled ? 1 : 0,                   // Convert boolean to 0/1
          configData.bot_wallet_address, // Standardized column name
          now, 
          now
        ]
      );
    }
    
    console.log(`[${callingBotName}]|[${functionName}]|Bot config saved successfully`, processRunCounter, { botName: effectiveBotName });
    return true;

  } catch (error: any) {
    console.error(`[${callingBotName}]|[${functionName}]|Error saving bot config`, processRunCounter, { error: error.message, botName: effectiveBotName });
    return false;
  } finally {
    if (db) {
      await db.close();
    }
  }
}

/**
 * Get a bot configuration from the database.
 * @param botName The name of the bot.
 * @param callingBotName Optional: Name of the bot/process calling this function (for logging).
 * @param processRunCounter Optional: Process run counter for logging.
 * @returns Promise resolving to the BotConfig or null if not found or on error.
 */
export async function getBotConfig(
  botName: string,
  callingBotName: string = DEFAULT_BOT_NAME,
  processRunCounter: number = 0
): Promise<BotConfig | null> {
  let db: Database | null = null;
  const functionName = 'getBotConfig';
  console.log(`[${callingBotName}]|[${functionName}]|Getting bot config`, processRunCounter, { botName });

  try {
    db = await getDbConnection(db_config.bot_config_path);
    
    // Removed redundant createConfigsTable call
    
    const result = await db.get('SELECT * FROM configs WHERE bot_name = ?', [botName]);
    
    if (!result) {
      console.log(`[${callingBotName}]|[${functionName}]|Bot config not found`, processRunCounter, { botName });
      return null;
    }
    
    // Deserialize the JSON data and convert integer booleans
    const config: BotConfig = {
      ...result,
      bot_data: JSON.parse(result.bot_data || '{}'), // Parse JSON string
      send_notifications_to_discord: result.send_notifications_to_discord === 1, // Convert 0/1 to boolean
      is_enabled: result.is_enabled === 1,                   // Convert 0/1 to boolean
      created_at: new Date(result.created_at), // Convert timestamp to Date
      updated_at: new Date(result.updated_at), // Convert timestamp to Date
    };
    
    console.log(`[${callingBotName}]|[${functionName}]|Bot config retrieved successfully`, processRunCounter, { botName });
    return config;

  } catch (error: any) {
    console.error(`[${callingBotName}]|[${functionName}]|Error getting bot config`, processRunCounter, { error: error.message, botName });
    return null; // Return null on error as per original logic
  } finally {
    if (db) {
      await db.close();
    }
  }
}

/**
 * List bot configurations, optionally filtering by type and enabled status.
 * @param bot_type Optional: Filter by bot type.
 * @param excludeNotEnabled Optional: If true, only return enabled bots.
 * @param callingBotName Optional: Name of the bot/process calling this function (for logging).
 * @param processRunCounter Optional: Process run counter for logging.
 * @returns Promise resolving to an array of BotConfig objects.
 */
export async function getBotConfigs(
  bot_type?: string, 
  excludeNotEnabled: boolean = false,
  callingBotName: string = DEFAULT_BOT_NAME,
  processRunCounter: number = 0
): Promise<BotConfig[]> {
  let db: Database | null = null;
  const functionName = 'getBotConfigs';
  console.log(`[${callingBotName}]|[${functionName}]|Listing bot configs`, processRunCounter, { bot_type, excludeNotEnabled });

  try {
    db = await getDbConnection(db_config.bot_config_path);
    
    // Removed redundant createConfigsTable call
    
    let query = 'SELECT * FROM configs';
    const conditions: string[] = [];
    const params: any[] = [];
    
    if (bot_type) {
      conditions.push('bot_type = ?');
      params.push(bot_type);
    }
    if (excludeNotEnabled) {
      conditions.push('is_enabled = ?');
      params.push(1); // Filter for enabled (1)
    }
    
    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }
    
    query += ' ORDER BY bot_name';
    
    const results = await db.all(query, params);
    
    // Deserialize JSON and convert types for each result
    const configs: BotConfig[] = results.map(row => ({
      ...row,
      bot_data: JSON.parse(row.bot_data || '{}'),
      send_notifications_to_discord: row.send_notifications_to_discord === 1,
      is_enabled: row.is_enabled === 1,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    }));
    
    console.log(`[${callingBotName}]|[${functionName}]|Retrieved ${configs.length} bot configs`, processRunCounter);
    return configs;

  } catch (error: any) {
    console.error(`[${callingBotName}]|[${functionName}]|Error listing bot configs`, processRunCounter, { error: error.message, bot_type, excludeNotEnabled });
    return []; // Return empty array on error
  } finally {
    if (db) {
      await db.close();
    }
  }
}

/**
 * Delete a bot configuration.
 * @param botName The name of the bot to delete.
 * @param callingBotName Optional: Name of the bot/process calling this function (for logging).
 * @param processRunCounter Optional: Process run counter for logging.
 * @returns Promise resolving to true if deletion was successful, false otherwise.
 */
export async function deleteBotConfig(
  botName: string,
  callingBotName: string = DEFAULT_BOT_NAME,
  processRunCounter: number = 0
): Promise<boolean> {
  let db: Database | null = null;
  const functionName = 'deleteBotConfig';
  console.log(`[${callingBotName}]|[${functionName}]|Deleting bot config`, processRunCounter, { botName });

  try {
    db = await getDbConnection(db_config.bot_config_path);
    
    // Removed redundant createConfigsTable call
    
    const result = await db.run('DELETE FROM configs WHERE bot_name = ?', [botName]);
    
    if (result.changes && result.changes > 0) {
      console.log(`[${callingBotName}]|[${functionName}]|Bot config deleted successfully`, processRunCounter, { botName });
      return true;
    } else {
      console.warn(`[${callingBotName}]|[${functionName}]|Bot config not found for deletion`, processRunCounter, { botName });
      return false;
    }

  } catch (error: any) {
    console.error(`[${callingBotName}]|[${functionName}]|Error deleting bot config`, processRunCounter, { error: error.message, botName });
    return false;
  } finally {
    if (db) {
      await db.close();
    }
  }
}

/**
 * Update specific fields in a bot's configuration.
 * Relies on getBotConfig and saveBotConfig.
 * @param botName The name of the bot.
 * @param configUpdates Partial updates to apply to the configuration.
 * @param callingBotName Optional: Name of the bot/process calling this function (for logging).
 * @param processRunCounter Optional: Process run counter for logging.
 * @returns Promise resolving to true if successful, false otherwise.
 */
export async function updateBotConfig(
  botName: string, 
  configUpdates: Partial<BotConfig>,
  callingBotName: string = DEFAULT_BOT_NAME,
  processRunCounter: number = 0
): Promise<boolean> {
  const functionName = 'updateBotConfig';
  console.log(`[${callingBotName}]|[${functionName}]|Attempting to update bot config`, processRunCounter, { botName, updates: Object.keys(configUpdates) });
  try {
    // Get the current configuration (uses refactored getBotConfig)
    const currentConfig = await getBotConfig(botName, callingBotName, processRunCounter);
    if (!currentConfig) {
      console.warn(`[${callingBotName}]|[${functionName}]|Cannot update config, bot not found`, processRunCounter, { botName });
      return false;
    }
    
    // Merge the updates with the current configuration
    // Note: Nested objects in bot_data will be merged shallowly by the spread operator.
    // If deep merge is needed for bot_data, implement a deep merge utility.
    const updatedConfig: BotConfig = {
      ...currentConfig,
      ...configUpdates,
      // Ensure nested bot_data is handled correctly if necessary
      bot_data: { 
        ...(currentConfig.bot_data || {}), 
        ...(configUpdates.bot_data || {}) 
      },
      updated_at: Date.now() // Use timestamp
    };
    
    // Save the updated configuration (uses refactored saveBotConfig)
    const success = await saveBotConfig(botName, updatedConfig, callingBotName, processRunCounter);
    if (success) {
      console.log(`[${callingBotName}]|[${functionName}]|Bot config updated successfully`, processRunCounter, { botName });
    } else {
       console.error(`[${callingBotName}]|[${functionName}]|Failed to save updated bot config`, processRunCounter, { botName });
    }
    return success;

  } catch (error: any) {
    // Catch potential errors from getBotConfig/saveBotConfig if they re-throw
    console.error(`[${callingBotName}]|[${functionName}]|Error updating bot config`, processRunCounter, { error: error.message, botName });
    return false;
  }
}

/**
 * Creates a default configuration for a bot if it doesn't exist.
 * Relies on getBotConfig and saveBotConfig.
 * @param config The default configuration object.
 * @param callingBotName Optional: Name of the bot/process calling this function (for logging).
 * @param processRunCounter Optional: Process run counter for logging.
 * @returns Promise resolving to the existing or newly created config, or null if creation failed or bot exists but is disabled.
 */
export async function createDefaultBotConfig(
  config: BotConfig,
  callingBotName: string = DEFAULT_BOT_NAME,
  processRunCounter: number = 0
): Promise<BotConfig | null> {
  const functionName = 'createDefaultBotConfig';
  const botName = config.bot_name;
  console.log(`[${callingBotName}]|[${functionName}]|Checking or creating default config`, processRunCounter, { botName });

  try {
    // Use refactored getBotConfig
    const existingConfig = await getBotConfig(botName, callingBotName, processRunCounter);
    
    if (existingConfig) {
      if (existingConfig.is_enabled) {
        console.log(`[${callingBotName}]|[${functionName}]|Enabled config already exists`, processRunCounter, { botName });
        return existingConfig;
      } else {
        console.log(`[${callingBotName}]|[${functionName}]|Disabled config already exists, skipping creation`, processRunCounter, { botName });
        return null; // Explicitly return null if exists but disabled
      }
    } else {
      // Config doesn't exist, create it using refactored saveBotConfig
      console.log(`[${callingBotName}]|[${functionName}]|Config not found, creating default`, processRunCounter, { botName });
      const now = Date.now(); // Use timestamp
      const configToSave: BotConfig = {
        ...config,
        created_at: config.created_at || now,
        updated_at: config.updated_at || now
      };
      const success = await saveBotConfig(botName, configToSave, callingBotName, processRunCounter);
      if (success) {
        console.log(`[${callingBotName}]|[${functionName}]|Default bot config created successfully`, processRunCounter, { botName });
        // Return the config we attempted to save (assuming saveBotConfig doesn't modify it)
        return configToSave; 
      } else {
        console.error(`[${callingBotName}]|[${functionName}]|Failed to save default bot config`, processRunCounter, { botName });
        return null;
      }
    }
  } catch (error: any) {
    // Catch potential errors from getBotConfig/saveBotConfig if they re-throw
    console.error(`[${callingBotName}]|[${functionName}]|Error creating default bot config`, processRunCounter, { error: error.message, botName });
    return null;
  }
}
