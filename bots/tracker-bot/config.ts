import path from "path";
import dotenv from "dotenv";
import { getAppVersion } from "../../common/utils/help-functions";
import { TradeStrategy, TrackerBotConfig } from "./types";
import { app_config_common } from "../../common/config-app";
import { BotConfig } from "../../db/config.db";
dotenv.config();

const MODULE_NAME = "tracker-bot";

const defaultStrategy: TradeStrategy = {
  stop_loss: [
    {
      type: "stop_loss",
      threshold: 20,
      threshold_unit: "percent",
      sellAmount: 100,
      sellAmount_unit: "percent",
      order: 1,
      executed: false,
    },
  ],
  take_profit: [
    {
      type: "take_profit",
      threshold: 20,
      threshold_unit: "percent",
      sellAmount: 30,
      sellAmount_unit: "percent",
      order: 2,
      executed: false,
    },
    {
      type: "take_profit",
      threshold: 50,
      threshold_unit: "percent",
      sellAmount: 40,
      sellAmount_unit: "percent",
      order: 3,
      executed: false,
    },
    {
      type: "take_profit",
      threshold: 100,
      threshold_unit: "percent",
      sellAmount: 30,
      sellAmount_unit: "percent",
      order: 4,
      executed: false,
    },
  ],
};

const defaultTrackerBotConfig: TrackerBotConfig = {
  prio_fee_max_lamports: 1000000, // 0.001 SOL
  prio_level: "veryHigh", // If you want to land transaction fast, set this to use `veryHigh`. You will pay on average higher priority fee.
  slippageBps: "400", // 4%
  auto_sell: true, // If set to true, trade strategies are automatically applied
  strategy: defaultStrategy,
  include_fees_in_pnl: true,
};

const defaultBotConfig: BotConfig = {
  bot_name: MODULE_NAME,
  bot_type: "solana-tracker",
  bot_version: getAppVersion(),
  bot_description: "Default Tracker bot",
  bot_author_wallet_address: "3PM9ByJwxoX8LpKiSqoVvKsS6xEkakkQ9Civj3tBCK5c",
  send_notifications_to_discord: process.env.SEND_NOTIFICATIONS_TO_DISCORD === 'true',
  is_enabled: true,
  bot_wallet_address: "3PM9ByJwxoX8LpKiSqoVvKsS6xEkakkQ9Civj3tBCK5c",
  bot_data: defaultTrackerBotConfig
};



export const tracker_bot_config = {
  verbose_log: process.env.VERBOSE_LOG === 'true',
  name: MODULE_NAME,
  check_interval: 60, // seconds
  environment: process.env.NODE_ENV || "development", // development, production, test
  db_name_tracker_holdings: path.resolve(process.cwd(), 'data', 'holdings.db'), // Sqlite Database location
  max_sell_attempts: 3, //TODO: DO WE PAY FEE FOR ATTEMPTS?
  config_common: app_config_common,
  logger: {
    keeping_days_in_db: 10,
    terminal_logs: process.env.IS_TERMINAL_LOG === 'true' || process.env.NODE_ENV === 'development',
    db_logs: true,
    file_logs: process.env.FILE_LOGS === 'true',
    db_logs_path: path.resolve(process.cwd(), 'data', `${MODULE_NAME}-logs.db`),
    file_logs_path: path.resolve(process.cwd(), 'logs', `${MODULE_NAME}.log`),
  },
  bot_default_config: defaultBotConfig,
};

