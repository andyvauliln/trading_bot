import axios from "axios";
import { Connection, Keypair, VersionedTransaction, PublicKey } from "@solana/web3.js";
import { Wallet } from "@project-serum/anchor";
import bs58 from "bs58";
import {app_config_common} from "../../common/config-app";
import { removeHolding } from "../../db/holding.db";
import { TAGS } from "../../common/utils/log-tags";
import { retryAxiosRequest } from "../../common/utils/help-functions";

import { BotConfig } from "../../db/config.db";
import { SerializedQuoteResponse } from "../../bots/tracker-bot/types";
import { QuoteResponse, SellTransactionResult } from "./types";
import { getTokenQuotes } from "./jupiter-get-quotes";
import { BlockhashWithExpiryBlockHeight } from "@solana/web3.js";

const SOL_SAFETY_BUFFER = 1000000; // 0.001 SOL in lamports
const BASE_TX_FEE = 5000; // Base transaction fee in lamports
const CONFIRMATION_RETRY_DELAY = 1000; // 1 second delay between retries
const MAX_CONFIRMATION_RETRIES = 3;
const DEFAULT_TIMEOUT = 3000;

/**
 * Creates and executes a sell transaction for a token
 */
export async function createSellTransaction(
  botName: string, 
  tokenQuotes: QuoteResponse, 
  tokenName: string, 
  tokenAmount: string, 
  tokenMint: string, 
  prioFeeMaxLamports: number, 
  prioLevel: string, 
  processRunCounter: number, 
  privateKey: string, 
  alreadyTryExcludedDexes = false
): Promise<SellTransactionResult> {
   
  const rpcUrl = process.env.HELIUS_HTTPS_URI || "";
  const connection = new Connection(rpcUrl);
  const myWallet = new Wallet(Keypair.fromSecretKey(bs58.decode(privateKey)));
  const walletPublicKey = myWallet.publicKey.toString();

  console.log(`[${botName}]|[createSellTransaction]|Creating Sell Transaction for Wallet ${walletPublicKey} with token ${tokenName} and amount ${tokenAmount}`, processRunCounter);
   
  try {
    const validationResult = await validateWalletBalance(
      botName, 
      tokenAmount, 
      prioFeeMaxLamports, 
      connection, 
      tokenMint, 
      processRunCounter, 
      myWallet.publicKey, 
      privateKey
    );
      
    if (!validationResult.success) {
      return validationResult;
    }
     
    const swapTransaction = await createSwapTransaction(
      botName, 
      tokenQuotes, 
      prioFeeMaxLamports, 
      prioLevel, 
      processRunCounter, 
      walletPublicKey
    );
     
    if (!swapTransaction) {
      return { 
        success: false, 
        msg: "No valid swap transaction received", 
        tx: null, 
        walletPublicKey 
      };
    }
    
    const txResult = await sendTransaction(
      botName, 
      swapTransaction, 
      processRunCounter, 
      myWallet, 
      connection
    );
      
    if (!txResult.success || !txResult.tx) {
      return txResult;
    }
        
    return await getTransactionConfirmation(
      botName, 
      txResult.tx, 
      connection, 
      processRunCounter, 
      walletPublicKey, 
      tokenName, 
      tokenAmount, 
      tokenMint, 
      prioFeeMaxLamports, 
      prioLevel, 
      privateKey, 
      alreadyTryExcludedDexes, 
      tokenAmount
    );
  } catch (error: any) {
    console.log(`[${botName}]|[createSellTransaction]|Error make sell transaction for token ${tokenName} from wallet: ${JSON.stringify({error}, null, 2)}`, processRunCounter);
    return {
      success: false,
      msg: error.message,
      tx: null,
      walletPublicKey: ""
    };
  }
}

/**
 * Sends the transaction to the network
 */
async function sendTransaction(
  botName: string, 
  swapTransaction: SerializedQuoteResponse, 
  processRunCounter: number, 
  myWallet: Wallet, 
  connection: Connection
): Promise<SellTransactionResult> {
  // Deserialize the transaction
  console.log(`[${botName}]|[sendTransaction]|Deserializing Swap Transaction`, processRunCounter);
  const swapTransactionBuf = Buffer.from(swapTransaction.swapTransaction, "base64");
  const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

  // Sign the transaction
  console.log(`[${botName}]|[sendTransaction]|Signing Swap Transaction`, processRunCounter);
  transaction.sign([myWallet.payer]);

  // Execute the transaction
  const rawTransaction = transaction.serialize();
  console.log(`[${botName}]|[sendTransaction]|Sending Swap Transaction`, processRunCounter);
  const txid = await connection.sendRawTransaction(rawTransaction, {
    skipPreflight: true,
    maxRetries: 2,
  });

  if (!txid) {
    return { 
      success: false, 
      msg: "Could not send transaction", 
      tx: null, 
      walletPublicKey: myWallet.publicKey.toString() 
    };
  }

  return { 
    success: true, 
    msg: null, 
    tx: txid, 
    walletPublicKey: myWallet.publicKey.toString() 
  };
}

/**
 * Creates the swap transaction using Jupiter API
 */
async function createSwapTransaction(
  botName: string, 
  tokenQuotes: QuoteResponse, 
  prioFeeMaxLamports: number, 
  prioLevel: string, 
  processRunCounter: number, 
  walletPublicKey: string
): Promise<SerializedQuoteResponse> {
  const swapUrl = process.env.JUP_HTTPS_SWAP_URI || "";
  
  console.log(`[${botName}]|[createSwapTransaction]|Serializing quote into a swap transaction`, processRunCounter);
  
  const swapTransaction = await retryAxiosRequest(
    () => axios.post<SerializedQuoteResponse>(
      swapUrl,
      JSON.stringify({
        quoteResponse: tokenQuotes,
        userPublicKey: walletPublicKey,
        wrapAndUnwrapSol: true,
        dynamicSlippage: {
          maxBps: 500,
        },
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: {
            maxLamports: prioFeeMaxLamports,
            priorityLevel: prioLevel,
          },
        },
      }),
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: DEFAULT_TIMEOUT,
      }
    ),
    3,
    500,
    processRunCounter
  );
  
  return swapTransaction.data;
}
  
/**
 * Confirms the transaction and handles retries
 */
async function getTransactionConfirmation(
  botName: string, 
  txid: string, 
  connection: Connection, 
  processRunCounter: number, 
  walletPublicKey: string, 
  tokenName: string, 
  tokenAmount: string, 
  tokenMint: string, 
  prioFeeMaxLamports: number, 
  prioLevel: string, 
  privateKey: string, 
  alreadyTryExcludedDexes = false, 
  amountToSell: string
): Promise<SellTransactionResult> {
  let conf;
  let retryCount = 0;
  const latestBlockHash = await connection.getLatestBlockhash();
  
  console.log(`[${botName}]|[getTransactionConfirmation]|Latest Block Hash`, processRunCounter, latestBlockHash);
  console.log(`[${botName}]|[getTransactionConfirmation]|Confirming Transaction with retries`, processRunCounter);
      
  while (retryCount < MAX_CONFIRMATION_RETRIES) {
    try {
      conf = await connection.confirmTransaction({
        blockhash: latestBlockHash.blockhash,
        lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
        signature: txid,
      });
  
      if (conf.value.err === null) {
        // Transaction confirmed successfully
        break;
      }
  
      // Error occurred, retry if possible
      retryCount++;
      if (retryCount < MAX_CONFIRMATION_RETRIES) {
        console.log(`[${botName}]|[getTransactionConfirmation]|Retrying confirmation (attempt ${retryCount + 1}/${MAX_CONFIRMATION_RETRIES})`, processRunCounter);
        await new Promise(resolve => setTimeout(resolve, CONFIRMATION_RETRY_DELAY));
      }
    } catch (error) {
      console.log(`[${botName}]|[getTransactionConfirmation]|Error confirming transaction (attempt ${retryCount + 1}/${MAX_CONFIRMATION_RETRIES}):`, error);
      retryCount++;
      if (retryCount < MAX_CONFIRMATION_RETRIES) {
        console.log(`[${botName}]|[getTransactionConfirmation]|Retrying confirmation after error (attempt ${retryCount + 1}/${MAX_CONFIRMATION_RETRIES})`, processRunCounter);
        await new Promise(resolve => setTimeout(resolve, CONFIRMATION_RETRY_DELAY));
      }
    }
  }
  
  // Check if transaction failed after all retries
  if (!conf || conf.value.err) {
    console.log(`[${botName}]|[getTransactionConfirmation]|Error confirming transaction after ${MAX_CONFIRMATION_RETRIES} retries: https://solscan.io/tx/${txid}\n${JSON.stringify(conf?.value.err, null, 2)}`, processRunCounter);
    
    // Try without excluded DEXes if we haven't already
    if (alreadyTryExcludedDexes) {
      return { 
        success: false, 
        msg: `Transaction not confirmed after ${MAX_CONFIRMATION_RETRIES} attempts: ${JSON.stringify(conf?.value.err, null, 2)}`, 
        tx: null, 
        walletPublicKey 
      };
    }
    
    // Try again with excluded DEXes
    const quotesWithoutRoutes = await getTokenQuotes(botName, tokenMint, tokenAmount, 500, processRunCounter, true, txid);
    if (quotesWithoutRoutes.success && quotesWithoutRoutes.data) {
      const result = await createSellTransaction(
        botName, 
        quotesWithoutRoutes.data, 
        tokenName, 
        tokenAmount, 
        tokenMint, 
        prioFeeMaxLamports, 
        prioLevel, 
        processRunCounter, 
        privateKey, 
        true
      );
      if (result.success) {
        return result;
      }
    }
    
    return { 
      success: false, 
      msg: `Transaction not confirmed after ${MAX_CONFIRMATION_RETRIES} attempts: ${JSON.stringify(conf?.value.err, null, 2)}`, 
      tx: null, 
      walletPublicKey 
    };
  }
  
  // Transaction confirmed successfully
  console.log(`[${botName}]|[getTransactionConfirmation]|✅ Sell Transaction Confirmed for Token ${tokenName} https://solscan.io/tx/${txid}`, processRunCounter, {txid, tokenName, conf}, TAGS.sell_tx_confirmed.name);
  
  // Double check for errors
  if (conf && conf.value.err) {
    return { 
      success: false, 
      msg: "Transaction failed to confirm", 
      tx: null, 
      walletPublicKey 
    };
  }
      
  return {
    success: true, 
    msg: "Transaction successfully completed", 
    tx: txid, 
    walletPublicKey
  };   
}

/**
 * Validates that the wallet has sufficient token balance and SOL for fees
 */
async function validateWalletBalance(
  botName: string, 
  balance: string, 
  prioFeeMaxLamports: number, 
  connection: Connection, 
  mint: string, 
  processRunCounter: number, 
  publicKey: PublicKey, 
  privateKey: string
): Promise<SellTransactionResult> {
  if (!privateKey) {
    console.error(`[${botName}]|[validateWalletBalance]|⛔ No private key provided`, processRunCounter);
    return { 
      success: false, 
      msg: "No private key provided", 
      tx: null, 
      walletPublicKey: "" 
    };
  }
  
  // Check token balance using RPC connection
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
    mint: new PublicKey(mint),
  });

  // Check if token exists in wallet with non-zero balance
  const totalBalance = tokenAccounts.value.reduce((sum, account) => {
    const tokenAmount = account.account.data.parsed.info.tokenAmount.amount;
    return sum + BigInt(tokenAmount);
  }, BigInt(0));

  // Skip this wallet if it doesn't have the token balance
  if (totalBalance <= 0n) {
    console.warn(`[${botName}]|[validateWalletBalance]|Wallet ${publicKey} has no balance for token ${mint}. Balance: ${totalBalance}`, processRunCounter);
    return { 
      success: false, 
      msg: "No token balance", 
      tx: null, 
      walletPublicKey: publicKey.toString() 
    };
  }

  // Get token decimals and convert amounts properly
  const tokenDecimals = tokenAccounts.value[0]?.account.data.parsed.info.tokenAmount.decimals || 9;
        
  // Convert totalBalance to human readable format for comparison
  const totalBalanceHuman = Number(totalBalance) / Math.pow(10, tokenDecimals);
  const holdingBalanceHuman = Number(balance);

  // Verify amount with tokenBalance using human readable format
  if (totalBalanceHuman < holdingBalanceHuman) {
    console.log(`[${botName}]|[validateWalletBalance]|Wallet ${publicKey} has insufficient balance (${totalBalanceHuman} tokens) for requested amount (${holdingBalanceHuman} tokens)`, processRunCounter);
    return { 
      success: false, 
      msg: "Insufficient token balance", 
      tx: null, 
      walletPublicKey: publicKey.toString() 
    };
  }

  // Check if wallet has enough SOL to cover fees
  const solBalance = await connection.getBalance(publicKey);
  const minRequiredBalance = prioFeeMaxLamports + BASE_TX_FEE + SOL_SAFETY_BUFFER;
    
  if (solBalance < minRequiredBalance) {
    console.log(`[${botName}]|[validateWalletBalance]|Wallet ${publicKey} has insufficient SOL for fees`, processRunCounter);
    return { 
      success: false, 
      msg: "Insufficient SOL for fees", 
      tx: null, 
      walletPublicKey: publicKey.toString() 
    };
  }

  return { 
    success: true, 
    msg: null, 
    tx: null, 
    walletPublicKey: publicKey.toString() 
  };
}