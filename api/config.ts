import path from "path";
import dotenv from "dotenv";
dotenv.config();

const module_name = "api";

export const config = {
  verbose_log: true,
  name: module_name,
  environment: process.env.NODE_ENV || "development", // development, production, test
  port: 9090,
  wsol_pc_mint: "So11111111111111111111111111111111111111112",
  db_historical_data_path: path.resolve(process.cwd(), 'data', 'historical-data.db'),
  bots:['tracker-bot', 'telegram-trading-bot', "solana-sniper-bot"],
  db_holdings_path: path.resolve(process.cwd(), 'data', 'holdings.db'),
  logger: {
    keeping_days_in_db: 10,
    terminal_logs: process.env.IS_TERMINAL_LOG === 'true' || process.env.NODE_ENV === 'development',
    db_logs: true,
    file_logs: process.env.FILE_LOGS === 'true',
    db_logs_path: path.resolve(process.cwd(), 'data', `${module_name}-logs.db`),
    file_logs_path: path.resolve(process.cwd(), 'logs', `${module_name}.log`),
  },
};
