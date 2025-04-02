import path from "path";
import { Keypair } from "@solana/web3.js";
import { Wallet } from "@project-serum/anchor";
import bs58 from "bs58";
import { BotConfig } from "../../db/config.db";
/**
 * Helper function to retry axios requests with exponential backoff
 * @param requestFn Function that returns an axios request promise
 * @param maxRetries Maximum number of retry attempts
 * @param initialDelay Initial delay in ms before first retry
 * @param processRunCounter Process run counter for logging
 * @returns The axios response or throws an error after all retries fail
 */
export async function retryAxiosRequest<T>(
    requestFn: () => Promise<T>, 
    maxRetries: number = 3, 
    initialDelay: number = 1000,
    processRunCounter: number
  ): Promise<T> {
    let lastError: any;
    let delay = initialDelay;
  
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error: any) {
        lastError = error;
        
        // Check for rate limiting or service unavailable errors
        const statusCode = error?.response?.status;
        const isRateLimitError = statusCode === 429;
        const isServiceUnavailable = statusCode === 503;
        
        if (attempt >= maxRetries) {
          console.log(`Max retries (${maxRetries}) reached for API request`, processRunCounter);
          break;
        }
        
        // Add additional delay for rate limit errors
        if (isRateLimitError || isServiceUnavailable) {
          // Get retry-after header if available, or use exponential backoff with jitter
          const retryAfter = error?.response?.headers?.['retry-after'];
          const retryAfterMs = retryAfter ? parseInt(retryAfter) * 1000 : delay * 1.5;
          
          // Add some randomness (jitter) to avoid thundering herd problem
          const jitter = Math.random() * 1000;
          const waitTime = retryAfterMs + jitter;
          
          console.log(`Rate limit (${statusCode}) encountered, waiting ${Math.round(waitTime/1000)}s before retry, attempt ${attempt+1}/${maxRetries}`, processRunCounter);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else {
          // Standard exponential backoff for other errors
          console.log(`Request failed, retrying in ${delay}ms, attempt ${attempt+1}/${maxRetries}`, processRunCounter);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        // Increase delay for next attempt with exponential backoff
        delay *= 2; 
      }
    }
    
    throw lastError;
  }


  export function getAppVersion() {
    const packageJson = require(path.resolve(process.cwd(), 'package.json'));
    return packageJson.version;
  }
  

  export function getPrivateKeysMap():Map<string, string>{
    const walletPrivateKeys = (process.env.PRIV_KEY_WALLETS || "").split(",").map(key => key.trim()).filter(key => key);
    const walletKeyMap = new Map<string, string>();
    walletPrivateKeys.forEach(privateKey => {
        const wallet = new Wallet(Keypair.fromSecretKey(bs58.decode(privateKey)));
        const publicKey = wallet.publicKey.toString();
        walletKeyMap.set(publicKey, privateKey);
      });
    return walletKeyMap;
}

export function getBotConfigData<T>(botConfig: BotConfig): T {
  return botConfig.bot_data as T;
}