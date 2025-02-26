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
- [ ] Portfolio and profit tracking

### Architecture, system design, and visual knowledge base
[Link](https://computer.tldraw.com/p/2nWRFbhCC27zMUioEqX1Wp)


### HOW TO USE LOGGER
## Notes
- console.log it's overrided function for orignal console.log
- logger possible to configure with next configurations
    - terminal-logs - true/false - if true logs will be shown in terminal
    - db-logs - true/false - if true logs will be saved in db
    - file-logs - true/false - if true logs will be saved in file
    - db-logs-path - string - path to the db
    - file-logs-path - string - path to the file
- all 3 methods can be used simultaneously
- logger should be initialized in the main file

### LOGGER DB TEMPLATE
id - `id` - id of the log
date - `date` - date of the log
time - `time` - time of the log
full_message - `full_message` - fullmessage of the log
message - `message` - message of the log
module - `module` - module of the log
function - `function` - function of the log
type - `type` - type of the log, can be `info`, `error`, `warn`
data - `data` - additional data for the log as json string
cycle - `cycle` - number of the cycle
category - `category` - category of the log, can be `main`, `cycle`
tag - `tag` - any additional tag for the logs, for example if cycle finished with some swap action it's can be `swap_action`

## Use Examples 
`console.log("Message", "processRunCounter", data)`
`console.error("Message", "processRunCounter", data)`
`console.warn("Message", "processRunCounter", data)`

Message - `[module]|[function]| Message` - Message to log. 
 - if Message contains MAINLOGS it's means it's logs out of current loop cycle
 - if Message contains CYCLE_START it's means start of the cycle
 - if Message contains CYCLE_END it's means end of the cycle
 - if Message contains CYCLE_END and data value it's data should be or true or false to highlight that acction was made
processRunCounter - `processRunCounter` - counter to divide logs by every run in multi thread application where all logs mixed
data - `data` - additional data for the logs


## Logger UI
takes data from db logs by api , as result grouped logs

Collapsed view
- date(highlighted with a tag, error, warning, info) -+-
    - [modules] -+-
        - [ mainLogs(highlighted with a tag, error, warning, info)] -+-
        - [ cycleLogs(highlighted with a tag, error, warning, info)] -+-
            - [cycle][type][time][function][message] [tag] -+-
              - [data]