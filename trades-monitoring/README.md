# Crypto Trading Bot - Historical Data Collection

This module collects and stores historical wallet data for cryptocurrency trading analysis.

## Features

- Collects wallet token data at regular intervals (every 4 hours)
- Stores data in SQLite database
- Provides API endpoints to retrieve historical data
- Supports multiple wallet addresses

## Setup

1. Install dependencies:

```bash
npm install luxon sqlite sqlite3 express axios node-cron @solana/web3.js @project-serum/anchor bs58 @metaplex-foundation/js dotenv
```

2. Configure environment variables:

Create a `.env` file with the following variables:

```
PRIV_KEY_WALLETS=your_private_key_1,your_private_key_2,...
HELIUS_HTTPS_URI=your_helius_rpc_url
```

## API Endpoints

### Generate Historical Data

```
GET /api/make-account-historical-data
```

Optional query parameters:
- `date`: Specific date to generate data for (format: 'yyyy-MM-dd HH:mm:ss')

### Retrieve Historical Data

```
GET /api/historical-wallet-data
```

Optional query parameters:
- `days`: Number of days to retrieve (default: 30, max: 365)

## Running the Scheduler

The scheduler automatically collects data every 4 hours:

```bash
npx ts-node trades-monitoring/historical-data-scheduler.ts
```

## Database Schema

Historical data is stored in the `historical_data` table with the following schema:

- `id`: Primary key
- `Account`: Wallet address
- `Token`: Token mint address
- `Symbol`: Token symbol
- `TokenName`: Token name
- `Amount`: Token amount
- `USDPrice`: Token price in USD
- `Time`: Timestamp (milliseconds since epoch)

## Usage Example

```typescript
import { getHistoricalWalletData } from './helpers';

// Get historical data for the last 30 days
const data = await getHistoricalWalletData(30);
console.log(data);
``` 