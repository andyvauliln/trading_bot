import axios from "axios";
import { retryAxiosRequest } from "../../common/utils/help-functions";
import { QuoteResponse, SerializedQuoteResponse } from "./types";

/**
 * Creates the swap transaction using Jupiter API
 */
export async function createSwapTransaction(
    botName: string, 
    tokenQuotes: QuoteResponse, 
    prioFeeMaxLamports: string, 
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
          timeout: 3000,
        }
      ),
      3,
      500,
      processRunCounter
    );
    
    return swapTransaction.data;
  }
    