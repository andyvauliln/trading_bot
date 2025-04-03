import path from 'path';
import { config as dotenvConfig } from 'dotenv';

dotenvConfig();

/**
 * Centralized database configuration
 * Contains all database paths and settings
 */
export const db_config = {
  // Database paths
  tracker_holdings_path: path.resolve(process.cwd(), 'data', 'holdings.db'),
  historical_data_path: path.resolve(process.cwd(), 'data', 'historical-data.db'),
  logs_path: (moduleName: string) => path.resolve(process.cwd(), 'data', `${moduleName}-logs.db`),
  tokens_path: path.resolve(process.cwd(), 'data', 'tokens.db'),
  transactions_path: path.resolve(process.cwd(), 'data', 'transactions.db'),
  profit_loss_path: path.resolve(process.cwd(), 'data', 'profit-loss.db'),
  bot_config_path: path.resolve(process.cwd(), 'data', 'bot-config.db'),
  content_path: path.resolve(process.cwd(), 'data', 'content.db'),
};
