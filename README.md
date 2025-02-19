## Project Description

The Solana Token Sniper is a Node.js project built with TypeScript, designed to automate the buying and selling of tokens on the Solana blockchain. This script is configured to detect the creation of new liquidity pools and execute token purchases automatically.


### Features

- Token Sniper for Raydium for the Solana blockchain
- Rug check using a third party service rugcheck.xyz
- Possibility to skip pump.fun tokens
- Auto-buy with parameters for amount, slippage and priority
- Possibility to set own RPC nodes
- Track and store tokens in local database
- Auto-sell feature using Stop Loss and Take Profit
- Utils: Solana Wallet (keypair) creator

### Prerequisites, Installation and Usage Instructions

1. Ensure [Node.js](https://nodejs.org/en) is installed on your computer.
2. Clone the repository to your local machine.
3. Navigate to the project folder and run the following command to install all dependencies: "npm i"
4. To start the sniper, run: "npm run dev"
5. To start the tracker, run: "npm run tracker"
6. Optional: To start the sniper and tracker after being compiled, run: "npm run start" and "npm run start:tracker"

### Third Party documentation

- [Helius RPC nodes](https://docs.helius.dev)
- [Jupiter V6 Swap API](https://station.jup.ag/docs/apis/swap-api)
- [Rugcheck API](https://api.rugcheck.xyz/swagger/index.html)
- [Solana](https://solana.com/docs)
- [Solscan](https://solscan.io)

