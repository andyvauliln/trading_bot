import dotenv from "dotenv";
// Load environment variables
dotenv.config();

export interface EnvConfig {
  PRIV_KEY_WALLET_1: string;
  PRIV_KEY_WALLET_2: string;
  HELIUS_HTTPS_URI: string;
  HELIUS_WSS_URI: string;
  HELIUS_HTTPS_URI_TX: string;
  JUP_HTTPS_QUOTE_URI: string;
  JUP_HTTPS_SWAP_URI: string;
  JUP_HTTPS_PRICE_URI: string;
  DEX_HTTPS_LATEST_TOKENS: string;
  OPEN_ROUTER_API_KEY: string;
}

export function validateEnv(): EnvConfig {
  const requiredEnvVars = [
    "PRIV_KEY_WALLET_1",
    "PRIV_KEY_WALLET_2",
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
    if (envVar === "PRIV_KEY_WALLET_1" && !process.env[envVar]) {
      return false; // Allow PRIV_KEY_WALLET to be empty
    }
    if (envVar === "PRIV_KEY_WALLET_2" && !process.env[envVar]) {
      return false; // Allow PRIV_KEY_WALLET to be empty
    }
    return !process.env[envVar];
  });

  if (missingVars.length > 0) {
    throw new Error(`🚫 Missing required environment variables: ${missingVars.join(", ")}`);
  }

  const privKeyWallet1 = process.env.PRIV_KEY_WALLET_1;
  if (privKeyWallet1 && ![87, 88].includes(privKeyWallet1.length)) {
    throw new Error(`🚫 PRIV_KEY_WALLET_1 must be 87 or 88 characters long (got ${privKeyWallet1.length})`);
  }
  const privKeyWallet2 = process.env.PRIV_KEY_WALLET_2;
  if (privKeyWallet2 && ![87, 88].includes(privKeyWallet2.length)) {
    throw new Error(`🚫 PRIV_KEY_WALLET_2 must be 87 or 88 characters long (got ${privKeyWallet2.length})`);
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

  return {
    PRIV_KEY_WALLET_1: process.env.PRIV_KEY_WALLET_1!,
    PRIV_KEY_WALLET_2: process.env.PRIV_KEY_WALLET_2!,
    HELIUS_HTTPS_URI: process.env.HELIUS_HTTPS_URI!,
    HELIUS_WSS_URI: process.env.HELIUS_WSS_URI!,
    HELIUS_HTTPS_URI_TX: process.env.HELIUS_HTTPS_URI_TX!,
    JUP_HTTPS_QUOTE_URI: process.env.JUP_HTTPS_QUOTE_URI!,
    JUP_HTTPS_SWAP_URI: process.env.JUP_HTTPS_SWAP_URI!,
    JUP_HTTPS_PRICE_URI: process.env.JUP_HTTPS_PRICE_URI!,
    DEX_HTTPS_LATEST_TOKENS: process.env.DEX_HTTPS_LATEST_TOKENS!,
    OPEN_ROUTER_API_KEY: process.env.OPEN_ROUTER_API_KEY!,
  };
}
