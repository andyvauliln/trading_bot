import { createSwapTransaction, fetchAndSaveSwapDetails } from "./transactions";
import { config } from "./config";
import * as dotenv from 'dotenv';
import { Keypair } from "@solana/web3.js";
import { Wallet } from "@project-serum/anchor";

import bs58 from "bs58";

dotenv.config();

(async () => {
    const token = "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN";
    const processRunCounter = 1; // Add a process run counter
    if (!process.env.PRIV_KEY_WALLETS) {
        console.log("⛔ No private key found in PRIV_KEY_WALLETS environment variable.", processRunCounter);
        return;
    }
    const privateKey = process.env.PRIV_KEY_WALLETS.split(",")[0]?.trim() || "";
    const tx = await createSwapTransaction(config.sol_mint, token, processRunCounter, privateKey);
  if (!tx || typeof tx !== 'string') {
    console.log("⛔ Transaction aborted.");
    console.log("🟢 Resuming looking for new tokens...\n");
    return;
  }

  // Output logs
  console.log("🚀 Swapping SOL for Token.");
  console.log("Swap Transaction: ", "https://solscan.io/tx/" + tx);

  // Fetch and store the transaction for tracking purposes
  const myWallet = new Wallet(Keypair.fromSecretKey(bs58.decode(privateKey)));
  const walletPublicKey = myWallet.publicKey.toString();
    const saveConfirmation = await fetchAndSaveSwapDetails(tx, processRunCounter, walletPublicKey);
    if (!saveConfirmation) {
      console.log("❌ Warning: Transaction not saved for tracking! Track Manually!");
    }
})();
