import { PublicKey } from "@solana/web3.js";
import { Connection } from "@solana/web3.js";
import { SellTransactionResult } from "../jupiter/types";

const SOL_SAFETY_BUFFER = 1000000; // 0.001 SOL in lamports
const BASE_TX_FEE = 5000; // Base transaction fee in lamports

export async function validateWalletBalance(
    botName: string, 
    balance: string, 
    prioFeeMaxLamports: string, 
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
    const minRequiredBalance = BigInt(prioFeeMaxLamports) + BigInt(BASE_TX_FEE) + BigInt(SOL_SAFETY_BUFFER);
      
    if (solBalance < minRequiredBalance) {
      console.log(`[${botName}]|[validateWalletBalance]|Wallet ${publicKey} has insufficient SOL for fees. SOL Balance: ${solBalance}, Min Required Balance: ${minRequiredBalance}, Prio Fee Max Lamports: ${prioFeeMaxLamports}, Base Tx Fee: ${BASE_TX_FEE}, SOL Safety Buffer: ${SOL_SAFETY_BUFFER}`, processRunCounter);
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