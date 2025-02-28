import axios from "axios";
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import { Wallet } from "@project-serum/anchor";
import bs58 from "bs58";
import dotenv from "dotenv";
import { config } from "./config";
import {
  TransactionDetailsResponseArray,
  QuoteResponse,
  SerializedQuoteResponse,
  SwapEventDetailsResponse,
  NewTokenRecord,
} from "./types";
import { insertHolding, selectTokenByMint } from "../tracker-bot/holding.db";
import { HoldingRecord } from "../tracker-bot/types";
import { retryAxiosRequest } from "../utils/function";
dotenv.config();


export async function createSwapTransaction(solMint: string, tokenMint: string, processRunCounter: number): Promise<string | null> {
  const quoteUrl = process.env.JUP_HTTPS_QUOTE_URI || "";
  const swapUrl = process.env.JUP_HTTPS_SWAP_URI || "";
  const rpcUrl = process.env.HELIUS_HTTPS_URI || "";
  let quoteResponseData: QuoteResponse | null = null;
  let serializedQuoteResponseData: SerializedQuoteResponse | null = null;
  const connection = new Connection(rpcUrl);
  const myWallet = new Wallet(Keypair.fromSecretKey(bs58.decode(process.env.PRIV_KEY_WALLET_2 || "")));

   // Check if wallet has enough SOL to cover fees
   const solBalance = await connection.getBalance(myWallet.publicKey);
   const minRequiredBalance = parseInt(config.swap.amount) + config.swap.prio_fee_max_lamports + 5000 + 1000000; // prio fee + base fee + safety buffer
   if (solBalance < minRequiredBalance) {
     throw new Error(`Insufficient SOL balance for fees. Required: ${minRequiredBalance/1e9} SOL, Current: ${solBalance/1e9} SOL`);
   }

  console.log(`[telegram-trading-bot]|[createSwapTransaction]|Going to swap for token: ${tokenMint} with amount: ${config.swap.amount} and slippage: ${config.swap.slippageBps} for wallet: ${myWallet.publicKey.toString()}`, processRunCounter);

  // Get Swap Quote
  let retryCount = 0;
  while (retryCount < config.swap.token_not_tradable_400_error_retries) {
    try {
      // Request a quote in order to swap SOL for new token
      const quoteResponse = await retryAxiosRequest(
        () => axios.get<QuoteResponse>(quoteUrl, {
          params: {
            inputMint: solMint,
            outputMint: tokenMint,
            amount: config.swap.amount,
            slippageBps: config.swap.slippageBps,
          },
          timeout: config.tx.get_timeout,
        }),
        3, // maxRetries
        1000, // initialDelay
        processRunCounter
      );

      if (!quoteResponse.data) return null;

      if (config.verbose_log && config.verbose_log === true) {
        console.log("[telegram-trading-bot]|[createSwapTransaction]| Quote response data:", processRunCounter, quoteResponse.data);
      }

      quoteResponseData = quoteResponse.data; // Store the successful response
      break;
    } catch (error: any) {
      // Retry when error is TOKEN_NOT_TRADABLE
      if (error.response && error.response.status === 400) {
        const errorData = error.response.data;
        if (errorData.errorCode === "TOKEN_NOT_TRADABLE") {
          console.warn(`[telegram-trading-bot]|[createSwapTransaction]|Token not tradable. Retrying...`, processRunCounter);
          retryCount++;
          await new Promise((resolve) => setTimeout(resolve, config.swap.token_not_tradable_400_error_delay));
          continue; // Retry
        }
      }

      // Throw error (null) when error is not TOKEN_NOT_TRADABLE
      console.error(`[telegram-trading-bot]|[createSwapTransaction]| ⛔ Error while requesting a new swap quote: ${error.message}`, processRunCounter);
      if (config.verbose_log && config.verbose_log === true) {
        if (error.response) {
          // Server responded with a status other than 2xx
          console.error(`[telegram-trading-bot]|[createSwapTransaction]| ⛔ Error Status: ${error.response.status} - ${error.response.statusText}`, processRunCounter, error.response.data);
        } else if (error.request) {
          // Request was made but no response was received
          console.error("[telegram-trading-bot]|[createSwapTransaction]| ⛔ No Response:", processRunCounter, error.request);
        } else {
          // Other errors
          console.error("[telegram-trading-bot]|[createSwapTransaction]| ⛔ Error Message:", processRunCounter, error.message);
        }
      }
      return null;
    }
  }

  if (quoteResponseData) console.log("[telegram-trading-bot]|[createSwapTransaction]| ✅ Swap quote recieved.", processRunCounter, quoteResponseData);

  // Serialize the quote into a swap transaction that can be submitted on chain
  try {
    if (!quoteResponseData) {
      console.log("[telegram-trading-bot]|[createSwapTransaction]| ⛔ No quote response data.", processRunCounter, quoteResponseData);
      return null;
    }

    const swapResponse = await retryAxiosRequest(
      () => axios.post<SerializedQuoteResponse>(
        swapUrl,
        JSON.stringify({
          // quoteResponse from /quote api
          quoteResponse: quoteResponseData,
          // user public key to be used for the swap
          userPublicKey: myWallet.publicKey.toString(),
          // auto wrap and unwrap SOL. default is true
          wrapAndUnwrapSol: true,
          //dynamicComputeUnitLimit: true, // allow dynamic compute limit instead of max 1,400,000
          dynamicSlippage: {
            // This will set an optimized slippage to ensure high success rate
            maxBps: 300, // Make sure to set a reasonable cap here to prevent MEV
          },
          prioritizationFeeLamports: {
            priorityLevelWithMaxLamports: {
              maxLamports: config.swap.prio_fee_max_lamports,
              priorityLevel: config.swap.prio_level,
            },
          },
        }),
        {
          headers: {
            "Content-Type": "application/json",
          },
          timeout: config.tx.get_timeout,
        }
      ),
      3, // maxRetries
      1000, // initialDelay
      processRunCounter
    );
    if (!swapResponse.data) return null;

    if (config.verbose_log && config.verbose_log === true) {
      console.log("[telegram-trading-bot]|[createSwapTransaction]| ⛔ Swap response data:", processRunCounter, swapResponse.data);
    }

    serializedQuoteResponseData = swapResponse.data; // Store the successful response
  } catch (error: any) {
    console.error(`[telegram-trading-bot]|[createSwapTransaction]| ⛔ Error while sending the swap quote: ${error.message}`, processRunCounter);
    if (config.verbose_log && config.verbose_log === true) {
      console.log(`[telegram-trading-bot]|[createSwapTransaction]| ⛔ Verbose Error Message:`, processRunCounter);
      if (error.response) {
        // Server responded with a status other than 2xx
        console.error(`[telegram-trading-bot]|[createSwapTransaction]| ⛔ Error Status: ${error.response.status} Error Status Text: ${error.response.statusText}`, processRunCounter, error.response.data);
      } else if (error.request) {
        // Request was made but no response was received
        console.error(`[telegram-trading-bot]|[createSwapTransaction]| ⛔ No Response`, processRunCounter, error.request);
      } else {
        // Other errors
        console.error(`[telegram-trading-bot]|[createSwapTransaction]| ⛔ Error Message:`, processRunCounter, error.message);
      }
    }
    return null;
  }

  if (serializedQuoteResponseData) console.log(`[telegram-trading-bot]|[createSwapTransaction]| ✅ Swap quote serialized.`, processRunCounter);

  // deserialize, sign and send the transaction
  try {
    if (!serializedQuoteResponseData) return null;
    const swapTransactionBuf = Buffer.from(serializedQuoteResponseData.swapTransaction, "base64");
    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    // sign the transaction
    console.log(`[telegram-trading-bot]|[createSwapTransaction]| Signing transaction with wallet: ${myWallet.publicKey.toString()}`, processRunCounter);
    transaction.sign([myWallet.payer]);

    // get the latest block hash
    console.log(`[telegram-trading-bot]|[createSwapTransaction]| Getting the latest block hash`, processRunCounter);
    const latestBlockHash = await connection.getLatestBlockhash();

    // Execute the transaction
    console.log(`[telegram-trading-bot]|[createSwapTransaction]| Executing the transaction`, processRunCounter);
    const rawTransaction = transaction.serialize();
    const txid = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: true, // If True, This will skip transaction simulation entirely.
      maxRetries: 2,
    });

    // Return null when no tx was returned
    if (!txid) {
      console.log(`[telegram-trading-bot]|[createSwapTransaction]| ⛔ No id received for sent raw transaction.`, processRunCounter);
      return null;
    }

    if (txid) console.log(`[telegram-trading-bot]|[createSwapTransaction]| ✅ Raw transaction id received.`, processRunCounter);

    // Fetch the current status of a transaction signature (processed, confirmed, finalized).
    console.log(`[telegram-trading-bot]|[createSwapTransaction]| Fetching the current status of a transaction signature (processed, confirmed, finalized).`, processRunCounter);
    const conf = await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: txid,
    });


    // Return null when an error occured when confirming the transaction
    if (conf.value.err || conf.value.err !== null) {
      console.log(`[telegram-trading-bot]|[createSwapTransaction]| ⛔ Transaction confirmation failed.`, processRunCounter);
      return null;
    }

    return txid;
  } catch (error: any) {
    console.error(`[telegram-trading-bot]|[createSwapTransaction]| ⛔ Error while signing and sending the transaction: ${error.message}`, processRunCounter);
    if (config.verbose_log && config.verbose_log === true) {
      console.log(`[telegram-trading-bot]|[createSwapTransaction]| ⛔ Verbose Error Message:`, processRunCounter);
      if (error.response) {
        // Server responded with a status other than 2xx
        console.error(`[telegram-trading-bot]|[createSwapTransaction]| ⛔ Error Status: ${error.response.status} Error Status Text: ${error.response.statusText}`, processRunCounter, error.response.data);
      } else if (error.request) {
        // Request was made but no response was received
        console.error(`[telegram-trading-bot]|[createSwapTransaction]| ⛔ No Response`, processRunCounter, error.request);
      } else {
        // Other errors
        console.error(`[telegram-trading-bot]|[createSwapTransaction]| ⛔ Error Message:`, processRunCounter, error.message);
      }
    }
    return null;
  }
}


export async function fetchAndSaveSwapDetails(tx: string, processRunCounter: number): Promise<boolean> {
  const txUrl = process.env.HELIUS_HTTPS_URI_TX || "";
  const priceUrl = process.env.JUP_HTTPS_PRICE_URI || "";
  const maxRetries = 3;
  const retryDelay = config.tx.retry_delay;
  let retryCount = 0;

  console.log(`[telegram-trading-bot]|[fetchAndSaveSwapDetails]| Fetching swap details for tx: ${tx}`, processRunCounter);
  
  while (retryCount < maxRetries) {
    try {
      const response = await retryAxiosRequest(
        () => axios.post<any>(
          txUrl,
          { transactions: [tx] },
          {
            headers: {
              "Content-Type": "application/json",
            },
            timeout: config.tx.get_timeout,
          }
        ),
        3, // maxRetries
        1000, // initialDelay
        processRunCounter
      );

      // Verify if we received tx response data
      if (!response.data || response.data.length === 0) {
        console.log(`[telegram-trading-bot]|[fetchAndSaveSwapDetails]| ⚠️ Empty response received. Retry ${retryCount + 1}/${maxRetries}`, processRunCounter);
        retryCount++;
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
        return false;
      }

      // Safely access the event information
      const transactions: TransactionDetailsResponseArray = response.data;
      const swapTransactionData: SwapEventDetailsResponse = {
        programInfo: transactions[0]?.events.swap.innerSwaps[0].programInfo,
        tokenInputs: transactions[0]?.events.swap.innerSwaps[0].tokenInputs,
        tokenOutputs: transactions[0]?.events.swap.innerSwaps[0].tokenOutputs,
        fee: transactions[0]?.fee,
        slot: transactions[0]?.slot,
        timestamp: transactions[0]?.timestamp,
        description: transactions[0]?.description,
      };
      console.log(`[telegram-trading-bot]|[fetchAndSaveSwapDetails]| Swap transaction data:`, processRunCounter, swapTransactionData);

      // Get latest Sol Price
      console.log(`[telegram-trading-bot]|[fetchAndSaveSwapDetails]| Getting latest Sol Price`, processRunCounter);
      const priceResponse = await retryAxiosRequest(
        () => axios.get<any>(priceUrl, {
          params: {
            ids: config.sol_mint,
          },
          timeout: config.tx.get_timeout,
        }),
        3, // maxRetries
        1000, // initialDelay
        processRunCounter
      );

      // Verify if we received the price response data
      if (!priceResponse.data.data[config.sol_mint]?.price) {
        console.log(`[telegram-trading-bot]|[fetchAndSaveSwapDetails]| ⚠️ Could not fetch latest Sol Price. Retry ${retryCount + 1}/${maxRetries}`, processRunCounter);
        retryCount++;
        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
        return false;
      }

      console.log(`[telegram-trading-bot]|[fetchAndSaveSwapDetails]| Latest Sol Price:`, processRunCounter, priceResponse.data.data[config.sol_mint]?.price);
      // Calculate estimated price paid in sol
      console.log(`[telegram-trading-bot]|[fetchAndSaveSwapDetails]| Calculating estimated price paid in sol`, processRunCounter);
      const solUsdcPrice = priceResponse.data.data[config.sol_mint]?.price;
      const solPaidUsdc = swapTransactionData.tokenInputs[0].tokenAmount * solUsdcPrice;
      const solFeePaidUsdc = (swapTransactionData.fee / 1_000_000_000) * solUsdcPrice;
      const perTokenUsdcPrice = solPaidUsdc / swapTransactionData.tokenOutputs[0].tokenAmount;

      // Get token meta data
      console.log(`[telegram-trading-bot]|[fetchAndSaveSwapDetails]| Caclulated Prices`, processRunCounter, {solPaidUsdc, solFeePaidUsdc, perTokenUsdcPrice});
      let tokenName = "N/A";
      const tokenData: NewTokenRecord[] = await selectTokenByMint(swapTransactionData.tokenOutputs[0].mint, processRunCounter);
      if (tokenData && tokenData.length > 0) {
        tokenName = tokenData[0].name;
      }

      // Add holding to db
      const newHolding: HoldingRecord = {
        Time: swapTransactionData.timestamp,
        Token: swapTransactionData.tokenOutputs[0].mint,
        TokenName: tokenName,
        Balance: swapTransactionData.tokenOutputs[0].tokenAmount,
        SolPaid: swapTransactionData.tokenInputs[0].tokenAmount,
        SolFeePaid: swapTransactionData.fee,
        SolPaidUSDC: solPaidUsdc,
        SolFeePaidUSDC: solFeePaidUsdc,
        PerTokenPaidUSDC: perTokenUsdcPrice,
        Slot: swapTransactionData.slot,
        Program: swapTransactionData.programInfo ? swapTransactionData.programInfo.source : "N/A",
        BotName: "telegram-trading-bot",
      };

      await insertHolding(newHolding, processRunCounter).catch((err: any) => {
        console.log(`[telegram-trading-bot]|[fetchAndSaveSwapDetails]| ⛔ Insert Holding Database Error: ${err}`, processRunCounter);
        return false;
      });

      return true;

    } catch (error: any) {
      console.error(`[telegram-trading-bot]|[fetchAndSaveSwapDetails]| ⚠️ Error on attempt ${retryCount + 1}/${maxRetries}: ${error.message}`, processRunCounter);
      retryCount++;
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        continue;
      }
      return false;
    }
  }
  
  return false; // Return false if all retries are exhausted
}