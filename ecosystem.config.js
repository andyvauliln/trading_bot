module.exports = {
  apps: [
    {
      name: 'tracker-bot',
      script: 'npx ts-node',
      args: 'bots/tracker-bot/index.ts',
      watch: ['bots/tracker-bot'],
      ignore_watch: ['node_modules', '.git'],
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'telegram-trading-bot',
      script: 'npx ts-node',
      args: 'bots/telegram-trading-bot/index.ts',
      watch: ['bots/telegram-trading-bot'],
      ignore_watch: ['node_modules', '.git'],
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'solana-sniper-bot',
      script: 'npx ts-node',
      args: 'bots/solana-sniper-bot/index.ts',
      watch: ['bots/solana-sniper-bot'],
      ignore_watch: ['node_modules', '.git'],
      env: {
        NODE_ENV: 'production',
      },
    }
  ]
}; 