import { TelegramConfig } from "./types";
import dotenv from "dotenv";
import path from "path";
dotenv.config();

const module_name = "telegram-trading-bot";

export const config: TelegramConfig = {
    "environment": process.env.NODE_ENV || "test", // development, production, test
    "name": module_name,
    "simulation_mode": false,
    "base_url": "https://tg.i-c-a.su",
    "messages_db_path":  path.resolve(process.cwd(), 'data', 'content.db'),
    "check_interval": 3*60, // seconds
    "max_messages_per_channel": 100,
    "request_timeout": 30, // seconds
    "max_retries": 3,
    "retry_delay": 60, // seconds
    "rate_limit_delay": 20, // seconds
    "log_level": "INFO",
    "verbose_log": true,
    "sol_mint": "So11111111111111111111111111111111111111112",
    "logger": {
        "keeping_days_in_db": 10,
        "terminal_logs": process.env.IS_TERMINAL_LOG === 'true' || process.env.NODE_ENV === 'development',
        "db_logs": true,
        "file_logs": process.env.FILE_LOGS === 'true',
        "db_logs_path": path.resolve(process.cwd(), 'data', 'app-logs.db'),
        "file_logs_path": path.resolve(process.cwd(), 'logs', `${module_name}.log`),
    },
    "tx": {
        "fetch_tx_max_retries": 10,
        "fetch_tx_initial_delay": 3000, // Initial delay before fetching LP creation transaction details (3 seconds)
        "swap_tx_initial_delay": 1000, // Initial delay before first buy (1 second)
        "get_timeout": 10000, // Timeout for API requests
        "concurrent_transactions": 1, // Number of simultaneous transactions
        "retry_delay": 500, // Delay between retries (0.5 seconds)
    },
    "swap": {
        "is_additional_holding": false,
        "additional_holding_amount": 10000000, // 0.01 SOL
        "prio_fee_max_lamports": 1000000, // 0.001 SOL
        "prio_level": "veryHigh", // If you want to land transaction fast, set this to use `veryHigh`. You will pay on average higher priority fee.
        "amount": "10000000", //0.01 SOL
        "slippageBps": "200", // 2%
        "db_name_tracker_holdings": "src/tracker/holdings.db", // Sqlite Database location
        "token_not_tradable_400_error_retries": 5, // How many times should the bot try to get a quote if the token is not tradable yet
        "token_not_tradable_400_error_delay": 2000, // How many seconds should the bot wait before retrying to get a quote again
    },
    "channels": [
        {
            "username": "ghastlygems",
            "description": "First channel to monitor"
        },
        {
            "username": "eveesL",
            "description": "Second channel to monitor"
        },
        {
            "username": "prosacalls",
            "description": "Third channel to monitor"
        }
    ],
    "ai_config": {
        "openrouter_api_key": process.env.OPEN_ROUTER_API_KEY || "",
        "initial_model": "deepseek/deepseek-r1-distill-llama-70b:free",
        "base_url": "https://openrouter.ai/api/v1/chat/completions",
        "temperature": 0.2
    },
    "rug_check": {
        "verbose_log": false,
        "enabled": false,
        // Dangerous
        "allow_mint_authority": false, // The mint authority is the address that has permission to mint (create) new tokens. Strongly Advised to set to false.
        "allow_not_initialized": false, // This indicates whether the token account is properly set up on the blockchain. Strongly Advised to set to false
        "allow_freeze_authority": false, // The freeze authority is the address that can freeze token transfers, effectively locking up funds. Strongly Advised to set to false
        "allow_rugged": false,
        // Critical
        "allow_mutable": false,
        "block_symbols": ["XXX"],
        "block_names": ["XXX"],
        "allow_insider_topholders": false, // Allow inseder accounts to be part of the topholders
        "max_alowed_pct_topholders": 90, // 1%, Max allowed percentage an individual topholder might hold
        "exclude_lp_from_topholders": false, // If true, Liquidity Pools will not be seen as top holders
        // Warning
        "min_total_markets": 182, //999
        "min_total_lp_providers": 80, //999
        "min_total_market_Liquidity": 1000000,
        // Misc
        "ignore_pump_fun": false,
        "max_score": 0, // Set to 0 to ignore
        "legacy_not_allowed": [
          "Low Liquidity",
          "Freeze Authority still enabled",
          "Single holder ownership",
          "High holder concentration",
          "Freeze Authority still enabled",
          "Large Amount of LP Unlocked",
          "Low Liquidity",
          "Copycat token",
          "Low amount of LP Providers",
        ],
      },
};