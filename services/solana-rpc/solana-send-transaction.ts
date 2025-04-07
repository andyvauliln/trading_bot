import { VersionedTransaction } from "@solana/web3.js";
import { Connection } from "@solana/web3.js";
import { Wallet } from "@project-serum/anchor";
import { SellTransactionResult, SerializedQuoteResponse } from "../jupiter/types";

export async function sendTransaction(
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
    console.log(`[${botName}]|[sendTransaction]|Sending Swap Transaction`, processRunCounter, rawTransaction);
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