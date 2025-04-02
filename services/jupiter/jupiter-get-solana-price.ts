import axios, { AxiosResponse } from "axios";
import { app_config_common } from "../../common/config-app";
import { retryAxiosRequest } from "../../common/utils/help-functions";

type SolanaPriceResponse = {
  data: {
    [key: string]: {
      price: number;
    };
  };
};

const PRICE_CONFIG = {
  MAX_RETRIES: 5,
  INITIAL_TIMEOUT: 3000,
  MAX_BACKOFF_DELAY: 15000,
  BACKOFF_RATE: 1.5,
  BASE_DELAY: 2000,
} as const;

let lastSolanaPrice: number | null = null;

/**
 * Fetches the current Solana price from Jupiter API
 * @param botName - Name of the bot making the request
 * @param processRunCounter - Process run counter for logging
 * @returns Current Solana price or last known price if request fails
 */
export async function getSolanaPrice(botName: string, processRunCounter: number): Promise<number | null> {
  const priceUrl = process.env.JUP_HTTPS_PRICE_URI || "";
  let retryCount = 0;
  let priceResponse: AxiosResponse<SolanaPriceResponse> | null = null;

  while (retryCount < PRICE_CONFIG.MAX_RETRIES) {
    try {
      console.log(`${botName}|[getSolanaPrice]|Price API request attempt ${retryCount + 1}/${PRICE_CONFIG.MAX_RETRIES}`, processRunCounter);
      
      priceResponse = await retryAxiosRequest(
        () => axios.get<SolanaPriceResponse>(priceUrl, {
          params: { ids: app_config_common.liquidity_pool.wsol_pc_mint },
          timeout: PRICE_CONFIG.INITIAL_TIMEOUT,
        }),
        PRICE_CONFIG.MAX_RETRIES,
        PRICE_CONFIG.BASE_DELAY,
        processRunCounter
      );

      if (isValidPriceResponse(priceResponse)) {
        break;
      }
      
      throw new Error("Invalid price data received");
    } catch (error) {
      retryCount++;
      console.error(`${botName}|[getSolanaPrice]|⛔ Price API request failed (Attempt ${retryCount}/${PRICE_CONFIG.MAX_RETRIES}): ${getErrorMessage(error)}`, processRunCounter);

      if (retryCount < PRICE_CONFIG.MAX_RETRIES) {
        const delay = calculateBackoffDelay(retryCount);
        console.log(`${botName}|[getSolanaPrice]|Waiting ${delay / 1000} seconds before next price API request attempt...`, processRunCounter);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.error(`${botName}|[getSolanaPrice]|⛔ All price API request attempts failed`, processRunCounter);
        return lastSolanaPrice;
      }
    }
  }

  if (!isValidPriceResponse(priceResponse)) {
    console.error(`${botName}|[getSolanaPrice]|⛔ Could not fetch latest Sol Price: No valid data received from API after ${PRICE_CONFIG.MAX_RETRIES} attempts.`, processRunCounter);
    return lastSolanaPrice;
  }

  lastSolanaPrice = priceResponse.data.data[app_config_common.liquidity_pool.wsol_pc_mint].price;
  return lastSolanaPrice;
}

function isValidPriceResponse(response: AxiosResponse<SolanaPriceResponse> | null): response is AxiosResponse<SolanaPriceResponse> {
  return !!(
    response?.data?.data?.[app_config_common.liquidity_pool.wsol_pc_mint]?.price
  );
}

function calculateBackoffDelay(retryCount: number): number {
  return Math.min(
    PRICE_CONFIG.BASE_DELAY * Math.pow(PRICE_CONFIG.BACKOFF_RATE, retryCount),
    PRICE_CONFIG.MAX_BACKOFF_DELAY
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}