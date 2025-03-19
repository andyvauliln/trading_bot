/** 
*  * Detailed Explanations (To be continued)
*  
* -------------------
* prio_level:
* -------------------
* priorityLevel: Allows you to set a custom priority level for the fee. If priorityLevel is not specified, 
* the API will use the Medium (50th percentile) level. The levels and their corresponding percentiles are:
*     Min: 0th percentile
*     Low: 25th percentile
*     Medium: 50th percentile
*     High: 75th percentile
*     VeryHigh: 95th percentile
*     UnsafeMax: 100th percentile (use with caution).
* -------------------
* legacy_not_allowed:
* -------------------
* Sorted from high risk to lower risk - however all of them are still risky!
* 1. Freeze Authority Still Enabled: 
* This means that the developers or issuer of the coin have the ability to freeze transactions or revert them. 
* This can be a sign of a lack of decentralization and can undermine your confidence in the stability 
* and security of the coin.
* 2. Single Holder Ownership: 
* If a single wallet holder owns a large portion of the coins, this person could manipulate the market by 
* selling off or withholding large amounts. This is risky for you as the value of your investment could 
* heavily depend on the actions of one person.
* 3. High Holder Concentration: 
* Similar to single holder ownership, but here, a few holders own a large percentage of the coins. This increases 
* the risk of market manipulations and price fluctuations if these major holders suddenly decide to sell.
* 4. Large Amount of LP Unlocked: 
* LP stands for Liquidity Provider. If a large amount of the liquidity pool tokens are unlocked, 
* providers could withdraw them at any time, which could lead to a sudden loss of liquidity and a potential price drop.
* 5. Low Liquidity:
* Low liquidity means there are not many coins available for buying or selling. This can lead to extreme 
* price changes even with small buy or sell orders. It's risky because you might not be able to sell your 
* coins without significantly impacting the price.
* 6. Copycat Token: 
* A token that is simply a copy of another existing token, often without any innovative features or improvements. 
* This can indicate a lack of seriousness or potential for long-term growth.
* 7. Low Amount of LP Providers: 
* Having few liquidity providers means the liquidity of the token depends on a few sources. 
* This can be risky, as if these providers decide to withdraw their funds, it could destabilize the market.
**/
import path from "path";
import dotenv from "dotenv";
dotenv.config();

const module_name = "tracker-bot";

export const config = {
  verbose_log: true,
  name: module_name,
  check_interval: 60, // seconds
  environment: process.env.NODE_ENV || "development", // development, production, test
  db_name_tracker_holdings: path.resolve(process.cwd(), 'data', 'holdings.db'), // Sqlite Database location
  liquidity_pool: {
    radiyum_program_id: "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8",
    wsol_pc_mint: "So11111111111111111111111111111111111111112",
  },
  logger: {
    keeping_days_in_db: 10,
    terminal_logs: process.env.IS_TERMINAL_LOG === 'true' || process.env.NODE_ENV === 'development',
    db_logs: true,
    file_logs: process.env.FILE_LOGS === 'true',
    db_logs_path: path.resolve(process.cwd(), 'data', 'app-logs.db'),
    file_logs_path: path.resolve(process.cwd(), 'logs', `${module_name}.log`),
  },
  tx: {
    fetch_tx_max_retries: 10,
    fetch_tx_initial_delay: 3000, // Initial delay before fetching LP creation transaction details (3 seconds)
    swap_tx_initial_delay: 1000, // Initial delay before first buy (1 second)
    get_timeout: 10000, // Timeout for API requests
    concurrent_transactions: 1, // Number of simultaneous transactions
    retry_delay: 500, // Delay between retries (0.5 seconds)
  },
  sell: {
    price_source: "dex", // dex=Dexscreener,jup=Jupiter Agregator (Dex is most accurate and Jupiter is always used as fallback)
    prio_fee_max_lamports: 1000000, // 0.001 SOL
    prio_level: "veryHigh", // If you want to land transaction fast, set this to use `veryHigh`. You will pay on average higher priority fee.
    slippageBps: "400", // 5%
    auto_sell: true, // If set to true, stop loss and take profit triggers automatically when set.
    stop_loss_percent: 20,
    take_profit_percent: 50,
    include_fees_in_pnl: false, // Whether to include fees in profit/loss calculations
  },
};
