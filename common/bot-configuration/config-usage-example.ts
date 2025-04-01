/**
 * This file demonstrates how to use the configuration database in a bot.
 * It's a reference implementation that can be used as a template for other bots.
 */
import { BotConfigManager, createConfigManager, isBotConfigType } from './config-manager';
import { BotConfig, SwapConfig, RugCheckConfig } from './config.db';

// Define a bot-specific configuration interface that extends the base BotConfig
interface SampleBotConfig extends BotConfig {
  // Bot-specific configuration fields
  api_key: string;
  api_url: string;
  monitored_tokens: string[];
  refresh_interval: number;
  // You can add more bot-specific fields here
}

export class SampleBot {
  private configManager: BotConfigManager;
  private config: SampleBotConfig | null = null;
  
  constructor() {
    // Create a configuration manager for this bot
    this.configManager = createConfigManager('sample-bot');
  }
  
  /**
   * Initialize the bot with a default configuration if none exists
   */
  async initialize(): Promise<boolean> {
    try {
      // Define default configuration
      const defaultConfig: SampleBotConfig = {
        name: 'sample-bot',
        environment: process.env.NODE_ENV || 'development',
        simulation_mode: false,
        verbose_log: true,
        api_key: process.env.SAMPLE_BOT_API_KEY || '',
        api_url: 'https://api.example.com',
        monitored_tokens: [],
        refresh_interval: 60000, // 1 minute
        logger: {
          keeping_days_in_db: 10,
          terminal_logs: process.env.IS_TERMINAL_LOG === 'true' || process.env.NODE_ENV === 'development',
          db_logs: true,
          file_logs: process.env.FILE_LOGS === 'true',
          db_logs_path: 'data/sample-bot-logs.db',
          file_logs_path: 'logs/sample-bot.log',
        },
        tx: {
          fetch_tx_max_retries: 10,
          fetch_tx_initial_delay: 3000,
          swap_tx_initial_delay: 1000,
          get_timeout: 10000,
          concurrent_transactions: 1,
          retry_delay: 500,
        },
        swap: {
          prio_fee_max_lamports: 1000000,
          prio_level: 'veryHigh',
          amount: '10000000',
          slippageBps: '200',
          token_not_tradable_400_error_retries: 5,
          token_not_tradable_400_error_delay: 2000,
        },
        rug_check: {
          enabled: true,
          allow_mint_authority: false,
          allow_not_initialized: false,
          allow_freeze_authority: false,
          allow_rugged: false,
          allow_mutable: false,
          block_symbols: ['XXX'],
          block_names: ['XXX'],
          allow_insider_topholders: false,
          max_alowed_pct_topholders: 1,
          exclude_lp_from_topholders: false,
          min_total_markets: 999,
          min_total_lp_providers: 999,
          min_total_market_Liquidity: 1000000,
          ignore_pump_fun: false,
          max_score: 1,
          legacy_not_allowed: [
            'Low Liquidity',
            'Freeze Authority still enabled',
            'Single holder ownership',
            'High holder concentration',
          ],
        },
      };
      
      // Initialize with default configuration
      await this.configManager.initializeWithDefault(defaultConfig);
      
      // Load the configuration
      const config = await this.configManager.getConfig();
      
      // Validate that the configuration is of the correct type
      if (config && isBotConfigType<SampleBotConfig>(config, ['api_key', 'api_url', 'monitored_tokens', 'refresh_interval'])) {
        this.config = config;
        return true;
      } else {
        console.error('Invalid configuration for sample-bot');
        return false;
      }
    } catch (error) {
      console.error('Error initializing sample-bot:', error);
      return false;
    }
  }
  
  /**
   * Update the API key in the configuration
   */
  async updateApiKey(apiKey: string): Promise<boolean> {
    return await this.configManager.updateConfig({ api_key: apiKey });
  }
  
  /**
   * Add a token to the monitored tokens list
   */
  async addMonitoredToken(token: string): Promise<boolean> {
    // Get the current configuration
    const config = await this.configManager.getConfig() as SampleBotConfig;
    if (!config) return false;
    
    // Add the token if it's not already in the list
    if (!config.monitored_tokens.includes(token)) {
      const updatedTokens = [...config.monitored_tokens, token];
      return await this.configManager.updateConfig({ monitored_tokens: updatedTokens });
    }
    
    return true;
  }
  
  /**
   * Remove a token from the monitored tokens list
   */
  async removeMonitoredToken(token: string): Promise<boolean> {
    // Get the current configuration
    const config = await this.configManager.getConfig() as SampleBotConfig;
    if (!config) return false;
    
    // Remove the token if it's in the list
    const updatedTokens = config.monitored_tokens.filter(t => t !== token);
    return await this.configManager.updateConfig({ monitored_tokens: updatedTokens });
  }
  
  /**
   * Update the swap configuration
   */
  async updateSwapConfig(swapConfig: Partial<SwapConfig>): Promise<boolean> {
    // Get the current configuration
    const config = await this.configManager.getConfig() as SampleBotConfig;
    if (!config) return false;
    
    // Merge the new swap configuration with the current one
    const updatedSwapConfig = {
      ...config.swap,
      ...swapConfig,
    };
    
    return await this.configManager.updateConfig({ swap: updatedSwapConfig });
  }
  
  /**
   * Update the rug check configuration
   */
  async updateRugCheckConfig(rugCheckConfig: Partial<RugCheckConfig>): Promise<boolean> {
    // Get the current configuration
    const config = await this.configManager.getConfig() as SampleBotConfig;
    if (!config) return false;
    
    // Merge the new rug check configuration with the current one
    const updatedRugCheckConfig = {
      ...config.rug_check,
      ...rugCheckConfig,
    };
    
    return await this.configManager.updateConfig({ rug_check: updatedRugCheckConfig });
  }
  
  /**
   * Start the bot
   */
  async start(): Promise<boolean> {
    // Make sure the configuration is loaded
    if (!this.config) {
      const success = await this.initialize();
      if (!success) return false;
    }
    
    // Now we can use the configuration to start the bot
    console.log(`Starting sample-bot in ${this.config!.environment} mode`);
    console.log(`API URL: ${this.config!.api_url}`);
    console.log(`Monitoring ${this.config!.monitored_tokens.length} tokens`);
    console.log(`Refresh interval: ${this.config!.refresh_interval}ms`);
    
    // Actual bot logic would go here
    
    return true;
  }
}

// Example usage
if (require.main === module) {
  const bot = new SampleBot();
  bot.start()
    .then(success => {
      if (success) {
        console.log('Bot started successfully');
      } else {
        console.error('Failed to start bot');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Error starting bot:', error);
      process.exit(1);
    });
} 