import WebSocket from "ws";
import { WebSocketRequest } from "./types";
import { config } from "./config";
import { fetchTransactionDetails, createSwapTransaction, getRugCheckConfirmed, fetchAndSaveSwapDetails } from "./transactions";
import { validateEnv } from "../utils/env-validator";

// Add startup message
console.log(`[${new Date().toISOString()}] Solana Sniper Bot Starting...`);
console.log(`[${new Date().toISOString()}] Configuration loaded:`, {
  maxConcurrent: config.tx.concurrent_transactions,
  simulationMode: config.rug_check.simulation_mode,
  ignorePumpFun: config.rug_check.ignore_pump_fun
});

// Regional Variables
let activeTransactions = 0;
const MAX_CONCURRENT = config.tx.concurrent_transactions;
let processRunCounter = 1; // Counter to track the number of process runs

// Function used to open our websocket connection
function sendSubscribeRequest(ws: WebSocket): void {
  console.log(`[solana-sniper-bot]|[sendSubscribeRequest]|MAINLOGS Sending subscribe request to websocket for radiyum program id: ${config.liquidity_pool.radiyum_program_id}`);
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
  console.log(`[solana-sniper-bot]|[processTransaction]| 🔎 New Liquidity Pool found.`, processRunCounter);

  // Fetch the transaction details
  const data = await fetchTransactionDetails(signature, processRunCounter);
  if (!data) {
    console.error(`[solana-sniper-bot]|[processTransaction]|⛔ Transaction aborted. No data returned.`, processRunCounter);
    console.log(`[solana-sniper-bot]|[processTransaction]|🟢 Resuming looking for new tokens...`, processRunCounter);
    return false;
  }

  // Ensure required data is available
  if (!data.solMint || !data.tokenMint) {
    console.error(`[solana-sniper-bot]|[processTransaction]|🚫 Invalid data received`, processRunCounter, { data });
    return false;
  }

  // Check rug check
  const isRugCheckPassed = await getRugCheckConfirmed(data.tokenMint, processRunCounter);
  if (!isRugCheckPassed) {
    console.error(`[solana-sniper-bot]|[processTransaction]|🚫 Rug Check not passed! Transaction aborted.`, processRunCounter);
    console.log(`[solana-sniper-bot]|[processTransaction]|🟢 Resuming looking for new tokens...`, processRunCounter);
    return false;
  }

  // Handle ignored tokens
  if (data.tokenMint.trim().toLowerCase().endsWith("pump") && config.rug_check.ignore_pump_fun) {
    // Check if ignored
    console.error(`[solana-sniper-bot]|[processTransaction]|🚫 Transaction skipped. Ignoring Pump.fun.`, processRunCounter);
    console.log(`[solana-sniper-bot]|[processTransaction]|🟢 Resuming looking for new tokens...`, processRunCounter);
    return false;
  }

  // Ouput logs
  console.log(`[solana-sniper-bot]|[processTransaction]|🔎 Token found`, processRunCounter);
  console.log(`[solana-sniper-bot]|[processTransaction]|👽 GMGN: https://gmgn.ai/sol/token/${data.tokenMint}`, processRunCounter);
  console.log(`[solana-sniper-bot]|[processTransaction]|😈 BullX: https://neo.bullx.io/terminal?chainId=1399811149&address=${data.tokenMint}`, processRunCounter);

  // Check if simulation mode is enabled
  if (config.rug_check.simulation_mode) {
    console.log(`[solana-sniper-bot]|[processTransaction]|👀 Token not swapped. Simulation mode is enabled.`, processRunCounter);
    console.log(`[solana-sniper-bot]|[processTransaction]|🟢 Resuming looking for new tokens...`, processRunCounter);
    return false;
  }

  // Add initial delay before first buy
  await new Promise((resolve) => setTimeout(resolve, config.tx.swap_tx_initial_delay));

  // Create Swap transaction
  const tx = await createSwapTransaction(data.solMint, data.tokenMint, processRunCounter);
  if (!tx) {
    console.error(`[solana-sniper-bot]|[processTransaction]|⛔ Transaction aborted.`, processRunCounter);
    console.log(`[solana-sniper-bot]|[processTransaction]|🟢 Resuming looking for new tokens...`, processRunCounter);
    return false;
  }

  // Output logs
  console.log(`[solana-sniper-bot]|[processTransaction]|🔗 Swap Transaction: https://solscan.io/tx/${tx}`, processRunCounter);

  // Fetch and store the transaction for tracking purposes
  const saveConfirmation = await fetchAndSaveSwapDetails(tx, processRunCounter);
  if (!saveConfirmation) {
    console.error(`[solana-sniper-bot]|[processTransaction]|❌ Warning: Transaction not saved for tracking! Track Manually!`, processRunCounter);
    return false;
  }
  return true;
}

// Websocket Handler for listening to the Solana logSubscribe method
let init = false;
async function websocketHandler(): Promise<void> {
  console.log(`[solana-sniper-bot]|[websocketHandler]|MAINLOGS APPLICATION STARTED`);
  // Load environment variables from the .env file
  const env = validateEnv();
  console.log(`[solana-sniper-bot]|[websocketHandler]|MAINLOGS Environment Variables Validated`);
  // Create a WebSocket connection
  let ws: WebSocket | null = new WebSocket(env.HELIUS_WSS_URI);
  if (!init) console.clear();

  // @TODO, test with hosting our app on a Cloud instance closer to the RPC nodes physical location for minimal latency
  // @TODO, test with different RPC and API nodes (free and paid) from quicknode and shyft to test speed

  // Send subscription to the websocket once the connection is open
  ws.on("open", () => {
    // Subscribe
    if (ws) sendSubscribeRequest(ws); // Send a request once the WebSocket is open
    console.log(`[solana-sniper-bot]|[websocketHandler]|MAINLOGS 🔓 WebSocket is open and listening.`);
    init = true;
  });
  // Logic for the message event for the .on event listener
  ws.on("message", async (data: WebSocket.Data) => {
   
    try {
      const jsonString = data.toString(); // Convert data to a string
      const parsedData = JSON.parse(jsonString); // Parse the JSON string

      // Handle subscription response
      if (parsedData.result !== undefined && !parsedData.error) {
        // console.log(`[solana-sniper-bot]|[websocketHandler]|✅ Subscription confirmed`, 0, parsedData);
        return;
      }

      // Only log RPC errors for debugging
      if (parsedData.error) {
        // console.error(`[solana-sniper-bot]|[websocketHandler]|🚫 RPC Error:`, 0, parsedData.error);
        return;
      }

      // Safely access the nested structure
      const logs = parsedData?.params?.result?.value?.logs;
      const signature = parsedData?.params?.result?.value?.signature;

      // Validate `logs` is an array and if we have a signtature
      if (!Array.isArray(logs) || !signature) {
        // console.error(`[solana-sniper-bot]|[websocketHandler]|🚫 Invalid data received`, 0, { logs, signature });
        return;
      }

      // Verify if this is a new pool creation
      // console.log(`[solana-sniper-bot]|[websocketHandler]|🔎 Verifying if this is a new pool creation`, processRunCounter);
      const containsCreate = logs.some((log: string) => typeof log === "string" && log.includes("Program log: initialize2: InitializeInstruction2"));
      if (!containsCreate || typeof signature !== "string") {
        // console.error(`[solana-sniper-bot]|[websocketHandler]|🚫 Invalid data received`, processRunCounter, { logs, signature });
        return;
      }

      // Verify if we have reached the max concurrent transactions
      console.log(`[solana-sniper-bot]|[websocketHandler]|🔎 Verifying if we have reached the max concurrent transactions`);
      if (activeTransactions >= MAX_CONCURRENT) {
        console.log(`[solana-sniper-bot]|[websocketHandler]|⏳ Max concurrent transactions reached, skipping...`);
        return;
      }

      // Add additional concurrent transaction
      activeTransactions++;

      // Process transaction asynchronously
      
      console.log(`[solana-sniper-bot]|[websocketHandler]|CYCLE_START`, processRunCounter);
      processTransaction(signature, processRunCounter)
        .then((result) => {
          console.log(`[solana-sniper-bot]|[websocketHandler]|CYCLE_END`, processRunCounter, result);
        })
        .catch((error) => {
          console.error(`[solana-sniper-bot]|[websocketHandler]|💥 Error processing transaction:`, error);
          console.log(`[solana-sniper-bot]|[websocketHandler]|CYCLE_END`, false);
        })
        .finally(() => {
          console.log(`[solana-sniper-bot]|[websocketHandler]|🔎 Decrementing active transactions`);
          activeTransactions--;
          processRunCounter++; // Increment the process run counter
          console.log(`[solana-sniper-bot]|[websocketHandler]|CYCLE_END`, false);
        });
    } catch (error) {
      console.error(`[solana-sniper-bot]|[websocketHandler]|💥 Error processing message:`, processRunCounter, {
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      });
      console.log(`[solana-sniper-bot]|[websocketHandler]|CYCLE_END`, processRunCounter, false);
    }
  });

  ws.on("error", (err: Error) => {
    console.error(`[solana-sniper-bot]|[websocketHandler]|MAINLOGS WebSocket error: ${err.message}`);
  });

  ws.on("close", () => {
    console.log(`[solana-sniper-bot]|[websocketHandler]|MAINLOGS 📴 WebSocket connection closed, cleaning up...`);
    if (ws) {
      ws.removeAllListeners();
      ws = null;
    }
    console.log(`[solana-sniper-bot]|[websocketHandler]|MAINLOGS 🔄 Attempting to reconnect in 5 seconds...`);
    setTimeout(websocketHandler, 5000);
  });
}

// Start Socket Handler
websocketHandler().catch((err) => {
  console.error(`[solana-sniper-bot]|[websocketHandler]|MAINLOGS 💥 Error starting application: ${err.message}`);
});
