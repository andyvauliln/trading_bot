import path from "path";
import dotenv from "dotenv";
dotenv.config();

const module_name = "api";

export const config = {
  verbose_log: true,
  name: module_name,
  port: 9090,
  db_logs_path: path.resolve(process.cwd(), 'data', 'app-logs.db'),
  db_historical_data_path: path.resolve(process.cwd(), 'data', 'historical-data.db'),
  bots:['tracker-bot', 'telegram-trading-bot', "solana-sniper-bot"],
  db_holdings_path: path.resolve(process.cwd(), 'data', 'holdings.db'),
  logger: {
    keeping_days_in_db: 10,
    terminal_logs: true,
    db_logs: false,
    file_logs: false,
    db_logs_path: path.resolve(process.cwd(), 'data', 'app-logs.db'),
    file_logs_path: path.resolve(process.cwd(), 'logs', `${module_name}.log`),
  },
};
