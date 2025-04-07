import { Connection, Keypair, VersionedTransaction, PublicKey } from "@solana/web3.js";
import { SellTransactionResult } from "../jupiter/jupiter.types";
import { createSellTransaction } from "../jupiter/jupiter-sell-transaction";
import { getTokenQuotes } from "../jupiter/jupiter-get-quotes";
import { TAGS } from "../../common/logger";

const MAX_CONFIRMATION_RETRIES = 3;
const CONFIRMATION_RETRY_DELAY = 1000; // 1 second delay between retries

export async function getTransactionConfirmation(
    botName: string, 
    txid: string, 
    connection: Connection, 
    processRunCounter: number, 
    walletPublicKey: string, 
    tokenName: string, 
    tokenAmount: string, 
    tokenMint: string, 
    prioFeeMaxLamports: string, 
    prioLevel: string, 
    privateKey: string, 
    alreadyTryExcludedDexes = false, 
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
      const quotesWithoutRoutes = await getTokenQuotes(botName, tokenMint, tokenAmount, prioFeeMaxLamports, processRunCounter, true, txid);
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