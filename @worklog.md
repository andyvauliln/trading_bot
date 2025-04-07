# Worklog

## 2023-07-22
- Created script to check account balances against holding records
- Added functionality to compare token balances in the database with actual wallet balances
- Implemented update functionality to correct mismatched balances
- Added support for filtering by wallet address and bot name
- Created shell script for easier execution
- Enhanced script to detect and display tokens that exist in wallets but are not in the holdings table
- Improved output tables by truncating token and wallet addresses for better readability
- Added token names to the missing tokens table using Solana token metadata lookup 