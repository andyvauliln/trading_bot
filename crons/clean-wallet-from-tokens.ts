import axios from "axios";
import { Connection, Keypair, VersionedTransaction, PublicKey, Transaction, SystemProgram, sendAndConfirmTransaction } from "@solana/web3.js";
import { Wallet } from "@project-serum/anchor";
import bs58 from "bs58";
import dotenv from "dotenv";
import { getSkippedHoldings, removeHolding } from "../bots/tracker-bot/holding.db";
import { createBurnInstruction } from "@solana/spl-token";
import { createSellTransaction } from "../bots/tracker-bot/transactions";

// Load environment variables from the .env file
dotenv.config();

/**
 * Helper function to retry API requests with exponential backoff
 * @param requestFn Function that returns a Promise
 * @param maxRetries Maximum number of retry attempts
 * @param initialDelay Initial delay in ms before first retry
 * @returns The result or throws an error after all retries fail
 */
async function retryApiRequest<T>(
  requestFn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelay: number = 1000
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
  maxRetries: number = 3,
  initialDelay: number = 1000
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
 * Gets all token accounts for a wallet
 */
async function getTokenAccounts(walletPublicKey: PublicKey, connection: Connection): Promise<Array<{
  mint: string;
  balance: string;
  decimals: number;
  account: string;
  uiAmount?: number;
}>> {
  try {
    // Use Jupiter's API to get token balances - more reliable and includes token metadata
    console.log(`🔄 Fetching token balances from Jupiter API for wallet ${walletPublicKey.toString()}...`);
    const jupiterApiUrl = `https://api.jup.ag/ultra/v1/balances/${walletPublicKey.toString()}`;
    
    // Use our retry function for the Jupiter API request with timeout
    const balancesResponse = await retryApiRequest(async () => {
      // Create timeout promise that rejects after 15 seconds
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Jupiter API request timed out after 15 seconds')), 15000);
      });
      
      // Fetch request promise
      const fetchPromise = fetch(jupiterApiUrl);
      
      // Race the fetch against the timeout
      const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;
      
      if (!response.ok) {
        throw new Error(`Jupiter API returned ${response.status}: ${response.statusText}`);
      }
      
      return response.json();
    }, 5, 2000); // 5 retries, starting with 2 second delay
    
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
 * Burns a token by sending it to a burn address
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
    
    // Create the burn instruction
    const burnInstruction = createBurnInstruction(
      tokenAccountPubkey,
      mintPubkey,
      wallet.publicKey,
      BigInt(amount)
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
 * Process skipped holdings from the database - first try to sell them, then burn if selling fails
 */
async function processSkippedHoldings(privateKey: string): Promise<{ success: boolean; results: any[]; unlisted_tokens: any[] }> {
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
    console.log(`-----------------------------------------------------------------`);
    console.log(`| Token Mint                                      | Balance     |`);
    console.log(`-----------------------------------------------------------------`);
    
    if (allTokenAccounts.length === 0) {
      console.log(`| No tokens found in this wallet                                 |`);
    } else {
      allTokenAccounts.forEach(token => {
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

    // Get all skipped holdings from the database
    const skippedHoldings = await getSkippedHoldings();
    
    // Filter for this wallet only
    const walletSkippedHoldings = skippedHoldings.filter(
      holding => holding.WalletPublicKey === walletPublicKey.toString()
    );
    
    if (walletSkippedHoldings.length === 0) {
      console.log("No skipped tokens found for this wallet");
      return { 
        success: true, 
        results: [], 
        unlisted_tokens: allTokenAccounts.map(token => ({
          token: token.mint,
          balance: token.balance,
          decimals: token.decimals
        }))
      };
    }
    
    console.log(`Found ${walletSkippedHoldings.length} skipped tokens to process for wallet ${walletPublicKey.toString()}`);
    
    // Check for tokens in wallet that are not in holdings tables
    const holdingTokens = new Set(walletSkippedHoldings.map(h => h.Token));
    const unlisted_tokens = allTokenAccounts.filter(token => !holdingTokens.has(token.mint));
    
    if (unlisted_tokens.length > 0) {
      console.log(`\n⚠️ Found ${unlisted_tokens.length} tokens in wallet that are not in the holdings table`);
      console.log(`These tokens will not be processed. Add them to the skipped holdings if needed.`);
    }
    
    // Results array to track progress
    const results = [];
    
    // Get all token accounts for burn operations if Jupiter API was used
    let tokenAccountsForBurn: any[] = [];
    // Check if we're using Jupiter API data (which doesn't have token accounts)
    if (allTokenAccounts.length > 0 && !allTokenAccounts[0].account) {
      console.log("🔄 Fetching token accounts for burn operations...");
      // Get token accounts using Solana RPC
      const tokenAccountsResponse = await retrySolanaRequest(() => 
        connection.getParsedTokenAccountsByOwner(
          walletPublicKey,
          { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }
        )
      );
      
      tokenAccountsForBurn = tokenAccountsResponse.value.map(account => {
        const parsedAccountInfo = account.account.data.parsed.info;
        return {
          mint: parsedAccountInfo.mint,
          account: account.pubkey.toString()
        };
      });
    }
    
    // Process each skipped holding
    for (const holding of walletSkippedHoldings) {
      try {
        // Find matching token account
        const tokenAccount = allTokenAccounts.find(account => account.mint === holding.Token);
        
        if (!tokenAccount) {
          console.log(`❌ Token account not found for ${holding.Token}`);
          results.push({
            token: holding.Token,
            success: false,
            msg: "Token account not found"
          });
          continue;
        }
        
        console.log(`🔄 Processing token: ${holding.Token} (${holding.TokenName})`);
        console.log(`   Balance: ${tokenAccount.uiAmount || tokenAccount.balance}`);

        // Check if we have enough SOL to pay for the transaction
        const solBalance = await retrySolanaRequest(() => connection.getBalance(walletPublicKey));
        const minRequiredBalance = 5000 + 1000000; // base fee + safety buffer
        
        if (solBalance < minRequiredBalance) {
          console.log(`⛔ Wallet has insufficient SOL for fees: ${solBalance / 1e9} SOL`);
          results.push({
            token: holding.Token,
            success: false,
            msg: "Insufficient SOL for fees"
          });
          continue;
        }
        
        // Option 1: Try to sell the token using createSellTransaction
        try {
          console.log(`💰 Attempting to sell token ${holding.Token} using createSellTransaction...`);
          
          const sellTxResult = await createSellTransaction(
            "So11111111111111111111111111111111111111112", // SOL mint
            holding.Token,
            tokenAccount.balance,
            0, // processRunCounter
            "sell", // type
            privateKey
          );
          
          if (!sellTxResult || !sellTxResult.success) {
            console.log(`❌ Could not sell token ${holding.Token}: ${sellTxResult?.msg || "Failed to create sell transaction"}`);
            console.log(`🔥 Burning the token...`);
            
            // Find token account for burn if using Jupiter API
            let tokenAccountAddress = tokenAccount.account;
            if (!tokenAccountAddress && tokenAccountsForBurn.length > 0) {
              const burnAccount = tokenAccountsForBurn.find(acc => acc.mint === holding.Token);
              if (burnAccount) {
                tokenAccountAddress = burnAccount.account;
              } else {
                console.error(`❌ Could not find token account for burning ${holding.Token}`);
                results.push({
                  token: holding.Token,
                  tokenName: holding.TokenName,
                  success: false,
                  msg: "Could not find token account for burning",
                  method: "burn_failed"
                });
                continue;
              }
            }
            
            if (!tokenAccountAddress) {
              console.error(`❌ No token account address found for ${holding.Token}`);
              results.push({
                token: holding.Token,
                tokenName: holding.TokenName,
                success: false,
                msg: "No token account address for burning",
                method: "burn_failed"
              });
              continue;
            }
            
            // Burn the token
            const signature = await burnToken(
              connection,
              myWallet,
              holding.Token,
              tokenAccountAddress,
              tokenAccount.balance
            );
            
            // Confirm the transaction was successful before removing from database
            console.log(`⏳ Confirming burn transaction ${signature}...`);
            const latestBlockhash = await retrySolanaRequest(() => connection.getLatestBlockhash());
            const confirmation = await retrySolanaRequest(() => 
              connection.confirmTransaction({
                blockhash: latestBlockhash.blockhash,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
                signature: signature
              }, 'confirmed')
            );
            
            if (confirmation.value.err) {
              console.error(`❌ Burn Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
              results.push({
                token: holding.Token,
                tokenName: holding.TokenName,
                success: false,
                txId: signature,
                msg: `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
                method: "burn_failed"
              });
              continue;
            }
            
            console.log(`✅ Burn transaction confirmed successfully!`);
            
            // Only remove the holding after successful confirmation
            await removeHolding(holding.Token, 0, walletPublicKey.toString());
            console.log(`🗑️ Removed holding from database: ${holding.Token} (${holding.TokenName})`);
            
            results.push({
              token: holding.Token,
              tokenName: holding.TokenName,
              success: true,
              tx: signature,
              method: "burned"
            });
          } else {
            // Transaction was successful
            console.log(`✅ Successfully sold token ${holding.Token}, tx: https://solscan.io/tx/${sellTxResult.tx}`);
            
            // Only remove the holding after successful confirmation
            await removeHolding(holding.Token, 0, walletPublicKey.toString());
            console.log(`🗑️ Removed holding from database: ${holding.Token} (${holding.TokenName})`);
            
            results.push({
              token: holding.Token,
              tokenName: holding.TokenName,
              success: true,
              tx: sellTxResult.tx,
              method: "sold"
            });
          }
        } catch (error: any) {
          console.error(`⛔ Error processing token ${holding.Token}: ${error.message}`);
          results.push({
            token: holding.Token,
            tokenName: holding.TokenName || "",
            success: false,
            msg: error.message
          });
        }
      } catch (error: any) {
        console.error(`⛔ Error processing token ${holding.Token}: ${error.message}`);
        results.push({
          token: holding.Token,
          tokenName: holding.TokenName || "",
          success: false,
          msg: error.message
        });
      }
    }
    
    return { 
      success: true, 
      results,
      unlisted_tokens: unlisted_tokens.map(token => ({
        token: token.mint,
        balance: token.balance,
        decimals: token.decimals
      }))
    };
    
  } catch (error: any) {
    console.error(`⛔ Error processing skipped holdings: ${error.message}`);
    return { success: false, results: [], unlisted_tokens: [] };
  }
}

// Run the script if called directly
if (require.main === module) {
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
  const allResults: Array<{
    walletIndex: number;
    success: boolean;
    tokensProcessed: number;
    results: any[];
    error?: string;
    unlisted_tokens: any[];
  }> = [];

  // Process the wallets one at a time in sequence
  let promiseChain = Promise.resolve();
  
  privateKeys.forEach((privateKey, index) => {
    promiseChain = promiseChain.then(() => {
      console.log(`\n🔑 Processing wallet ${index+1} of ${privateKeys.length}...`);
      
      return processSkippedHoldings(privateKey)
        .then(result => {
          console.log(`Wallet ${index+1} processing completed:`, result.success ? "✅ Success" : "❌ Failed");
          console.log(`Processed ${result.results.length} skipped tokens in this wallet`);
          
          if (result.unlisted_tokens && result.unlisted_tokens.length > 0) {
            console.log(`Found ${result.unlisted_tokens.length} tokens not in holdings table`);
          }
          
          allResults.push({
            walletIndex: index+1,
            success: result.success,
            tokensProcessed: result.results.length,
            results: result.results,
            unlisted_tokens: result.unlisted_tokens || []
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
  
  // After all wallets are processed, save the results
  promiseChain
    .then(() => {
      console.log(`\n✅ All wallets processed sequentially. Processed ${allResults.length} wallet(s).`);
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error("❌ Unhandled error in the main process:", err);
      process.exit(1);
    });
}