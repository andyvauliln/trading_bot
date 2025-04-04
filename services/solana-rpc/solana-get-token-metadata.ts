import { PublicKey, Connection } from "@solana/web3.js";
import { Metaplex } from "@metaplex-foundation/js";
import { TokenMetadata } from "./solana-rpc.types";

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

/**
 * Sleep utility for retry delays
 * @param ms Milliseconds to sleep
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry a function with exponential backoff
 * @param fn Function to retry
 * @param maxRetries Maximum number of retry attempts
 * @param retryDelay Base delay between retries in ms (will be multiplied by retry attempt)
 * @param botName Bot name for logging
 * @param processRunCounter Process counter for logging
 * @returns Result of the function or throws the last error
 */
async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = MAX_RETRIES,
  retryDelay: number = RETRY_DELAY,
  botName: string,
  processRunCounter: number
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries) {
        // Calculate delay with exponential backoff
        const delay = retryDelay * Math.pow(2, attempt);
        console.warn(
          `[${botName}]|[retry]|Attempt ${attempt + 1}/${maxRetries + 1} failed, retrying in ${delay}ms`,
          processRunCounter,
          error
        );
        await sleep(delay);
      }
    }
  }
  
  throw lastError;
}

/**
 * Retrieves comprehensive metadata for a Solana token
 * @param botName Name of the bot using this function (for logging)
 * @param mint Token mint address as string
 * @param connection Optional Solana RPC connection (will create one if not provided)
 * @param processRunCounter Optional counter for logging
 * @returns TokenMetadata object with token information or null if not found
 */
export async function getTokenMetadata(
  botName: string,
  mint: string,
  connection?: Connection, 
  processRunCounter: number = 0
): Promise<TokenMetadata | null> {
  try {
    // Create connection if not provided
    if (!connection) {
      connection = new Connection(process.env.HELIUS_HTTPS_URI || "https://api.mainnet-beta.solana.com");
    }
    
    // Convert string mint to PublicKey
    const mintPubkey = new PublicKey(mint);
    
    // Initialize result with default values
    const result: TokenMetadata = {
      name: "Unknown",
      symbol: "???",
      decimals: 0,
      mintAuthority: null,
      freezeAuthority: null,
      supply: "0",
      isInitialized: false
    };
    
    // Fetch on-chain token data using SPL Token program with retry
    const tokenInfo = await retry(
      () => connection!.getAccountInfo(mintPubkey),
      MAX_RETRIES,
      RETRY_DELAY,
      botName,
      processRunCounter
    );
    
    if (!tokenInfo) {
      console.error(`[${botName}]|[getTokenMetadata]|Token account not found for mint ${mint}`, processRunCounter);
      return null;
    }
    
    // Fetch on-chain token mint info with retry
    const mintInfo = await retry(
      () => connection!.getParsedAccountInfo(mintPubkey),
      MAX_RETRIES,
      RETRY_DELAY,
      botName,
      processRunCounter
    );
    
    if (mintInfo.value && 'parsed' in mintInfo.value.data) {
      const parsedData = mintInfo.value.data.parsed;
      
      // Extract token info from parsed data
      if (parsedData.type === 'mint' && parsedData.info) {
        result.decimals = parsedData.info.decimals || 0;
        result.isInitialized = parsedData.info.isInitialized || false;
        result.mintAuthority = parsedData.info.mintAuthority || null;
        result.freezeAuthority = parsedData.info.freezeAuthority || null;
        result.supply = parsedData.info.supply || "0";
      }
    }
    
    // Try to get token metadata using Metaplex
    try {
      const metaplex = new Metaplex(connection);
      const nft = await retry(
        () => metaplex.nfts().findByMint({ mintAddress: mintPubkey }),
        MAX_RETRIES,
        RETRY_DELAY,
        botName,
        processRunCounter
      );
      
      if (nft) {
        // Clean up name and symbol by removing null characters and trimming
        result.name = nft.name.trim().replace(/\0/g, '');
        result.symbol = nft.symbol.trim().replace(/\0/g, '');
        
        console.log(`[${botName}]|[getTokenMetadata]|Successfully fetched metadata for ${mint}`, processRunCounter);
      }
    } catch (metaplexError) {
      console.warn(`[${botName}]|[getTokenMetadata]|Failed to fetch Metaplex metadata for ${mint}`, processRunCounter, metaplexError);
      // Keep default values if Metaplex lookup fails
    }
    
    return result;
  } catch (error) {
    console.error(`[${botName}]|[getTokenMetadata]|Error retrieving token metadata for ${mint}:`, processRunCounter, error);
    return null;
  }
}

/**
 * Retrieves basic token metadata (name, symbol, decimals only)
 * @param botName Name of the bot using this function (for logging)
 * @param mint Token mint address as string
 * @param connection Optional Solana RPC connection
 * @param processRunCounter Optional counter for logging
 * @returns Object with name, symbol and decimals or null if token not found
 */
export async function getBasicTokenMetadata(
  botName: string,
  mint: string,
  connection?: Connection,
  processRunCounter: number = 0
): Promise<{ name: string; symbol: string; decimals: number } | null> {

  const metadata = await getTokenMetadata(botName, mint, connection, processRunCounter);
  
  if (!metadata) {
    return null;
  }
  
  return {
    name: metadata.name,
    symbol: metadata.symbol,
    decimals: metadata.decimals
  };
}
