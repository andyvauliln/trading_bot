## Project Description

The Solana tokens trading bots is a Node.js project built with TypeScript, designed to automate the buying and selling of tokens on the Solana blockchain.

### Modules

- [tracker-bot](bots/tracker-bot) - Track and store tokens in local database
- [solana-sniper-bot](bots/sniper-bot) - Sniper Trader bot for the Solana blockchain
- [telegram-bot](bots/telegram-bot) - Telegram bot for trading, extracting messages from channels, processing them with AI and executing transactions
- [trades-monitoring](trades-monitoring) - Adenced logs monitoring ui
- [gmgn-api-scraper](utils/gmgn-api) - Scraper for gmgn api
- [scripts](scripts) - Useful scripts for the project
- [data](data) - trading, logs and other data or db
- [docs](docs) - documentation and useful information
-


### Features

- Token Sniper for Raydium for the Solana blockchain
- Rug check using a third party service rugcheck.xyz
- Configurable bot parameters
- Advanced Trades Monitoring
- Possibility to set own RPC nodes
- Track and store tokens in local database
- Auto-sell feature using Stop Loss and Take Profit with additional ai analytics from data from gmgn
- Telegram signals ai analysis and trading
- Gmgn data scraper


### Prerequisites, Installation and Usage Instructions
## Local runing (for now)
set env variables example in .env.backup
`npm install`
run in different terminals
`npm run test-solana-sniper-bot`
`npm run test-telegram-trading-bot`
`npm run test-tracker-bot`

## Server runing
Will run all bots simultaneously in different processes
`pm2 start ecosystem.config.js --env production`


### Third Party documentation

- [Helius RPC nodes](https://docs.helius.dev)
- [Jupiter V6 Swap API](https://station.jup.ag/docs/apis/swap-api)
- [Rugcheck API](https://api.rugcheck.xyz/swagger/index.html)
- [Solana](https://solana.com/docs)
- [Solscan](https://solscan.io)


### TODO
- [ ] Logger module
- [ ] Logger ui
- [ ] Logger api
- [ ] Trading api
- [ ] Research diffirent trading strategies
- [ ] Research trading bots projects
- [ ] Research and experiments with different validation strategies
- [ ] Research how possible to use AI for better decision making
- [ ] Research how to use better data from gmgn
- [ ] Perfomance optimization and research
- [ ] Add more tests
- [ ] Could be not stable on a long distance, need to test and handle all possible errors, after good monitoring
- [ ] Add trading from contract pool
- [ ] Comparison same trading tokens with differents configurations, make good ui for that
- [ ] Self improvement
- [ ] Easy deploying
- [ ] Configuration inheritance
- [ ] Portfolio and profit tracking
- [ ] Support diffrent chains
- [ ] Support different liquidity pools
- [ ] Smart address bot trading
- [ ] Whales address trading
- [ ] Check for transactions if wallet has sufficient sol for fees
- [ ] Multi chain support

- [*] Populate tokens db with rug conditions data
- [*] Add retry logic for api requests
- [*] Add in a holding field of which bot added it


### Architecture, system design, and visual knowledge base
[Link](https://computer.tldraw.com/p/2nWRFbhCC27zMUioEqX1Wp)


