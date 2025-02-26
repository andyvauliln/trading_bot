module.exports = {
  apps: [
    {
      name: 'tracker-bot',
      script: 'npx ts-node',
      args: 'bots/tracker-bot/index.ts',
      watch: ['bots/tracker-bot'],
      ignore_watch: ['node_modules', '.git', 'data', 'tmp', '.vscode'],
      env: {
        NODE_ENV: 'production',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      out_file: 'logs/tracker-bot.log',
      error_file: 'logs/tracker-bot-error.log',
      merge_logs: true,
      time: true
    },
    {
      name: 'telegram-trading-bot',
      script: 'npx ts-node',
      args: 'bots/telegram-trading-bot/index.ts',
      watch: ['bots/telegram-trading-bot'],
      ignore_watch: ['node_modules', '.git', 'data', 'tmp', '.vscode'],
      env: {
        NODE_ENV: 'production',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      out_file: 'logs/telegram-bot.log',
      error_file: 'logs/telegram-bot-error.log',
      merge_logs: true,
      time: true
    },
    {
      name: 'solana-sniper-bot',
      script: 'npx ts-node',
      args: 'bots/solana-sniper-bot/index.ts',
      watch: ['bots/solana-sniper-bot'],
      ignore_watch: ['node_modules', '.git', 'data', 'tmp', '.vscode'],
      env: {
        NODE_ENV: 'production',
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      out_file: 'logs/solana-sniper-bot.log',
      error_file: 'logs/solana-sniper-bot-error.log',
      merge_logs: true,
      time: true
    }
  ]
}; 