export const config = {
    "environment": "development",
    "name": "telegram-trading-bot",
    "base_url": "https://tg.i-c-a.su",
    "messages_db_path": "telegram-messages.db",
    "storage_type": "sqlite", // sqlite, json
    "check_interval": 300, // seconds
    "max_messages_per_channel": 100,
    "request_timeout": 30, // seconds
    "max_retries": 3,
    "retry_delay": 60, // seconds
    "rate_limit_delay": 4, // seconds
    "log_level": "INFO",
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
        "openrouter_api_key": "",
        "initial_model": "deepseek/deepseek-r1-distill-llama-70b:free",
        "detailed_model": "", // if empty, program ll use initial_model if not empty, program will additionally use detailed_model if token found
        "base_url": "https://openrouter.ai/api/v1",
        "temperature": 0.2
    },
    "rug_check": {
        "verbose_log": false,
        "simulation_mode": true,
        // Dangerous
        "allow_mint_authority": false, // The mint authority is the address that has permission to mint (create) new tokens. Strongly Advised to set to false.
        "allow_not_initialized": false, // This indicates whether the token account is properly set up on the blockchain. Strongly Advised to set to false
        "allow_freeze_authority": false, // The freeze authority is the address that can freeze token transfers, effectively locking up funds. Strongly Advised to set to false
        "allow_rugged": false,
        // Critical
        "allow_mutable": false,
        "block_returning_token_names": true,
        "block_returning_token_creators": true,
        "block_symbols": ["XXX"],
        "block_names": ["XXX"],
        "allow_insider_topholders": false, // Allow inseder accounts to be part of the topholders
        "max_alowed_pct_topholders": 1, // Max allowed percentage an individual topholder might hold
        "exclude_lp_from_topholders": false, // If true, Liquidity Pools will not be seen as top holders
        // Warning
        "min_total_markets": 999,
        "min_total_lp_providers": 999,
        "min_total_market_Liquidity": 1000000,
        // Misc
        "ignore_pump_fun": true,
        "max_score": 1, // Set to 0 to ignore
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