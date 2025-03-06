import { createSwapTransaction, fetchAndSaveSwapDetails } from "./transactions";
import { config } from "./config";

(async () => {
    const token = "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN";
    const processRunCounter = 1; // Add a process run counter
    const tx = await createSwapTransaction(config.sol_mint, token, processRunCounter);
  if (!tx) {
    console.log("⛔ Transaction aborted.");
    console.log("🟢 Resuming looking for new tokens...\n");
    return;
  }

  // Output logs
  console.log("🚀 Swapping SOL for Token.");
  console.log("Swap Transaction: ", "https://solscan.io/tx/" + tx);

  // Fetch and store the transaction for tracking purposes
    const saveConfirmation = await fetchAndSaveSwapDetails(tx, processRunCounter);
    if (!saveConfirmation) {
      console.log("❌ Warning: Transaction not saved for tracking! Track Manually!");
    }
})();
