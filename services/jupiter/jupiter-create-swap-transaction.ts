import axios from "axios";
import { retryAxiosRequest } from "../../common/common.helpers";
import { QuoteResponse, SerializedQuoteResponse } from "./types";

/**
 * Creates the swap transaction using Jupiter API
 * @throws Error if required parameters are missing or API request fails
 */
export async function createSwapTransaction(
    botName: string, 
    tokenQuotes: QuoteResponse, 
    prioFeeMaxLamports: string, 
    prioLevel: string, 
    processRunCounter: number, 
    walletPublicKey: string
  ): Promise<SerializedQuoteResponse> {
    // Validate required parameters
    if (!botName) throw new Error('Bot name is required');
    if (!tokenQuotes) throw new Error('Token quotes are required');
    if (!walletPublicKey) throw new Error('Wallet public key is required');
    
    const swapUrl = process.env.JUP_HTTPS_SWAP_URI || "";
    if (!swapUrl) {
      console.error(`[${botName}]|[createSwapTransaction]|Missing JUP_HTTPS_SWAP_URI environment variable`, processRunCounter);
      throw new Error('Jupiter swap URL is not configured');
    }

    const body = {
      quoteResponse: tokenQuotes,
      userPublicKey: walletPublicKey,
      wrapAndUnwrapSol: true,
      dynamicSlippage: {
        maxBps: 500,
      },
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          maxLamports: Number(prioFeeMaxLamports),
          priorityLevel: prioLevel,
        },
      },
    }
    
    console.log(`[${botName}]|[createSwapTransaction]|Serializing quote into a swap transaction`, processRunCounter, {
      swapUrl,
      body,
      botName,
      processRunCounter,
      walletPublicKey
    });
    
    try {
      const swapTransaction = await retryAxiosRequest(
        () => axios.post<SerializedQuoteResponse>(
          swapUrl,
          JSON.stringify(body),
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
      
      if (!swapTransaction.data) {
        console.error(`[${botName}]|[createSwapTransaction]|Received empty response from Jupiter API`, processRunCounter);
        throw new Error('Received empty response from Jupiter API');
      }
      
      return swapTransaction.data;
    } catch (error: any) {
      const errorMessage = error?.response?.data?.message || error.message || 'Unknown error';
      const statusCode = error?.response?.status;
      
      console.error(`[${botName}]|[createSwapTransaction]|Failed to create swap transaction after retries`, processRunCounter, {
        error: errorMessage,
        statusCode,
        walletPublicKey,
        tokenInputMint: tokenQuotes?.inputMint,
        tokenOutputMint: tokenQuotes?.outputMint
      });
      
      throw new Error(`Failed to create swap transaction: ${errorMessage}`);
    }
  }
    