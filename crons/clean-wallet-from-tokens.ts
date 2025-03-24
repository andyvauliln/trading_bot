import axios from "axios";
import { Connection, Keypair, VersionedTransaction, PublicKey } from "@solana/web3.js";
import { Wallet } from "@project-serum/anchor";
import bs58 from "bs58";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { config } from "../bots/tracker-bot/config";
import { retryAxiosRequest } from "../bots/utils/help-functions";

// Load environment variables from the .env file
dotenv.config();

// Define a burn address (Solana's system program address is commonly used)
const BURN_ADDRESS = "11111111111111111111111111111111";

/**
 * Gets all token accounts for a wallet
 */
async function getTokenAccounts(walletPublicKey: PublicKey, connection: Connection) {
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
    walletPublicKey,
    { programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") }
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

/**
 * Clean unwanted tokens from a wallet by selling or sending to a burn address
 */
async function cleanWalletFromTokens(privateKey: string, tokensToClean?: string[]) {
  const rpcUrl = process.env.HELIUS_HTTPS_URI || "";
  const connection = new Connection(rpcUrl);
  
  if (!privateKey) {
    console.error("⛔ No private key provided");
    return { success: false, msg: "No private key provided" };
  }

  try {
    // Create wallet from private key
    const myWallet = new Wallet(Keypair.fromSecretKey(bs58.decode(privateKey)));
    const walletPublicKey = myWallet.publicKey;
    console.log(`🔍 Scanning wallet ${walletPublicKey.toString()} for tokens to clean...`);

    // Get all token accounts
    const allTokenAccounts = await getTokenAccounts(walletPublicKey, connection);
    console.log(`Found ${allTokenAccounts.length} tokens in wallet`);
    
    // If specific tokens to clean were provided, filter them
    const tokensToProcess = tokensToClean
      ? allTokenAccounts.filter(token => tokensToClean.includes(token.mint))
      : allTokenAccounts;

    if (tokensToProcess.length === 0) {
      console.log("No tokens to clean found in wallet");
      return { success: true, msg: "No tokens to clean" };
    }

    // Log the tokens to be cleaned
    console.log("Tokens to clean:");
    tokensToProcess.forEach(token => {
      console.log(`- ${token.mint}: ${token.balance} (${token.decimals} decimals)`);
    });

    // Handle each token
    const results = [];
    for (const token of tokensToProcess) {
      try {
        // Check if we have enough SOL to pay for the transaction
        const solBalance = await connection.getBalance(walletPublicKey);
        const minRequiredBalance = 5000 + 1000000; // base fee + safety buffer
        
        if (solBalance < minRequiredBalance) {
          console.log(`⛔ Wallet has insufficient SOL for fees: ${solBalance / 1e9} SOL`);
          results.push({
            mint: token.mint,
            success: false,
            msg: "Insufficient SOL for fees"
          });
          continue;
        }

        // Option 1: Try to sell the token for SOL
        const solMint = "So11111111111111111111111111111111111111112"; // Native SOL mint address
        
        // Try to use Jupiter to sell the token
        const quoteUrl = process.env.JUP_HTTPS_QUOTE_URI || "";
        const swapUrl = process.env.JUP_HTTPS_SWAP_URI || "";
        
        try {
          console.log(`Attempting to sell token ${token.mint}...`);
          
          // Request a quote to swap token for SOL
          const quoteResponse = await retryAxiosRequest(
            () => axios.get(quoteUrl, {
              params: {
                inputMint: token.mint,
                outputMint: solMint,
                amount: token.balance,
                slippageBps: 1000, // 10% slippage to ensure the trade goes through
              },
              timeout: config.tx.get_timeout,
            }),
            3,
            500,
            0
          );

          if (!quoteResponse.data) {
            throw new Error("No valid quote received");
          }

          // Serialize the quote into a swap transaction
          const swapTransaction = await retryAxiosRequest(
            () => axios.post(
              swapUrl,
              JSON.stringify({
                quoteResponse: quoteResponse.data,
                userPublicKey: walletPublicKey.toString(),
                wrapAndUnwrapSol: true,
                prioritizationFeeLamports: {
                  priorityLevelWithMaxLamports: {
                    maxLamports: 1000000, // 0.001 SOL priority fee
                    priorityLevel: "High",
                  },
                },
              }),
              {
                headers: {
                  "Content-Type": "application/json",
                },
                timeout: config.tx.get_timeout,
              }
            ),
            3,
            500,
            0
          );

          if (!swapTransaction.data) {
            throw new Error("No valid swap transaction received");
          }

          // deserialize and sign the transaction
          const swapTransactionBuf = Buffer.from(swapTransaction.data.swapTransaction, "base64");
          const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
          transaction.sign([myWallet.payer]);

          // Execute the transaction
          const rawTransaction = transaction.serialize();
          const txid = await connection.sendRawTransaction(rawTransaction, {
            skipPreflight: true,
            maxRetries: 2,
          });

          // Confirm the transaction
          const latestBlockHash = await connection.getLatestBlockhash();
          const conf = await connection.confirmTransaction({
            blockhash: latestBlockHash.blockhash,
            lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
            signature: txid,
          });

          if (conf.value.err === null) {
            console.log(`✅ Successfully sold token ${token.mint}, tx: https://solscan.io/tx/${txid}`);
            results.push({
              mint: token.mint,
              success: true,
              tx: txid,
              method: "sold"
            });
          } else {
            throw new Error(`Transaction failed: ${JSON.stringify(conf.value.err)}`);
          }
        } catch (error: any) {
          console.log(`❌ Could not sell token ${token.mint}, will try to send to burn address: ${error.message}`);
          
          // Option 2: If selling fails, send to burn address (implement this part if needed)
          // This would require creating and sending a SPL token transfer transaction
          // to the burn address
          
          results.push({
            mint: token.mint,
            success: false,
            msg: `Failed to clean token: ${error.message}`,
            method: "sell_attempt"
          });
        }
      } catch (tokenError: any) {
        console.error(`⛔ Error processing token ${token.mint}: ${tokenError.message}`);
        results.push({
          mint: token.mint,
          success: false,
          msg: tokenError.message
        });
      }
    }

    // Save results to a log file
    const timestamp = new Date().toISOString().replace(/[:.-]/g, "_");
    const logDir = path.join(process.cwd(), "logs");
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    fs.writeFileSync(
      path.join(logDir, `clean_tokens_${timestamp}.json`),
      JSON.stringify(results, null, 2)
    );

    console.log(`📝 Results saved to logs/clean_tokens_${timestamp}.json`);
    return { success: true, results };

  } catch (error: any) {
    console.error(`⛔ Error cleaning wallet: ${error.message}`);
    return { success: false, msg: error.message };
  }
}

// Run the script if called directly
if (require.main === module) {
  const privateKey = process.env.WALLET_PRIVATE_KEY;
  
  // Optional: Specify tokens to clean, if empty will clean all tokens
  const tokensToClean = process.argv.slice(2);
  
  if (!privateKey) {
    console.error("❌ No private key found in .env file (WALLET_PRIVATE_KEY)");
    process.exit(1);
  }
  
  cleanWalletFromTokens(privateKey, tokensToClean.length > 0 ? tokensToClean : undefined)
    .then(result => {
      console.log("Cleaning process completed:", result.success ? "✅ Success" : "❌ Failed");
      if (!result.success) {
        console.error("Error:", result.msg);
      }
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      console.error("❌ Unhandled error:", err);
      process.exit(1);
    });
}
