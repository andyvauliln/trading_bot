import { SwapEventDetailsResponse, TransactionDetailsResponse } from "./types";

import axios from "axios";
import { retryAxiosRequest } from "../../common/utils/help-functions";

export async function getTransactionDetails(bot_name:string, tx: string, processRunCounter: number): Promise<SwapEventDetailsResponse | null> {

    const txUrl = process.env.HELIUS_HTTPS_URI_TX || "";
    console.log(`${bot_name}|[getTransactionDetails]| Fetching swap details for tx: ${tx}`, processRunCounter);
    
    try {
      const maxRetries = 5;
      let txResponse = null;
      let retryCount = 0;
      
      // Retry loop for transaction details API
      while (retryCount < maxRetries) {
        try {
          console.log(`${bot_name}|[getTransactionDetails]| Transaction details API request attempt ${retryCount + 1}/${maxRetries}`, processRunCounter);
          txResponse = await retryAxiosRequest(
            () => axios.post<any>(
              txUrl,
              { transactions: [tx] },
              {
                headers: {
                  "Content-Type": "application/json",
                },
                timeout: 10000, // Timeout for each request
              }
            ),
            5, // maxRetries
            1000, // initialDelay
            processRunCounter
          );
          
          // If we got a valid response, break out of the retry loop
          if (txResponse && txResponse.data && txResponse.data.length > 0) {
            break;
          } else {
            throw new Error("Empty response received");
          }
        } catch (error: any) {
          retryCount++;
          console.log(`${bot_name}|[getTransactionDetails]| ⛔ Transaction details API request failed (Attempt ${retryCount}/${maxRetries}): ${error.message}`, processRunCounter);
          
          // If we haven't exhausted all retries, wait and try again
          if (retryCount < maxRetries) {
            const delay = Math.min(2000 * Math.pow(1.5, retryCount), 15000); // Exponential backoff with max delay of 15 seconds
            console.log(`${bot_name}|[getTransactionDetails]| Waiting ${delay / 1000} seconds before next transaction details API request attempt...`, processRunCounter);
            await new Promise((resolve) => setTimeout(resolve, delay));
          } else {
            // All retries failed
            console.error(`${bot_name}|[getTransactionDetails]| ⛔ All transaction details API request attempts failed. \n${error.message} \ntx: https://solscan.io/tx/${tx}`, processRunCounter);
            return null;
          }
        }
      }
      
      // Check if we have a valid response after all retries
      if (!txResponse || !txResponse.data || txResponse.data.length === 0) {
        console.warn(`${bot_name}|[getTransactionDetails]| ⛔ No transaction data recived from Solana Node. Check manually: http://solscan.io/tx/${tx}`, processRunCounter);
        return null;
      }
  
      // Safely access the event information
      const transactions: TransactionDetailsResponse[] = txResponse.data;
      if (!transactions[0]?.events?.swap || !transactions[0]?.events?.swap?.innerSwaps) {
        console.warn(`${bot_name}|[getTransactionDetails]| ⛔ No swap details recived from Solana Node. Check manually: http://solscan.io/tx/${tx}`, processRunCounter);
        return null;
      }
  
      // Safely access the event information
      const swapTransactionData: SwapEventDetailsResponse = {
        programInfo: transactions[0]?.events.swap.innerSwaps[0].programInfo,
        tokenInputs: transactions[0]?.events.swap.innerSwaps[0].tokenInputs,
        tokenOutputs: transactions[0]?.events.swap.innerSwaps[transactions[0]?.events.swap.innerSwaps.length - 1].tokenOutputs,
        fee: transactions[0]?.fee / 1e9,
        slot: transactions[0]?.slot,
        timestamp: transactions[0]?.timestamp,
        description: transactions[0]?.description,
      };
  
  
      return swapTransactionData;
    } catch (error: any) {
      console.error(`${bot_name}|[getTransactionDetails]| ⛔ Get Transaction Details Error: ${error.message}`, processRunCounter);
      return null;
    }
  }