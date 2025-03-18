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
      name: 'cron',
      script: './dist/cron/pool-historic-data.js',
      out_file: process.env.NODE_ENV === 'development' ? 'logs/pm2/pool-historic-data.log' : '/dev/null',
      error_file: process.env.NODE_ENV === 'development' ? 'logs/pm2/pool-historic-data.error.log' : '/dev/null',
      cron_restart: '0 */4 * * *',  // Run every 4 hours
      env: {
        NODE_ENV: process.env.NODE_ENV,
      },
      ...(process.env.NODE_ENV === 'production' ? {
        // No watch and logs in production
      } : {
        watch: ['cron'],
        ignore_watch: ['node_modules', '.git', 'data', 'tmp', 'docs', 'logs', '.vscode'],
      })
    },
    {
      name: 'test',
      script: './test.js',
      out_file: process.env.NODE_ENV === 'development' ? 'logs/pm2/test.log' : '/dev/null',
      error_file: process.env.NODE_ENV === 'development' ? 'logs/pm2/test.error.log' : '/dev/null',
      env: {
        NODE_ENV: process.env.NODE_ENV,
      },
      ...(process.env.NODE_ENV === 'production' ? {
        // No watch and logs in production
      } : {
        watch: ['test'],
        ignore_watch: ['node_modules', '.git', 'data', 'tmp', 'docs', 'logs', '.vscode'],
      })
    }
  ]
}; 