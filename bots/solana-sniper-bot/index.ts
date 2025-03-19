import WebSocket from "ws";
import { WebSocketRequest } from "./types";
import { config } from "./config";
import { fetchTransactionDetails, createSwapTransaction, getRugCheckConfirmed, fetchAndSaveSwapDetails } from "./transactions";
import { validateEnv } from "../utils/env-validator";
import logger from "./logger";

// Regional Variables
let activeTransactions = 0;
const MAX_CONCURRENT = config.tx.concurrent_transactions;
let processRunCounter = 1; // Counter to track the number of process runs
console.log(`${config.name}|[sendSubscribeRequest]| Sending subscribe request to websocket for radiyum program id: ${config.liquidity_pool.radiyum_program_id}`);
// Function used to open our websocket connection
function sendSubscribeRequest(ws: WebSocket): void {
  console.log(`${config.name}|[sendSubscribeRequest]| Sending subscribe request to websocket for radiyum program id: ${config.liquidity_pool.radiyum_program_id}`);
  const request: WebSocketRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "logsSubscribe",
    params: [
      {
        mentions: [config.liquidity_pool.radiyum_program_id],
      },
      {
        commitment: "processed", // Can use finalized to be more accurate.
      },
    ],
  };
  ws.send(JSON.stringify(request));
}

// Function used to handle the transaction once a new pool creation is found
async function processTransaction(signature: string, processRunCounter: number): Promise<boolean> {
  // Output logs
  console.log(`${config.name}|[processTransaction]| 🔎 New Liquidity Pool found.`, processRunCounter);

  // Fetch the transaction details
  const data = await fetchTransactionDetails(signature, processRunCounter);
  if (!data) {
    console.error(`${config.name}|[processTransaction]|⛔ Transaction aborted. No data returned.`, processRunCounter);
    console.log(`${config.name}|[processTransaction]|🟢 Resuming looking for new tokens...`, processRunCounter);
    return false;
  }

  // Ensure required data is available
  if (!data.solMint || !data.tokenMint) {
    console.error(`${config.name}|[processTransaction]|🚫 Invalid data received`, processRunCounter, data);
    return false;
  }

  // Check rug check
  if (config.rug_check.enabled) {
    const isRugCheckPassed = await getRugCheckConfirmed(data.tokenMint, processRunCounter);
    if (!isRugCheckPassed) {
      console.error(`${config.name}|[processTransaction]|🚫 Rug Check not passed! Transaction aborted.`, processRunCounter);
      console.log(`${config.name}|[processTransaction]|🟢 Resuming looking for new tokens...`, processRunCounter);
      return false;
    }
  }

  // Handle ignored tokens
  if (data.tokenMint.trim().toLowerCase().endsWith("pump") && config.rug_check.ignore_pump_fun) {
    // Check if ignored
    console.error(`${config.name}|[processTransaction]|🚫 Transaction skipped. Ignoring Pump.fun.`, processRunCounter);
    console.log(`${config.name}|[processTransaction]|🟢 Resuming looking for new tokens...`, processRunCounter);
    return false;
  }

  // Ouput logs
  console.log(`${config.name}|[processTransaction]|🔎 Token found`, processRunCounter);
  console.log(`${config.name}|[processTransaction]|👽 GMGN: https://gmgn.ai/sol/token/${data.tokenMint}`, processRunCounter);
  console.log(`${config.name}|[processTransaction]|😈 BullX: https://neo.bullx.io/terminal?chainId=1399811149&address=${data.tokenMint}`, processRunCounter);

  // Check if simulation mode is enabled
  if (config.simulation_mode) {
    console.log(`${config.name}|[processTransaction]|👀 Token not swapped. Simulation mode is enabled.`, processRunCounter);
    console.log(`${config.name}|[processTransaction]|🟢 Resuming looking for new tokens...`, processRunCounter);
    return false;
  }

  // Add initial delay before first buy
  await new Promise((resolve) => setTimeout(resolve, config.tx.swap_tx_initial_delay));

  // Get wallet private keys from environment variable
  const walletPrivateKeys = (process.env.PRIV_KEY_WALLETS || "").split(",").map(key => key.trim()).filter(key => key.length > 0);
  
  if (walletPrivateKeys.length === 0) {
    console.error(`${config.name}|[processTransaction]|⛔ No wallet private keys found in PRIV_KEY_WALLETS environment variable.`, processRunCounter);
    console.log(`${config.name}|[processTransaction]|🟢 Resuming looking for new tokens...`, processRunCounter);
    return false;
  }
  
  console.log(`${config.name}|[processTransaction]|Found ${walletPrivateKeys.length} wallets to use for transactions`, processRunCounter);
  
  let successfulTransactions = 0;
  
  // Process each wallet
  for (const privateKey of walletPrivateKeys) {
    try {
      // Create Swap transaction for this wallet
      const txResult = await createSwapTransaction(data.solMint, data.tokenMint, processRunCounter, privateKey);
      if (!txResult || !txResult.txid) {
        console.error(`${config.name}|[processTransaction]|⛔ Transaction aborted for wallet private key ${privateKey.slice(0, 4)}...`, processRunCounter);
        continue; // Try next wallet
      }

      // Output logs
      console.log(`${config.name}|[processTransaction]|🔗 Swap Transaction for wallet ${txResult.walletPublicKey}: https://solscan.io/tx/${txResult.txid}`, processRunCounter);

      // Fetch and store the transaction for tracking purposes
      const saveConfirmation = await fetchAndSaveSwapDetails(txResult.txid, processRunCounter, txResult.walletPublicKey);
      if (!saveConfirmation) {
        console.error(`${config.name}|[processTransaction]|❌ Warning: Transaction not saved for tracking for wallet ${txResult.walletPublicKey}! Track Manually!`, processRunCounter);
      } else {
        successfulTransactions++;
      }
    } catch (error: any) {
      console.error(`${config.name}|[processTransaction]|⛔ Error processing transaction for wallet: ${error.message}`, processRunCounter);
    }
  }
  
  if (successfulTransactions > 0) {
    console.log(`${config.name}|[processTransaction]|✅ Successfully processed ${successfulTransactions} out of ${walletPrivateKeys.length} transactions`, processRunCounter);
    return true;
  } else {
    console.error(`${config.name}|[processTransaction]|⛔ All transactions failed.`, processRunCounter);
    console.log(`${config.name}|[processTransaction]|🟢 Resuming looking for new tokens...`, processRunCounter);
    return false;
  }
}

// Websocket Handler for listening to the Solana logSubscribe method
let init = false;
async function websocketHandler(): Promise<void> {
  console.log(`${config.name}|[websocketHandler]|APPLICATION STARTED`);
  // Load environment variables from the .env file
  const env = validateEnv();
  console.log(`${config.name}|[websocketHandler]|Environment Variables Validated`);
  // Create a WebSocket connection
  let ws: WebSocket | null = new WebSocket(env.HELIUS_WSS_URI);
  if (!init) console.clear();

  // @TODO, test with hosting our app on a Cloud instance closer to the RPC nodes physical location for minimal latency
  // @TODO, test with different RPC and API nodes (free and paid) from quicknode and shyft to test speed

  // Send subscription to the websocket once the connection is open
  ws.on("open", () => {
    // Subscribe
    if (ws) sendSubscribeRequest(ws); // Send a request once the WebSocket is open
    console.log(`${config.name}|[websocketHandler]|🔓 WebSocket is open and listening.`);
    init = true;
  });
  // Logic for the message event for the .on event listener
  ws.on("message", async (data: WebSocket.Data) => {
   
    try {
      const jsonString = data.toString(); // Convert data to a string
      const parsedData = JSON.parse(jsonString); // Parse the JSON string

      // Handle subscription response
      if (parsedData.result !== undefined && !parsedData.error) {
        // console.log(`${config.name}|[websocketHandler]|✅ Subscription confirmed`, 0, parsedData);
        return;
      }

      // Only log RPC errors for debugging
      if (parsedData.error) {
        // console.error(`${config.name}|[websocketHandler]|🚫 RPC Error:`, 0, parsedData.error);
        return;
      }

      // Safely access the nested structure
      const logs = parsedData?.params?.result?.value?.logs;
      const signature = parsedData?.params?.result?.value?.signature;

      // Validate `logs` is an array and if we have a signtature
      if (!Array.isArray(logs) || !signature) {
        // console.error(`${config.name}|[websocketHandler]|🚫 Invalid data received`, 0, { logs, signature });
        return;
      }

      // Verify if this is a new pool creation
      // console.log(`${config.name}|[websocketHandler]|🔎 Verifying if this is a new pool creation`, processRunCounter);
      const containsCreate = logs.some((log: string) => typeof log === "string" && log.includes("Program log: initialize2: InitializeInstruction2"));
      if (!containsCreate || typeof signature !== "string") {
        // console.error(`${config.name}|[websocketHandler]|🚫 Invalid data received`, processRunCounter, { logs, signature });
        return;
      }

      // Verify if we have reached the max concurrent transactions
      console.log(`${config.name}|[websocketHandler]|🔎 Verifying if we have reached the max concurrent transactions`);
      if (activeTransactions >= MAX_CONCURRENT) {
        console.log(`${config.name}|[websocketHandler]|⏳ Max concurrent transactions reached, skipping...`);
        return;
      }

      // Add additional concurrent transaction
      activeTransactions++;

      // Process transaction asynchronously
      
      console.log(`${config.name}|[websocketHandler]|CYCLE_START`, processRunCounter);
      processTransaction(signature, processRunCounter)
        .then((result) => {
          console.log(`${config.name}|[websocketHandler]|CYCLE_END`, processRunCounter);
        })
        .catch((error) => {
          console.error(`${config.name}|[websocketHandler]|💥 Error processing transaction:`, processRunCounter, error);
          console.log(`${config.name}|[websocketHandler]|CYCLE_END`, processRunCounter);
        })
        .finally(() => {
          console.log(`${config.name}|[websocketHandler]|🔎 Decrementing active transactions`, processRunCounter);
          activeTransactions--;
          console.log(`${config.name}|[websocketHandler]|CYCLE_END`, processRunCounter);
          processRunCounter++; // Increment the process run counter
        });
    } catch (error) {
      console.error(`${config.name}|[websocketHandler]|💥 Error processing message:`, processRunCounter, {
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
      console.log(`${config.name}|[websocketHandler]|CYCLE_END`, processRunCounter);
    }
  });

  ws.on("error", (err: Error) => {
    console.error(`${config.name}|[websocketHandler]|MAINLOGS WebSocket error: ${err.message}`);
  });

  ws.on("close", () => {
    console.log(`${config.name}|[websocketHandler]|MAINLOGS 📴 WebSocket connection closed, cleaning up...`);
    if (ws) {
      ws.removeAllListeners();
      ws = null;
    }
    console.log(`${config.name}|[websocketHandler]|MAINLOGS 🔄 Attempting to reconnect in 5 seconds...`);
    setTimeout(websocketHandler, 5000);
  });
}

// Start Socket Handler
logger.init().then(() => {
  websocketHandler().catch((err) => {
    console.error(`${config.name}|[websocketHandler]|MAINLOGS 💥 Error starting application: ${err.message}`);
  });
});