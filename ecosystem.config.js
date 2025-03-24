// Load environment variables from .env file
require('dotenv').config();

module.exports = {
  apps: [
    {
      name: 'tracker',
      script: './dist/bots/tracker-bot/index.js',
      env: {
        NODE_ENV: process.env.NODE_ENV,
      },
      out_file: process.env.NODE_ENV === 'development' ? 'logs/pm2/tracker-bot.log' : '/dev/null',
      error_file: process.env.NODE_ENV === 'development' ? 'logs/pm2/tracker-bot.error.log' : '/dev/null',
      // Production configuration
      ...(process.env.NODE_ENV === 'production' ? {
        // No watch and logs in production
      } : {
        // Development configuration
        watch: ['bots/tracker-bot'],
        ignore_watch: ['node_modules', '.git', 'data', 'tmp', 'docs', 'logs', '.vscode'],
      })
    },
    {
      name: 'telegram',
      script: './dist/bots/telegram-trading-bot/index.js',
      out_file: process.env.NODE_ENV === 'development' ? 'logs/pm2/telegram-trading-bot.log' : '/dev/null',
      error_file: process.env.NODE_ENV === 'development' ? 'logs/pm2/telegram-trading-bot.error.log' : '/dev/null',
      env: {
        NODE_ENV: process.env.NODE_ENV,
      },
      ...(process.env.NODE_ENV === 'production' ? {
        // No watch and logs in production
      } : {
        watch: ['bots/telegram-trading-bot'],
        ignore_watch: ['node_modules', '.git', 'data', 'tmp', 'docs', 'logs', '.vscode'],
      })
    },
    {
      name: 'sniper',
      script: './dist/bots/solana-sniper-bot/index.js',
      out_file: process.env.NODE_ENV === 'development' ? 'logs/pm2/solana-sniper-bot.log' : '/dev/null',
      error_file: process.env.NODE_ENV === 'development' ? 'logs/pm2/solana-sniper-bot.error.log' : '/dev/null',
      env: {
        NODE_ENV: process.env.NODE_ENV,
      },
      ...(process.env.NODE_ENV === 'production' ? {
        // No watch and logs in production
      } : {
        watch: ['bots/solana-sniper-bot'],
        ignore_watch: ['node_modules', '.git', 'data', 'tmp', 'docs', 'logs', '.vscode'],
      })
    },
    {
      name: 'api',
      script: './dist/trades-monitoring/index.js',
      out_file: process.env.NODE_ENV === 'development' ? 'logs/pm2/trades-monitoring.log' : '/dev/null',
      error_file: process.env.NODE_ENV === 'development' ? 'logs/pm2/trades-monitoring.error.log' : '/dev/null',
      ...(process.env.NODE_ENV === 'production' ? {
        // No watch and logs in production
      } : {
        watch: ['trades-monitoring'],
        ignore_watch: ['node_modules', '.git', 'data', 'tmp', 'docs', 'logs', '.vscode'],
      })
      
    },
    {
      name: 'pool-historic-data-cron',
      script: './dist/crons/pool-historic-data.js',
      out_file: process.env.NODE_ENV === 'development' ? 'logs/pm2/wallet-data.log' : '/dev/null',
      error_file: process.env.NODE_ENV === 'development' ? 'logs/pm2/wallet-data.error.log' : '/dev/null',
      cron_restart: '0 */4 * * *',  // Run every 4 hours
      autorestart: false,  // Don't restart automatically, rely on cron
      watch: false,
      max_memory_restart: '100M',  // Restart if memory gets too high
      kill_timeout: 3000,  // Give it time to cleanup before killing
      wait_ready: true,    // Wait for process to emit ready signal
      max_restarts: 3,     // Limit restarts if there are real errors
      restart_delay: 10000, // Wait 10 seconds before restarting
      dependency: ['api'], // Ensure API is running first
      env: {
        NODE_ENV: process.env.NODE_ENV,
      },
    },
    {
      name: 'clean-db-logs-cron',
      script: './dist/crons/clean-db-logs.js',
      out_file: process.env.NODE_ENV === 'development' ? 'logs/pm2/clean-db-logs.log' : '/dev/null',
      error_file: process.env.NODE_ENV === 'development' ? 'logs/pm2/clean-db-logs.error.log' : '/dev/null',
      cron_restart: '59 23 * * *',  // Run every day at midnight
      autorestart: false,  // Don't restart automatically, rely on cron
      watch: false,
      max_memory_restart: '100M',  // Restart if memory gets too high
      kill_timeout: 3000,  // Give it time to cleanup before killing
      wait_ready: true,    // Wait for process to emit ready signal
      max_restarts: 3,     // Limit restarts if there are real errors
      env: {
        NODE_ENV: process.env.NODE_ENV,
      },
    },
    {
      name: 'clean-wallet-from-tokens-cron',
      script: './dist/crons/clean-wallet-from-tokens-refactored.js',
      out_file: process.env.NODE_ENV === 'development' ? 'logs/pm2/clean-wallet-from-tokens.log' : '/dev/null',
      error_file: process.env.NODE_ENV === 'development' ? 'logs/pm2/clean-wallet-from-tokens.error.log' : '/dev/null',
      cron_restart: '59 23 * * *',  // Run every day at midnight
      autorestart: false,  // Don't restart automatically, rely on cron
      watch: false,
      max_memory_restart: '100M',  // Restart if memory gets too high
      kill_timeout: 3000,  // Give it time to cleanup before killing
      wait_ready: true,    // Wait for process to emit ready signal
      max_restarts: 3,     // Limit restarts if there are real errors
      env: {
        NODE_ENV: process.env.NODE_ENV,
      },
    },
  ]
}; 