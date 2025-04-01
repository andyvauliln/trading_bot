/**
 * This file contains utility functions to help migrate existing bot configurations to the database.
 */
import { BotConfigManager } from './config-manager';
import { config as sniperBotConfig } from '../../bots/solana-sniper-bot/config';
import { config as telegramBotConfig } from '../../bots/telegram-trading-bot/config';

/**
 * Migrate the configurations of all bots to the database
 */
export async function migrateAllBotsToDb(): Promise<boolean> {
  const migrationResults = await Promise.all([
    migrateSolanaSniperBot(),
    migrateTelegramTradingBot(),
    // Add more bots here as they are created
  ]);
  
  // Return true only if all migrations were successful
  return migrationResults.every(result => result === true);
}

/**
 * Migrate the Solana Sniper Bot configuration to the database
 */
export async function migrateSolanaSniperBot(): Promise<boolean> {
  try {
    console.log('Migrating Solana Sniper Bot configuration to database...');
    const success = await BotConfigManager.migrateFromConfig(
      'solana-sniper-bot',
      sniperBotConfig
    );
    
    if (success) {
      console.log('Solana Sniper Bot configuration migrated successfully');
    } else {
      console.error('Failed to migrate Solana Sniper Bot configuration');
    }
    
    return success;
  } catch (error) {
    console.error('Error migrating Solana Sniper Bot configuration:', error);
    return false;
  }
}

/**
 * Migrate the Telegram Trading Bot configuration to the database
 */
export async function migrateTelegramTradingBot(): Promise<boolean> {
  try {
    console.log('Migrating Telegram Trading Bot configuration to database...');
    const success = await BotConfigManager.migrateFromConfig(
      'telegram-trading-bot',
      telegramBotConfig
    );
    
    if (success) {
      console.log('Telegram Trading Bot configuration migrated successfully');
    } else {
      console.error('Failed to migrate Telegram Trading Bot configuration');
    }
    
    return success;
  } catch (error) {
    console.error('Error migrating Telegram Trading Bot configuration:', error);
    return false;
  }
}

// If this script is executed directly, migrate all bots
if (require.main === module) {
  migrateAllBotsToDb()
    .then(success => {
      if (success) {
        console.log('All bot configurations migrated successfully');
        process.exit(0);
      } else {
        console.error('Failed to migrate some bot configurations');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('Error during migration:', error);
      process.exit(1);
    });
} 