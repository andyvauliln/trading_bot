import { Connection } from "@solana/web3.js";
import { parseErrorForTransaction } from '@mercurial-finance/optimist';
import { app_config_common } from "../../common/config-app";
import axios from "axios";

import { 
  QuoteRequestParams, 
  QuoteResult, 
  ExcludedDexesParams,
  TransactionWithErr
} from './types';
import { RETRY_CONFIG, API_CONFIG } from './constants';
import { delay, calculateBackoffDelay } from './utils';

export async function getTokenQuotes(
  botName: string,
  token: string,
  balance: string,
  slippageBps: string,
  processRunCounter: number,
  excludeRoutes = false,
  txid?: string
): Promise<QuoteResult> {
  const { JUPITER_QUOTE, HELIUS_RPC } = API_CONFIG.ENDPOINTS;
  let excludeDexes = new Set<string>();

  if (excludeRoutes && txid) {
    try {
      excludeDexes = await getExcludedDexes({ botName, txid, processRunCounter });
      console.log(`[${botName}]|[getTokenQuotes]|Excluding DEXes: ${Array.from(excludeDexes).join(',')}`, processRunCounter);
    } catch (error) {
      console.error(`[${botName}]|[getTokenQuotes]|Error getting excluded DEXes: ${error}`, processRunCounter);
    }
  }

  let retryCount = 0;
  const params: QuoteRequestParams = {
    inputMint: token,
    outputMint: app_config_common.liquidity_pool.wsol_pc_mint,
    amount: Math.round(Number(balance) * 1e9).toString(), //TODO: make sure all comes in normal format and don't use convert to lamports
    slippageBps,
    restrictItermediateTokens: true,
    ...(excludeDexes.size > 0 && { excludeDexes: Array.from(excludeDexes).join(',') })
  };

  while (retryCount < RETRY_CONFIG.maxRetries) {
    try {
      console.log(`[${botName}]|[getTokenQuotes]|amount ${balance} (${params.amount})`, processRunCounter, params);

      const quoteResponse = await axios.get(JUPITER_QUOTE, {
        params: {
          ...params,
          slippageBps: params.slippageBps,
          restrictItermediateTokens: params.restrictItermediateTokens.toString()
        },
        timeout: API_CONFIG.TIMEOUT.QUOTE,
      });

      if (quoteResponse.data) {
        console.log(`[${botName}]|[getTokenQuotes]|Quote received successfully`, processRunCounter, quoteResponse.data);
        return { success: true, msg: null, data: quoteResponse.data };
      }
      return { success: false, msg: "No data in response", data: null };
    } catch (error: any) {
      if (error.response?.status === 400 && error.response?.data?.errorCode === "COULD_NOT_FIND_ANY_ROUTE") {
        return { success: false, msg: error.response.data.error, data: null };
      }
      
      console.error(`[${botName}]|[getTokenQuotes]|Error fetching quote, attempt ${retryCount + 1}/${RETRY_CONFIG.maxRetries}`, processRunCounter, error);
    }

    retryCount++;
    if (retryCount < RETRY_CONFIG.maxRetries) {
      await delay(calculateBackoffDelay(retryCount, RETRY_CONFIG));
    }
  }

  const searchParams = new URLSearchParams({
    ...params,
    slippageBps: params.slippageBps.toString(),
    restrictItermediateTokens: params.restrictItermediateTokens.toString()
  } as Record<string, string>);

  const fullUrl = `${JUPITER_QUOTE}?${searchParams.toString()}`;
  console.error(`[${botName}]|[getTokenQuotes]|No valid quote received after retries`, processRunCounter, { url: fullUrl });
  return { success: false, msg: "No valid quote received after retries", data: null };
}

export async function getExcludedDexes({ botName, txid, processRunCounter }: ExcludedDexesParams): Promise<Set<string>> {
  let retryCount = 0;

  while (retryCount < RETRY_CONFIG.maxRetries) {
    try {
      console.log(`[${botName}]|[getExcludedDexes]|Attempt ${retryCount + 1}/${RETRY_CONFIG.maxRetries}`, processRunCounter);
      
      const connection = new Connection(API_CONFIG.ENDPOINTS.HELIUS_RPC);
      const transaction = await connection.getTransaction(txid, {
        maxSupportedTransactionVersion: API_CONFIG.TRANSACTION.MAX_VERSION,
        commitment: API_CONFIG.TRANSACTION.COMMITMENT
      });

      if (!transaction) {
        throw new Error("Transaction not found");
      }

      const programIdToLabelHash = await getProgramIdToLabelHash(botName, processRunCounter);
      
      const transactionWithErr = {
        ...transaction,
        err: transaction.meta?.err || null
      } as TransactionWithErr;

      const { programIds } = parseErrorForTransaction(transactionWithErr);

      return new Set(
        programIds
          ?.map(programId => programIdToLabelHash[programId])
          .filter(Boolean) || []
      );
    } catch (error) {
      retryCount++;
      console.error(`[${botName}]|[getExcludedDexes]|Error getting excluded DEXes (Attempt ${retryCount}/${RETRY_CONFIG.maxRetries})`, processRunCounter, error);
      
      if (retryCount < RETRY_CONFIG.maxRetries) {
        const delayMs = calculateBackoffDelay(retryCount, RETRY_CONFIG);
        console.log(`[${botName}]|[getExcludedDexes]|Waiting ${delayMs / 1000} seconds before next attempt...`, processRunCounter);
        await delay(delayMs);
      }
    }
  }
  
  return new Set<string>();
}

export async function getProgramIdToLabelHash(botName: string, processRunCounter: number): Promise<Record<string, string>> {
  let retryCount = 0;

  while (retryCount < RETRY_CONFIG.maxRetries) {
    try {
      console.log(`[${botName}]|[getProgramIdToLabelHash]|Attempt ${retryCount + 1}/${RETRY_CONFIG.maxRetries}`, processRunCounter);
      
      const response = await fetch(API_CONFIG.ENDPOINTS.PROGRAM_ID_TO_LABEL);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      if (data) {
        return data;
      }
      throw new Error("Invalid response data");
    } catch (error) {
      retryCount++;
      console.error(`[${botName}]|[getProgramIdToLabelHash]|Error fetching program ID labels (Attempt ${retryCount}/${RETRY_CONFIG.maxRetries})`, processRunCounter, error);
      
      if (retryCount < RETRY_CONFIG.maxRetries) {
        const delayMs = calculateBackoffDelay(retryCount, RETRY_CONFIG);
        console.log(`[${botName}]|[getProgramIdToLabelHash]|Waiting ${delayMs / 1000} seconds before next attempt...`, processRunCounter);
        await delay(delayMs);
      } else {
        throw new Error("Failed to fetch program ID labels after all retries");
      }
    }
  }
  throw new Error("Failed to fetch program ID labels after all retries");
}
  