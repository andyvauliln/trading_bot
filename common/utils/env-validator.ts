import dotenv from "dotenv";
// Load environment variables
dotenv.config();

export interface EnvConfig {
  NODE_ENV: string;
  PRIV_KEY_WALLETS: string;
  HELIUS_HTTPS_URI: string;
  HELIUS_WSS_URI: string;
  HELIUS_HTTPS_URI_TX: string;
  JUP_HTTPS_QUOTE_URI: string;
  JUP_HTTPS_SWAP_URI: string;
  JUP_HTTPS_PRICE_URI: string;
  DEX_HTTPS_LATEST_TOKENS: string;
  OPEN_ROUTER_API_KEY: string;
  BIRDEYE_API_KEY: string;
  FILE_LOGS: string;
  DISCORD_CT_TRACKER_CHANNEL: string;
  DISCORD_BOT_TOKEN: string;
  SEND_TO_DISCORD: string;
  LOGS_DAYS_TO_KEEP: string;
}

export function validateEnv(): EnvConfig {
  const requiredEnvVars = [
    "NODE_ENV",
    "HELIUS_HTTPS_URI",
    "HELIUS_WSS_URI",
    "HELIUS_HTTPS_URI_TX",
    "JUP_HTTPS_QUOTE_URI",
    "JUP_HTTPS_SWAP_URI",
    "JUP_HTTPS_PRICE_URI",
    "DEX_HTTPS_LATEST_TOKENS",
    "OPEN_ROUTER_API_KEY",
  ] as const;

  const missingVars = requiredEnvVars.filter((envVar) => {
    return !process.env[envVar];
  });

  if (missingVars.length > 0) {
    throw new Error(`🚫 Missing required environment variables: ${missingVars.join(", ")}`);
  }

  const privKeyWallets = process.env.PRIV_KEY_WALLETS;
  if (privKeyWallets && ![87, 88].includes(privKeyWallets.length)) {
    throw new Error(`🚫 PRIV_KEY_WALLETS must be 87 or 88 characters long (got ${privKeyWallets.length})`);
  }

  const validateUrl = (envVar: string, protocol: string, checkApiKey: boolean = false) => {
    const value = process.env[envVar];
    if (!value) return;

    const url = new URL(value);
    if (value && url.protocol !== protocol) {
      throw new Error(`🚫 ${envVar} must start with ${protocol}`);
    }
    if (checkApiKey && value) {
      const apiKey = url.searchParams.get("api-key");
      if (!apiKey || apiKey.trim() === "") {
        throw new Error(`🚫 The 'api-key' parameter is missing or empty in the URL: ${value}`);
      }
    }
  };

  validateUrl("HELIUS_HTTPS_URI", "https:", true);
  validateUrl("HELIUS_WSS_URI", "wss:", true);
  validateUrl("HELIUS_HTTPS_URI_TX", "https:", true);
  validateUrl("JUP_HTTPS_QUOTE_URI", "https:");
  validateUrl("JUP_HTTPS_SWAP_URI", "https:");
  validateUrl("JUP_HTTPS_PRICE_URI", "https:");
  validateUrl("DEX_HTTPS_LATEST_TOKENS", "https:");

  if (process.env.HELIUS_HTTPS_URI_TX?.includes("{function}")) {
    throw new Error("🚫 HELIUS_HTTPS_URI_TX contains {function}. Check your configuration.");
  }

  // Validate boolean strings
  const validateBoolean = (envVar: string) => {
    const value = process.env[envVar];
    if (value && value !== "true" && value !== "false") {
      throw new Error(`🚫 ${envVar} must be either "true" or "false" (got "${value}")`);
    }
  };

  validateBoolean("FILE_LOGS");
  validateBoolean("SEND_TO_DISCORD");

  // Validate numeric values
  const validateNumber = (envVar: string) => {
    const value = process.env[envVar];
    if (value && isNaN(Number(value))) {
      throw new Error(`🚫 ${envVar} must be a number (got "${value}")`);
    }
  };

  validateNumber("LOGS_DAYS_TO_KEEP");

  return {
    NODE_ENV: process.env.NODE_ENV!,
    PRIV_KEY_WALLETS: process.env.PRIV_KEY_WALLETS || "",
    HELIUS_HTTPS_URI: process.env.HELIUS_HTTPS_URI!,
    HELIUS_WSS_URI: process.env.HELIUS_WSS_URI!,
    HELIUS_HTTPS_URI_TX: process.env.HELIUS_HTTPS_URI_TX!,
    JUP_HTTPS_QUOTE_URI: process.env.JUP_HTTPS_QUOTE_URI!,
    JUP_HTTPS_SWAP_URI: process.env.JUP_HTTPS_SWAP_URI!,
    JUP_HTTPS_PRICE_URI: process.env.JUP_HTTPS_PRICE_URI!,
    DEX_HTTPS_LATEST_TOKENS: process.env.DEX_HTTPS_LATEST_TOKENS!,
    OPEN_ROUTER_API_KEY: process.env.OPEN_ROUTER_API_KEY!,
    BIRDEYE_API_KEY: process.env.BIRDEYE_API_KEY || "",
    FILE_LOGS: process.env.FILE_LOGS || "true",
    DISCORD_CT_TRACKER_CHANNEL: process.env.DISCORD_CT_TRACKER_CHANNEL || "",
    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN || "",
    SEND_TO_DISCORD: process.env.SEND_TO_DISCORD || "false",
    LOGS_DAYS_TO_KEEP: process.env.LOGS_DAYS_TO_KEEP || "10",
  };
}
