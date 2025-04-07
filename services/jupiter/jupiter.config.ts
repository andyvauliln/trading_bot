export const RETRY_CONFIG = {
    maxRetries: 3,
    retryDelay: 1000,
    backoffFactor: 1.5,
    maxDelay: 15000,
} as const;

export const API_CONFIG = {
  ENDPOINTS: {
    PROGRAM_ID_TO_LABEL: 'https://quote-api.jup.ag/v6/program-id-to-label',
    JUPITER_QUOTE: 'https://quote-api.jup.ag/v6/quote',
    HELIUS_RPC: 'https://rpc-mainnet.helius.xyz',
  },
  TIMEOUT: {
    QUOTE: 3000, // 3 seconds
  },
  TRANSACTION: {
    MAX_VERSION: 0,
    COMMITMENT: 'confirmed' as const,
  }
} as const; 