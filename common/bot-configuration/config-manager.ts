import {
  BotConfig,
  CommonConfig,
  getBotConfig,
  saveBotConfig,
  updateBotConfig,
  getBotConfigSection,
  initializeBotConfig,
  migrateConfigToDb
} from './config.db';

/**
 * Configuration manager for bots
 * Provides a simple interface for bots to interact with their configuration
 */
export class BotConfigManager {
  private botName: string;
  private config: BotConfig | null = null;
  
  /**
   * Create a new configuration manager for a bot
   * @param botName The name of the bot
   * @param defaultConfig Optional default configuration to use if none exists
   */
  constructor(botName: string, defaultConfig?: BotConfig) {
    this.botName = botName;
    
    // If a default configuration is provided, initialize it
    if (defaultConfig) {
      this.initializeWithDefault(defaultConfig);
    }
  }
  
  /**
   * Initialize the configuration with a default if it doesn't exist
   * @param defaultConfig The default configuration to use
   */
  async initializeWithDefault(defaultConfig: BotConfig): Promise<boolean> {
    try {
      return await initializeBotConfig(this.botName, defaultConfig);
    } catch (error) {
      console.error(`Error initializing config for ${this.botName}: ${error}`);
      return false;
    }
  }
  
  /**
   * Load the configuration from the database
   * @returns The bot configuration or null if it doesn't exist
   */
  async loadConfig(): Promise<BotConfig | null> {
    try {
      this.config = await getBotConfig(this.botName);
      return this.config;
    } catch (error) {
      console.error(`Error loading config for ${this.botName}: ${error}`);
      return null;
    }
  }
  
  /**
   * Get the current configuration
   * @returns The current configuration or null if it hasn't been loaded
   */
  async getConfig(): Promise<BotConfig | null> {
    if (!this.config) {
      return await this.loadConfig();
    }
    return this.config;
  }
  
  /**
   * Save the configuration to the database
   * @param config The configuration to save
   */
  async saveConfig(config: BotConfig): Promise<boolean> {
    try {
      const success = await saveBotConfig(this.botName, config);
      if (success) {
        this.config = config;
      }
      return success;
    } catch (error) {
      console.error(`Error saving config for ${this.botName}: ${error}`);
      return false;
    }
  }
  
  /**
   * Update specific fields in the configuration
   * @param updates The updates to apply to the configuration
   */
  async updateConfig(updates: Partial<BotConfig>): Promise<boolean> {
    try {
      const success = await updateBotConfig(this.botName, updates);
      if (success) {
        // Reload the configuration
        await this.loadConfig();
      }
      return success;
    } catch (error) {
      console.error(`Error updating config for ${this.botName}: ${error}`);
      return false;
    }
  }
  
  /**
   * Get a specific section of the configuration
   * @param section The section to retrieve
   */
  async getConfigSection<T>(section: keyof BotConfig): Promise<T | null> {
    try {
      return await getBotConfigSection<T>(this.botName, section);
    } catch (error) {
      console.error(`Error getting config section for ${this.botName}: ${error}`);
      return null;
    }
  }
  
  /**
   * Migrate a configuration object to the database
   * @param configObj The configuration object to migrate
   */
  async migrateConfigFromObject(configObj: any): Promise<boolean> {
    try {
      const success = await migrateConfigToDb(this.botName, configObj);
      if (success) {
        // Reload the configuration
        await this.loadConfig();
      }
      return success;
    } catch (error) {
      console.error(`Error migrating config for ${this.botName}: ${error}`);
      return false;
    }
  }
  
  /**
   * Static utility method to migrate an existing config.ts file
   * @param botName The name of the bot
   * @param configObj The configuration object from the config.ts file
   */
  static async migrateFromConfig(botName: string, configObj: any): Promise<boolean> {
    try {
      return await migrateConfigToDb(botName, configObj);
    } catch (error) {
      console.error(`Error migrating config for ${botName}: ${error}`);
      return false;
    }
  }
}

// Export a helper function to easily create a config manager
export function createConfigManager(botName: string, defaultConfig?: BotConfig): BotConfigManager {
  return new BotConfigManager(botName, defaultConfig);
}

/**
 * Type guard to check if a configuration is for a specific bot type
 * @param config The configuration to check
 * @param requiredProps Array of required properties for the specific bot type
 */
export function isBotConfigType<T extends BotConfig>(
  config: BotConfig | null, 
  requiredProps: Array<keyof T>
): config is T {
  if (!config) return false;
  
  // Check that all required properties exist
  return requiredProps.every(prop => prop in config);
}

/**
 * Utility function to create a typed configuration for a specific bot
 * This ensures that the configuration has the required properties for the bot
 * @param config Base configuration 
 * @param defaultValues Default values for the specific bot type
 */
export function createTypedConfig<T extends BotConfig>(
  config: Partial<CommonConfig> & Partial<T>, 
  defaultValues: Partial<T>
): T {
  return {
    ...config,
    ...defaultValues,
  } as T;
} 