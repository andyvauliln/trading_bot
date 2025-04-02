import axios from "axios";
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { Wallet } from "@project-serum/anchor";
import bs58 from "bs58";
import dotenv from "dotenv";
import { getAllHoldings, getSkippedHoldings, removeHolding } from "../db/holding.db";
import { createBurnCheckedInstruction } from "@solana/spl-token";
import { createSellTransaction, getTokenQuotes, calculatePNL } from "../bots/tracker-bot/tracker-utils";
import { HoldingRecord as DBHoldingRecord, HoldingRecord } from "../bots/tracker-bot/types";

// Load environment variables from the .env file
dotenv.config();

// Configuration constants
const IS_CLEAN_TOKENS_WHERE_NOT_POSSIBLE_TO_SELL = true;
const MIN_SOL_BALANCE_FOR_TRANSACTIONS = 5000 + 1000000; // base fee + safety buffer
const JUPITER_API_TIMEOUT_MS = 15000;
const MAX_API_RETRIES = 5;
const INITIAL_RETRY_DELAY_MS = 2000;

// Type definitions for better readability
interface TokenAccount {
  mint: string;
  balance: string;
  decimals: number;
  account: string;
  uiAmount?: number;
}

interface ProcessingResult {
  token: string;
  tokenName: string;
  success: boolean;
  tx?: string;
  msg?: string;
  method?: "sold" | "burned" | "sell_failed" | "burn_failed";
  wasTracked?: boolean;
}

interface ProcessingSummary {
  total: number;
  sold: number;
  burned: number;
  failed: number;
  tracked: number;
  unlisted: number;
}

interface ProcessingResponse {
  success: boolean;
  results: ProcessingResult[];
  unlisted_tokens: {
    token: string;
    balance: string;
    decimals: number;
  }[];
  summary?: ProcessingSummary;
}

interface WalletProcessingResult extends ProcessingResponse {
  walletIndex: number;
  tokensProcessed: number;
  error?: string;
}

/**
 * Helper function to retry API requests with exponential backoff
 * @param requestFn Function that returns a Promise
 * @param maxRetries Maximum number of retry attempts
 * @param initialDelay Initial delay in ms before first retry
 * @returns The result or throws an error after all retries fail
 */
async function retryApiRequest<T>(
  requestFn: () => Promise<T>,
  maxRetries: number = MAX_API_RETRIES,
  initialDelay: number = INITIAL_RETRY_DELAY_MS
): Promise<T> {
  let lastError: any;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await requestFn();
    } catch (error: any) {
      lastError = error;
      
      if (attempt >= maxRetries) {
        console.log(`Max retries (${maxRetries}) reached for API request`);
        break;
      }
      
      // Add some randomness (jitter) to avoid thundering herd problem
      const jitter = Math.random() * 1000;
      const waitTime = delay + jitter;
      
      console.log(`API request failed: ${error.message}, retrying in ${Math.round(waitTime/1000)}s, attempt ${attempt+1}/${maxRetries}`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // Increase delay for next attempt with exponential backoff
      delay *= 2;
    }
  }
  
  throw lastError;
}

/**
 * Helper function to retry Solana RPC requests with exponential backoff
 * @param requestFn Function that returns a Promise
 * @param maxRetries Maximum number of retry attempts
 * @param initialDelay Initial delay in ms before first retry
 * @returns The result or throws an error after all retries fail
 */
async function retrySolanaRequest<T>(
  requestFn: () => Promise<T>,
  maxRetries: number = MAX_API_RETRIES,
  initialDelay: number = INITIAL_RETRY_DELAY_MS
): Promise<T> {
  let lastError: any;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await requestFn();
    } catch (error: any) {
      lastError = error;
      
      if (attempt >= maxRetries) {
        console.log(`Max retries (${maxRetries}) reached for Solana RPC request`);
        break;
      }
      
      // Add some randomness (jitter) to avoid thundering herd problem
      const jitter = Math.random() * 1000;
      const waitTime = delay + jitter;
      
      console.log(`Solana request failed: ${error.message}, retrying in ${Math.round(waitTime/1000)}s, attempt ${attempt+1}/${maxRetries}`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // Increase delay for next attempt with exponential backoff
      delay *= 2;
    }
  }
  
  throw lastError;
}

/**
 * Script to process tokens marked as "skipped" in the database
 * The process for each token is:
 * 1. First tries to sell the token using createSellTransaction
 * 2. If selling fails, burns the token
 * 3. After successful selling or burning, removes the token from database
 * 
 * Usage:
 * npx ts-node crons/clean-wallet-from-tokens.ts
 */

/**
 * Gets all token accounts for a wallet, first trying Jupiter API then falling back to Solana RPC
 * @param walletPublicKey Public key of the wallet to fetch token accounts for
 * @param connection Solana RPC connection
 * @returns Array of token accounts with balances
 */
async function getTokenAccounts(walletPublicKey: PublicKey, connection: Connection): Promise<TokenAccount[]> {
  try {
    // Use Jupiter's API to get token balances - more reliable and includes token metadata
    console.log(`🔄 Fetching token balances from Jupiter API for wallet ${walletPublicKey.toString()}...`);
    const jupiterApiUrl = `https://api.jup.ag/ultra/v1/balances/${walletPublicKey.toString()}`;
    
    // Use our retry function for the Jupiter API request with timeout
    const balancesResponse = await retryApiRequest(async () => {
      // Create timeout promise that rejects after 15 seconds
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Jupiter API request timed out after 15 seconds')), JUPITER_API_TIMEOUT_MS);
      });
      
      // Fetch request promise
      const fetchPromise = fetch(jupiterApiUrl);
      
      // Race the fetch against the timeout
      const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;
      
      if (!response.ok) {
        throw new Error(`Jupiter API returned ${response.status}: ${response.statusText}`);
      }
      
      return response.json();
    });
    
    console.log(`✅ Jupiter API returned balances for ${Object.keys(balancesResponse).length} tokens`);
    
    // Transform Jupiter format to our format and filter out SOL and frozen tokens
    const filteredTokens = Object.entries(balancesResponse)
      .filter(([tokenMint, tokenData]: [string, any]) => {
        // Skip SOL and frozen tokens
        return tokenMint !== "SOL" && !tokenData.isFrozen;
      })
      .map(([tokenMint, tokenData]: [string, any]) => {
        return {
          mint: tokenMint,
          balance: tokenData.amount,
          uiAmount: tokenData.uiAmount,
          decimals: Math.log10(tokenData.uiAmount / (Number(tokenData.amount) || 1)), // Calculate decimals from amounts
          account: "" // We don't have the token account from Jupiter API, but we don't need it for display
        };
      });
      
    console.log(`📊 Found ${filteredTokens.length} non-SOL, non-frozen tokens in wallet`);
    return filteredTokens;
  } catch (error: any) {
    console.error(`❌ Failed to fetch Jupiter balances: ${error.message}`);
    console.log("⚠️ Falling back to Solana RPC for token accounts...");
    
    // Fallback to the original method using Solana RPC
    const tokenAccounts = await retrySolanaRequest(() => 
      connection.getParsedTokenAccountsByOwner(
        walletPublicKey,
        { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }
      )
    );

    return tokenAccounts.value.map(account => {
      const parsedAccountInfo = account.account.data.parsed.info;
      const mintAddress = parsedAccountInfo.mint;
      const tokenBalance = parsedAccountInfo.tokenAmount.amount;
      const decimals = parsedAccountInfo.tokenAmount.decimals;
      
      return {
        mint: mintAddress,
        balance: tokenBalance,
        decimals,
        account: account.pubkey.toString()
      };
    }).filter(token => Number(token.balance) > 0); // Only include tokens with balance
  }
}

/**
 * Fetches token accounts needed for burn operations
 * @param walletPublicKey Wallet public key
 * @param connection Solana RPC connection
 * @returns Array of mint addresses and their associated token accounts
 */
async function getTokenAccountsForBurn(walletPublicKey: PublicKey, connection: Connection): Promise<Array<{mint: string, account: string}>> {
  console.log("🔄 Fetching token accounts for burn operations...");
  // Get token accounts using Solana RPC
  const tokenAccountsResponse = await retrySolanaRequest(() => 
    connection.getParsedTokenAccountsByOwner(
      walletPublicKey,
      { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }
    )
  );
  
  return tokenAccountsResponse.value.map(account => {
    const parsedAccountInfo = account.account.data.parsed.info;
    return {
      mint: parsedAccountInfo.mint,
      account: account.pubkey.toString()
    };
  });
}

/**
 * Prints a table of tokens found in a wallet
 * @param tokenAccounts Array of token accounts to display
 */
function displayTokenTable(tokenAccounts: TokenAccount[]): void {
  console.log(`-----------------------------------------------------------------`);
  console.log(`| Token Mint                                      | Balance     |`);
  console.log(`-----------------------------------------------------------------`);
  
  if (tokenAccounts.length === 0) {
    console.log(`| No tokens found in this wallet                                 |`);
  } else {
    tokenAccounts.forEach(token => {
      // Use uiAmount if available (from Jupiter), otherwise calculate it
      const formattedBalance = token.uiAmount || Number(token.balance) / Math.pow(10, token.decimals);
      const balanceStr = formattedBalance.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 6
      });
      console.log(`| ${token.mint.padEnd(46)} | ${balanceStr.padStart(10)} |`);
    });
  }
  console.log(`-----------------------------------------------------------------`);
}

/**
 * Burns a token by sending it to a burn address
 * @param connection Solana RPC connection
 * @param wallet Wallet to burn tokens from
 * @param tokenMintAddress Mint address of the token to burn
 * @param tokenAccount Token account address holding the tokens
 * @param amount Amount of tokens to burn
 * @returns Transaction signature
 */
async function burnToken(
  connection: Connection,
  wallet: Wallet,
  tokenMintAddress: string,
  tokenAccount: string,
  amount: string
): Promise<string> {
  try {
    // Convert string addresses to PublicKey objects
    const mintPubkey = new PublicKey(tokenMintAddress);
    const tokenAccountPubkey = new PublicKey(tokenAccount);
    
    // Get token decimals
    const tokenInfo = await connection.getParsedAccountInfo(mintPubkey);
    const decimals = (tokenInfo.value?.data as any)?.parsed?.info?.decimals || 0;
    
    // Create the burn instruction
    const burnInstruction = createBurnCheckedInstruction(
      tokenAccountPubkey,  // token account to burn from
      mintPubkey,         // mint address
      wallet.publicKey,   // token authority
      BigInt(amount),    // amount to burn
      decimals          // token decimals
    );
    
    // Create and sign transaction
    const transaction = new Transaction().add(burnInstruction);
    
    // Set recent blockhash and fee payer
    transaction.feePayer = wallet.publicKey;
    const blockhash = await retrySolanaRequest(() => connection.getLatestBlockhash());
    transaction.recentBlockhash = blockhash.blockhash;
    
    // Sign and send transaction
    const signature = await retrySolanaRequest(() => 
      sendAndConfirmTransaction(
        connection,
        transaction,
        [wallet.payer],
        { commitment: 'confirmed' }
      )
    );
    
    console.log(`🔥 Successfully burned ${amount} of token ${tokenMintAddress}`);
    console.log(`📝 Transaction: https://solscan.io/tx/${signature}`);
    
    return signature;
  } catch (error: any) {
    console.error(`❌ Error burning token: ${error.message}`);
    throw error;
  }
}

/**
 * Verify a transaction was confirmed on the blockchain
 * @param connection Solana RPC connection
 * @param signature Transaction signature to verify
 * @returns True if confirmed, throws error if failed
 */
async function verifyTransactionConfirmation(connection: Connection, signature: string): Promise<boolean> {
  console.log(`⏳ Confirming transaction ${signature}...`);
  const latestBlockhash = await retrySolanaRequest(() => connection.getLatestBlockhash());
  const confirmation = await retrySolanaRequest(() => 
    connection.confirmTransaction({
      blockhash: latestBlockhash.blockhash,
      lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      signature: signature
    }, 'confirmed')
  );
  
  if (confirmation.value.err) {
    const errorMessage = JSON.stringify(confirmation.value.err);
    console.error(`❌ Transaction failed: ${errorMessage}`);
    throw new Error(`Transaction failed: ${errorMessage}`);
  }
  
  console.log(`✅ Transaction confirmed successfully!`);
  return true;
}

/**
 * Attempts to sell a token using Jupiter
 * @param tokenMint Token mint address
 * @param tokenBalance Token balance
 * @param tokenName Token name
 * @param privateKey Wallet private key
 * @returns Processing result object
 */
async function attemptTokenSell(
  holding: HoldingRecord,
  walletPublicKey: PublicKey,
  privateKey: string
): Promise<ProcessingResult> {
  console.log(`💰 Attempting to sell token ${holding.Token} using createSellTransaction...`);
  
  
  const quotes = await getTokenQuotes(holding, 0, false, "");
  if (!quotes || !quotes.data) {
    await removeHolding(holding.Token, 0, walletPublicKey.toString());
    return {
      token: holding.Token,
      tokenName: holding.TokenName || "Unknown",
      success: false,
      msg: "Failed to get token quotes",
      method: "sell_failed"
    };
    
  }

  const calculatedPNL = await calculatePNL(holding, quotes.data, false, 0);
  try {
    const sellTxResult = await createSellTransaction(
      holding,
      quotes.data,
      calculatedPNL,
      0, // processRunCounter
      privateKey
    );
    
    if (!sellTxResult || !sellTxResult.success) {
      return {
        token: holding.Token,
        tokenName: holding.TokenName || "Unknown",
        success: false,
        msg: sellTxResult?.msg || "Failed to create sell transaction",
        method: "sell_failed"
      };
    }
    
    // Transaction was successful
    console.log(`✅ Successfully sold token ${holding.Token}, tx: https://solscan.io/tx/${sellTxResult.tx || ""}`);
    
    return {
      token: holding.Token,
      tokenName: holding.TokenName || "Unknown",
      success: true,
      tx: sellTxResult.tx || "",
      method: "sold"
    };
  } catch (error: any) {
    return {
      token: holding.Token,
      tokenName: holding.TokenName || "Unknown",
      success: false,
      msg: error.message,
      method: "sell_failed"
    };
  }
}

/**
 * Attempts to burn a token if it couldn't be sold
 * @param connection Solana RPC connection
 * @param wallet Wallet to burn tokens from
 * @param tokenInfo Token information (mint, balance)
 * @param tokenAccountsForBurn Map of token mint addresses to token accounts
 * @returns Processing result object
 */
async function attemptTokenBurn(
  connection: Connection, 
  wallet: Wallet, 
  tokenInfo: { mint: string, balance: string, name?: string },
  tokenAccountsForBurn: Array<{mint: string, account: string}>
): Promise<ProcessingResult> {
  console.log(`🔥 Attempting to burn token ${tokenInfo.mint}...`);
  
  // Find token account for burn if using Jupiter API
  let tokenAccountAddress = "";
  const burnAccount = tokenAccountsForBurn.find(acc => acc.mint === tokenInfo.mint);
  
  if (burnAccount) {
    tokenAccountAddress = burnAccount.account;
  } else {
    console.error(`❌ Could not find token account for burning ${tokenInfo.mint}`);
    return {
      token: tokenInfo.mint,
      tokenName: tokenInfo.name || "Unknown",
      success: false,
      msg: "Could not find token account for burning",
      method: "burn_failed"
    };
  }
  
  try {
    // Burn the token
    const signature = await burnToken(
      connection,
      wallet,
      tokenInfo.mint,
      tokenAccountAddress,
      tokenInfo.balance
    );
    
    // Verify the transaction was successful
    await verifyTransactionConfirmation(connection, signature);
    
    // Remove the holding from the database after successful burn
    console.log(`🗑️ Removing holding for token ${tokenInfo.mint} from database...`);
    await removeHolding(tokenInfo.mint, 0, wallet.publicKey.toString()).catch((err) => {
      console.error(`❌ Error removing holding from database: ${err.message}`);
    });
    
    // Return successful result
    return {
      token: tokenInfo.mint,
      tokenName: tokenInfo.name || "Unknown",
      success: true,
      tx: signature,
      method: "burned"
    };
  } catch (error: any) {
    return {
      token: tokenInfo.mint,
      tokenName: tokenInfo.name || "Unknown",
      success: false,
      msg: error.message,
      method: "burn_failed"
    };
  }
}

/**
 * Checks if wallet has enough SOL for transaction fees
 * @param connection Solana RPC connection
 * @param walletPublicKey Wallet public key
 * @returns True if enough SOL, false otherwise
 */
async function hasEnoughSolForFees(connection: Connection, walletPublicKey: PublicKey): Promise<boolean> {
  const solBalance = await retrySolanaRequest(() => connection.getBalance(walletPublicKey));
  return solBalance >= MIN_SOL_BALANCE_FOR_TRANSACTIONS;
}

/**
 * Process a single token - try to sell first, then burn if selling fails
 * @param connection Solana RPC connection
 * @param wallet Wallet to process tokens from
 * @param holding Token holding record
 * @param tokenAccount Token account information
 * @param tokenAccountsForBurn Map of token mint addresses to token accounts
 * @param privateKey Private key for the wallet
 * @param isTracked Whether the token is tracked in the database
 * @returns Processing result
 */
async function processToken(
  connection: Connection,
  wallet: Wallet,
  holding: DBHoldingRecord,
  tokenAccount: TokenAccount,
  tokenAccountsForBurn: Array<{mint: string, account: string}>,
  privateKey: string,
  isTracked: boolean
): Promise<ProcessingResult> {
  try {
    console.log(`🔄 Processing token: ${holding.Token} (${holding.TokenName || 'Unknown Name'})`);
    console.log(`   Balance: ${tokenAccount.uiAmount || tokenAccount.balance}`);

    // Check if we have enough SOL to pay for the transaction
    const hasSufficientBalance = await hasEnoughSolForFees(connection, wallet.publicKey);
    
    if (!hasSufficientBalance) {
      const solBalance = await retrySolanaRequest(() => connection.getBalance(wallet.publicKey));
      console.log(`⛔ Wallet has insufficient SOL for fees: ${solBalance / 1e9} SOL`);
      return {
        token: holding.Token,
        tokenName: holding.TokenName || "Unknown",
        success: false,
        msg: "Insufficient SOL for fees",
        wasTracked: isTracked
      };
    }
    
    // First try to sell the token
    const sellResult = await attemptTokenSell(
      holding,
      wallet.publicKey,
      privateKey
    );
    
    // If selling succeeded, return the result with wasTracked flag
    if (sellResult.success) {
      return { ...sellResult, wasTracked: isTracked };
    }
    
    // If selling failed, try to burn the token
    console.log(`Could not sell token ${holding.Token}: ${sellResult.msg}`);
    const burnResult = await attemptTokenBurn(
      connection,
      wallet,
      { 
        mint: holding.Token, 
        balance: tokenAccount.balance,
        name: holding.TokenName || "Unknown"
      },
      tokenAccountsForBurn
    );
    
    // Return burn result with wasTracked flag
    return { ...burnResult, wasTracked: isTracked };
  } catch (error: any) {
    console.error(`⛔ Error processing token ${holding.Token}: ${error.message}`);
    return {
      token: holding.Token,
      tokenName: holding.TokenName || "Unknown",
      success: false,
      msg: error.message,
      wasTracked: isTracked
    };
  }
}

/**
 * Prepare a list of token holdings to process
 * @param walletPublicKey Wallet public key
 * @param allTokenAccounts All token accounts in the wallet
 * @param skippedHoldings Holdings marked as skipped in the database
 * @returns List of holdings to process
 */
async function prepareTokensToProcess(
  walletPublicKey: PublicKey,
  allTokenAccounts: TokenAccount[],
  skippedHoldings: DBHoldingRecord[]
): Promise<{
  tokensToProcess: DBHoldingRecord[],
  unlisted_tokens: any[]
}> {
  // Get all holdings from the database (skipped and not skipped)
  const allHoldings = await getAllHoldings("all", walletPublicKey.toString());

  // Check for tokens in wallet that are not in holdings tables
  const unlisted_tokens = allTokenAccounts.filter(token => 
    !allHoldings.some(h => h.Token === token.mint)
  );
  
  if (unlisted_tokens.length > 0) {
    console.log(`\n⚠️ Found ${unlisted_tokens.length} tokens in wallet that are not in the holdings table`);
    if (IS_CLEAN_TOKENS_WHERE_NOT_POSSIBLE_TO_SELL) {
      console.log(`✅ These tokens WILL be processed because IS_CLEAN_TOKENS_WHERE_NOT_POSSIBLE_TO_SELL is set to true`);
    } else {
      console.log(`❌ These tokens will NOT be processed because IS_CLEAN_TOKENS_WHERE_NOT_POSSIBLE_TO_SELL is set to false`);
      console.log(`   To process these tokens, set IS_CLEAN_TOKENS_WHERE_NOT_POSSIBLE_TO_SELL to true at the top of the script`);
    }
  }

  // Create the list of tokens to process
  let tokensToProcess = [...skippedHoldings];
  
  // If IS_CLEAN_TOKENS_WHERE_NOT_POSSIBLE_TO_SELL is true, add unlisted tokens to processing
  if (IS_CLEAN_TOKENS_WHERE_NOT_POSSIBLE_TO_SELL && unlisted_tokens.length > 0) {
    console.log(`Adding ${unlisted_tokens.length} unlisted tokens to processing queue`);
    
    // Create proper HoldingRecord objects for unlisted tokens with required fields
    const unlistedHoldings = unlisted_tokens.map(token => ({
      Token: token.mint,
      TokenName: `Unknown (${token.mint.slice(0, 4)}...${token.mint.slice(-4)})`,
      Time: Date.now(), // Current timestamp
      Balance: Number(token.balance),
      SolPaid: 0,
      SolFeePaid: 0,
      SolPaidUSDC: 0,
      SolFeePaidUSDC: 0,
      PerTokenPaidUSDC: 0,
      Slot: 0,
      Program: "unknown",
      BotName: "clean-wallet-script",
      WalletPublicKey: walletPublicKey.toString(),
      TxId: "",
      IsSkipped: 1 // Mark as skipped so it will be processed
    })) as DBHoldingRecord[];
    
    // Add unlisted tokens to the processing queue
    tokensToProcess = [...tokensToProcess, ...unlistedHoldings];
    console.log(`Added ${unlistedHoldings.length} unlisted tokens to processing queue. Total tokens to process: ${tokensToProcess.length}`);
  }
  
  return { tokensToProcess, unlisted_tokens };
}

/**
 * Generate a summary of processing results
 * @param results Array of processing results
 * @returns Summary object
 */
function generateProcessingSummary(results: ProcessingResult[]): ProcessingSummary {
  return {
    total: results.length,
    sold: results.filter(r => r.method === "sold").length,
    burned: results.filter(r => r.method === "burned").length,
    failed: results.filter(r => !r.success).length,
    tracked: results.filter(r => r.wasTracked === true).length,
    unlisted: results.filter(r => r.wasTracked === false).length
  };
}

/**
 * Log a summary of token processing
 * @param summary Summary object to log
 * @param walletIndex Optional wallet index for multi-wallet processing
 */
function logProcessingSummary(summary: ProcessingSummary, walletIndex?: number): void {
  const walletPrefix = walletIndex ? `Wallet ${walletIndex} ` : '';
  console.log(`${walletPrefix}Summary:`);
  console.log(`🔄 Total tokens processed: ${summary.total}`);
  console.log(`💰 Tokens sold: ${summary.sold}`);
  console.log(`🔥 Tokens burned: ${summary.burned}`);
  console.log(`❌ Failed operations: ${summary.failed}`);
  console.log(`📋 Tracked tokens: ${summary.tracked}`);
  console.log(`🆕 Unlisted tokens: ${summary.unlisted}`);
}

/**
 * Process skipped holdings from the database - first try to sell them, then burn if selling fails
 * @param privateKey Private key for the wallet
 * @returns Processing response
 */
async function processSkippedHoldings(privateKey: string): Promise<ProcessingResponse> {
  const rpcUrl = process.env.HELIUS_HTTPS_URI || "";
  const connection = new Connection(rpcUrl);
  
  if (!privateKey) {
    console.error("⛔ No private key provided");
    return { success: false, results: [], unlisted_tokens: [] };
  }

  try {
    // Create wallet from private key
    const myWallet = new Wallet(Keypair.fromSecretKey(bs58.decode(privateKey)));
    const walletPublicKey = myWallet.publicKey;
    console.log(`🔍 Processing skipped tokens for wallet ${walletPublicKey.toString()}...`);

    // Get all token accounts
    const allTokenAccounts = await getTokenAccounts(walletPublicKey, connection);
    
    // Print all tokens in wallet first, regardless of skipped status
    console.log(`\n📋 All tokens found in wallet ${walletPublicKey.toString()}:`);
    displayTokenTable(allTokenAccounts);

    // Get all skipped holdings from the database
    const skippedHoldings = await getSkippedHoldings(walletPublicKey.toString());
    
    // Prepare the list of tokens to process
    const { tokensToProcess, unlisted_tokens } = await prepareTokensToProcess(
      walletPublicKey,
      allTokenAccounts,
      skippedHoldings
    );

    // Check if we have any tokens to process
    if (tokensToProcess.length === 0 && unlisted_tokens.length === 0) {
      console.log("No tokens to process for this wallet");
      const summary = generateProcessingSummary([]);
      return { 
        success: true, 
        results: [], 
        unlisted_tokens: unlisted_tokens.map(token => ({
          token: token.mint,
          balance: token.balance,
          decimals: token.decimals
        })),
        summary: {
          ...summary,
          unlisted: unlisted_tokens.length
        }
      };
    }

    // Results array to track progress
    const results: ProcessingResult[] = [];
    
    // Get token accounts for burn operations if needed
    let tokenAccountsForBurn: Array<{mint: string, account: string}> = [];
    
    // Check if we're using Jupiter API data (which doesn't have token accounts)
    if (allTokenAccounts.length > 0 && !allTokenAccounts[0].account) {
      tokenAccountsForBurn = await getTokenAccountsForBurn(walletPublicKey, connection);
    }
    
    // Process each token
    for (const holding of tokensToProcess) {
      const tokenAccount = allTokenAccounts.find(t => t.mint === holding.Token);
      if (!tokenAccount) {
        console.log(`❌ Token account not found for ${holding.Token}`);
        results.push({
          token: holding.Token,
          tokenName: holding.TokenName || "Unknown",
          success: false,
          msg: "Token account not found",
          wasTracked: holding.IsSkipped !== 1
        });
        continue;
      }

      // Try to sell first
      let sellResult = await processToken(
        connection,
        myWallet,
        holding,
        tokenAccount,
        tokenAccountsForBurn,
        privateKey,
        holding.IsSkipped !== 1
      );

      if (sellResult.success) {
        results.push({
          token: holding.Token,
          tokenName: holding.TokenName || "Unknown",
          success: true,
          method: "sold",
          wasTracked: holding.IsSkipped !== 1
        });
        continue;
      }

      // If selling fails, try to burn
      let burnResult = await attemptTokenBurn(
        connection,
        myWallet,
        {
          mint: holding.Token,
          balance: tokenAccount.balance,
          name: holding.TokenName || "Unknown"
        },
        tokenAccountsForBurn
      );

      results.push({
        token: holding.Token,
        tokenName: holding.TokenName || "Unknown",
        success: burnResult.success,
        method: burnResult.success ? "burned" : "burn_failed",
        msg: burnResult.success ? undefined : burnResult.msg,
        wasTracked: holding.IsSkipped !== 1
      });
    }

    const summary = generateProcessingSummary(results);
    
    return {
      success: true,
      results,
      unlisted_tokens: unlisted_tokens.map(token => ({
        token: token.mint,
        balance: token.balance,
        decimals: token.decimals
      })),
      summary
    };
    
  } catch (error: any) {
    console.error(`⛔ Error processing skipped holdings: ${error.message}`);
    return { 
      success: false, 
      results: [], 
      unlisted_tokens: [],
      summary: {
        total: 0,
        sold: 0,
        burned: 0,
        failed: 0,
        tracked: 0,
        unlisted: 0
      }
    };
  }
}

/**
 * Calculate final totals across all wallet results
 * @param results Array of wallet processing results
 * @returns Final summary object
 */
function calculateFinalTotals(results: WalletProcessingResult[]): ProcessingSummary {
  return {
    total: results.reduce((sum, result) => sum + (result.summary?.total || 0), 0),
    sold: results.reduce((sum, result) => sum + (result.summary?.sold || 0), 0),
    burned: results.reduce((sum, result) => sum + (result.summary?.burned || 0), 0),
    failed: results.reduce((sum, result) => sum + (result.summary?.failed || 0), 0),
    tracked: results.reduce((sum, result) => sum + (result.summary?.tracked || 0), 0),
    unlisted: results.reduce((sum, result) => sum + (result.summary?.unlisted || 0), 0)
  };
}

/**
 * Main function to run the script
 */
async function main(): Promise<void> {
  // Get private keys from environment variable
  const privateKeysStr = process.env.PRIV_KEY_WALLETS;
  
  if (!privateKeysStr) {
    console.error("❌ No private keys found in .env file (PRIV_KEY_WALLETS)");
    process.exit(1);
  }
  
  // Parse private keys from the environment variable (comma-separated)
  const privateKeys = privateKeysStr.split(",").map(key => key.trim()).filter(key => key);
  
  if (privateKeys.length === 0) {
    console.error("❌ No valid private keys found in PRIV_KEY_WALLETS");
    process.exit(1);
  }
  
  console.log(`🔄 Processing skipped tokens for ${privateKeys.length} wallet(s) - trying to sell first, then burn if selling fails`);
  
  // Process wallets one by one using promises in sequence
  const allResults: WalletProcessingResult[] = [];

  // Process the wallets one at a time in sequence
  let promiseChain = Promise.resolve();
  
  privateKeys.forEach((privateKey, index) => {
    promiseChain = promiseChain.then(() => {
      console.log(`\n🔑 Processing wallet ${index+1} of ${privateKeys.length}...`);
      
      return processSkippedHoldings(privateKey)
        .then(result => {
          console.log(`Wallet ${index+1} processing completed:`, result.success ? "✅ Success" : "❌ Failed");
          
          if (result.summary) {
            logProcessingSummary(result.summary, index+1);
          } else {
            console.log(`Processed ${result.results.length} tokens in this wallet`);
          }
          
          if (result.unlisted_tokens && result.unlisted_tokens.length > 0) {
            console.log(`Found ${result.unlisted_tokens.length} tokens not in holdings table`);
          }
          
          allResults.push({
            walletIndex: index+1,
            tokensProcessed: result.results.length,
            ...result
          });
        })
        .catch(err => {
          console.error(`❌ Unhandled error processing wallet ${index+1}:`, err);
          
          allResults.push({
            walletIndex: index+1,
            success: false,
            tokensProcessed: 0,
            results: [],
            error: err instanceof Error ? err.message : String(err),
            unlisted_tokens: []
          });
        });
    });
  });
  
  // After all wallets are processed, log the final results
  return promiseChain
    .then(() => {
      console.log(`\n✅ All wallets processed sequentially.`);
      
      // Calculate final totals
      const totalProcessed = allResults.reduce((sum, result) => sum + result.results.length, 0);
      const successfulWallets = allResults.filter(result => result.success).length;
      
      console.log(`📊 Final Summary:`);
      console.log(`🔑 Processed ${allResults.length} wallet(s), ${successfulWallets} successful`);
      console.log(`🔄 Total tokens processed: ${totalProcessed}`);
      
      if (allResults.every(result => result.summary)) {
        const finalTotals = calculateFinalTotals(allResults);
        logProcessingSummary(finalTotals);
      }
    })
    .catch((err: unknown) => {
      console.error("❌ Unhandled error in the main process:", err);
      process.exit(1);
    });
}

// Run the script if called directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch(err => {
      console.error("Fatal error:", err);
      process.exit(1);
    });
}

// Export functions for testing or importing
export {
  processSkippedHoldings,
  getTokenAccounts,
  burnToken
};