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
npm install


### Third Party documentation

- [Helius RPC nodes](https://docs.helius.dev)
- [Jupiter V6 Swap API](https://station.jup.ag/docs/apis/swap-api)
- [Rugcheck API](https://api.rugcheck.xyz/swagger/index.html)
- [Solana](https://solana.com/docs)
- [Solscan](https://solscan.io)


### TODO
- [ ] Add recomended slippage from gmgn
- [ ] Add recomended priority fee from gmgn
- [ ] Logger module
- [ ] Logger ui
- [ ] Logger api
- [ ] Trading api
- [ ] Research diffirent trading strategies
- [ ] Research trading bots projects
- [ ] Experiment with different validation strategies
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

### Architecture, system design, and visual knowledge base
[Link](https://computer.tldraw.com/p/2nWRFbhCC27zMUioEqX1Wp)
