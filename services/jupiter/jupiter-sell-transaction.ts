import { Connection, Keypair } from "@solana/web3.js";
import { Wallet } from "@project-serum/anchor";
import bs58 from "bs58";
import { QuoteResponse, SellTransactionResult } from "./types";
import { getTransactionConfirmation } from "../solana-rpc/solana-get-transaction-confirmation";
import { sendTransaction } from "../solana-rpc/solana-send-transaction";
import { createSwapTransaction } from "./jupiter-create-swap-transaction";
import { validateWalletBalance } from "../solana-rpc/solana-validate-wallet-balance";

/**
 * Creates and executes a sell transaction for a token
 */
export async function createSellTransaction(
  botName: string, 
  tokenQuotes: QuoteResponse, 
  tokenName: string, 
  tokenAmount: string, 
  tokenMint: string, 
  prioFeeMaxLamports: string, 
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
