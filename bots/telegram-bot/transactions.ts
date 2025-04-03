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
import { insertHolding, selectTokenByMint, insertTransaction } from "../../db/db.holding";
import { HoldingRecord } from "../tracker-bot/tacker-bot.types";
import { retryAxiosRequest } from "../../common/common.helpers";
import { TAGS } from "../../common/utils/log-tags";
dotenv.config();


export async function createSwapTransaction(solMint: string, tokenMint: string, processRunCounter: number, privateKey: string): Promise<{ txid: string | null; walletPublicKey: string } | null> {
  const quoteUrl = process.env.JUP_HTTPS_QUOTE_URI || "";
  const swapUrl = process.env.JUP_HTTPS_SWAP_URI || "";
  const rpcUrl = process.env.HELIUS_HTTPS_URI || "";
  let quoteResponseData: QuoteResponse | null = null;
  let serializedQuoteResponseData: SerializedQuoteResponse | null = null;
  const connection = new Connection(rpcUrl);
  
  if (!privateKey) {
    console.error(`${config.name}|[createSwapTransaction]| ⛔ No private key provided`, processRunCounter);
    return null;
  }
  
  const myWallet = new Wallet(Keypair.fromSecretKey(bs58.decode(privateKey)));
  const walletPublicKey = myWallet.publicKey.toString();

   // Check if wallet has enough SOL to cover fees
   const solBalance = await connection.getBalance(myWallet.publicKey);
   const minRequiredBalance = parseInt(config.swap.amount) + config.swap.prio_fee_max_lamports + 5000 + 1000000; // prio fee + base fee + safety buffer
   if (solBalance < minRequiredBalance) {
     throw new Error(`Insufficient SOL balance for fees. Required: ${minRequiredBalance/1e9} SOL, Current: ${solBalance/1e9} SOL`);
   }

  console.log(`${config.name}|[createSwapTransaction]|Going to swap for token: ${tokenMint} with amount: ${config.swap.amount} and slippage: ${config.swap.slippageBps} for wallet: ${walletPublicKey}`, processRunCounter);

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
        console.log(`${config.name}|[createSwapTransaction]| Quote response data:`, processRunCounter, quoteResponse.data);
      }

      quoteResponseData = quoteResponse.data; // Store the successful response
      break;
    } catch (error: any) {
      // Retry when error is TOKEN_NOT_TRADABLE
      if (error.response && error.response.status === 400) {
        const errorData = error.response.data;
        if (errorData.errorCode === "TOKEN_NOT_TRADABLE") {
          retryCount++;
          console.warn(`${config.name}|[createSwapTransaction]|Token ${tokenMint} not tradable.  Retrying... ${retryCount + 1}/${config.swap.token_not_tradable_400_error_retries}`, processRunCounter);
          await new Promise((resolve) => setTimeout(resolve, config.swap.token_not_tradable_400_error_delay));
          continue; // Retry
        }
      }

      // Throw error (null) when error is not TOKEN_NOT_TRADABLE
      console.error(`${config.name}|[createSwapTransaction]| ⛔ Error while requesting a new swap quote: ${error.message}`, processRunCounter);
      if (config.verbose_log && config.verbose_log === true) {
        if (error.response) {
          // Server responded with a status other than 2xx
          console.error(`${config.name}|[createSwapTransaction]| ⛔ Error Status: ${error.response.status} - ${error.response.statusText}`, processRunCounter, error.response.data);
        } else if (error.request) {
          // Request was made but no response was received
          console.error(`${config.name}|[createSwapTransaction]| ⛔ No Response:`, processRunCounter, error.request);
        } else {
          // Other errors
          console.error(`${config.name}|[createSwapTransaction]| ⛔ Error Message:`, processRunCounter, error.message);
        }
      }
      return null;
    }
  }

  if (quoteResponseData) console.log(`${config.name}|[createSwapTransaction]| ✅ Swap quote recieved.`, processRunCounter, quoteResponseData);

  // Serialize the quote into a swap transaction that can be submitted on chain
  try {
    if (!quoteResponseData) {
      console.log(`${config.name}|[createSwapTransaction]| ⛔ No quote response data.`, processRunCounter, quoteResponseData);
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
      console.log(`${config.name}|[createSwapTransaction]| ⛔ Swap response data:`, processRunCounter, swapResponse.data);
    }

    serializedQuoteResponseData = swapResponse.data; // Store the successful response
  } catch (error: any) {
    console.error(`${config.name}|[createSwapTransaction]| ⛔ Error while sending the swap quote: ${error.message}`, processRunCounter);
    if (config.verbose_log && config.verbose_log === true) {
      console.log(`${config.name}|[createSwapTransaction]| ⛔ Verbose Error Message:`, processRunCounter);
      if (error.response) {
        // Server responded with a status other than 2xx
        console.error(`${config.name}|[createSwapTransaction]| ⛔ Error Status: ${error.response.status} Error Status Text: ${error.response.statusText}`, processRunCounter, error.response.data);
      } else if (error.request) {
        // Request was made but no response was received
        console.error(`${config.name}|[createSwapTransaction]| ⛔ No Response`, processRunCounter, error.request);
      } else {
        // Other errors
        console.error(`${config.name}|[createSwapTransaction]| ⛔ Error Message:`, processRunCounter, error.message);
      }
    }
    return null;
  }

  if (serializedQuoteResponseData) console.log(`${config.name}|[createSwapTransaction]| ✅ Swap quote serialized.`, processRunCounter);

  // deserialize, sign and send the transaction
  try {
    if (!serializedQuoteResponseData) return null;
    const swapTransactionBuf = Buffer.from(serializedQuoteResponseData.swapTransaction, "base64");
    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    // sign the transaction
    console.log(`${config.name}|[createSwapTransaction]| Signing transaction with wallet: ${myWallet.publicKey.toString()}`, processRunCounter);
    transaction.sign([myWallet.payer]);

    // get the latest block hash
    console.log(`${config.name}|[createSwapTransaction]| Getting the latest block hash`, processRunCounter);
    const latestBlockHash = await connection.getLatestBlockhash();

    // Execute the transaction
    console.log(`${config.name}|[createSwapTransaction]| Executing the transaction`, processRunCounter);
    const rawTransaction = transaction.serialize();
    const txid = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: true, // If True, This will skip transaction simulation entirely.
      maxRetries: 2,
    });

    // Return null when no tx was returned
    if (!txid) {
      console.error(`${config.name}|[createSwapTransaction]| ⛔ No id received for sent raw transaction.`, processRunCounter, txid, TAGS.no_txid.name);
      return null;
    }

    if (txid) console.log(`${config.name}|[createSwapTransaction]| ✅ Raw transaction id received.`, processRunCounter);

    // Fetch the current status of a transaction signature (processed, confirmed, finalized).
    console.log(`${config.name}|[createSwapTransaction]| Fetching the current status of a transaction signature (processed, confirmed, finalized).`, processRunCounter);
    const conf = await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: txid,
    });


    // Return null when an error occured when confirming the transaction
    if (conf.value.err || conf.value.err !== null) {
      console.log(`${config.name}|[createSwapTransaction]| ⛔ Transaction confirmation failed.`, processRunCounter);
      return null;
    }
    console.log(`${config.name}|[createSwapTransaction]| ✅ Transaction confirmed.`, processRunCounter, {txid, tokenMint: tokenMint, amount: config.swap.amount, walletPublicKey}, TAGS.buy_tx_confirmed.name);

    return txid ? { txid, walletPublicKey } : null;
  } catch (error: any) {
    console.error(`${config.name}|[createSwapTransaction]| ⛔ Error while signing and sending the transaction: ${error.message}`, processRunCounter);
    if (config.verbose_log && config.verbose_log === true) {
      console.log(`${config.name}|[createSwapTransaction]| ⛔ Verbose Error Message:`, processRunCounter);
      if (error.response) {
        // Server responded with a status other than 2xx
        console.error(`${config.name}|[createSwapTransaction]| ⛔ Error Status: ${error.response.status} Error Status Text: ${error.response.statusText}`, processRunCounter, error.response.data);
      } else if (error.request) {
        // Request was made but no response was received
        console.error(`${config.name}|[createSwapTransaction]| ⛔ No Response`, processRunCounter, error.request);
      } else {
        // Other errors
        console.error(`${config.name}|[createSwapTransaction]| ⛔ Error Message:`, processRunCounter, error.message);
      }
    }
    return null;
  }
}


export async function fetchAndSaveSwapDetails(tx: string, processRunCounter: number, walletPublicKey: string): Promise<boolean> {
  const txUrl = process.env.HELIUS_HTTPS_URI_TX || "";
  const priceUrl = process.env.JUP_HTTPS_PRICE_URI || "";
  console.log(`${config.name}|[fetchAndSaveSwapDetails]| Fetching swap details for tx: ${tx}, wallet: ${walletPublicKey}`, processRunCounter);
  
  try {
    // Set retry parameters for API requests
    const maxRetries = 10;
    
    // First API call - Get transaction details
    let txResponse = null;
    let retryCount = 0;
    
    // Retry loop for transaction details API
    while (retryCount < maxRetries) {
      try {
        console.log(`${config.name}|[fetchAndSaveSwapDetails]| Transaction details API request attempt ${retryCount + 1}/${maxRetries}`, processRunCounter);
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
        console.log(`${config.name}|[fetchAndSaveSwapDetails]| ⛔ Transaction details API request failed (Attempt ${retryCount}/${maxRetries}): ${error.message}`, processRunCounter);
        
        // If we haven't exhausted all retries, wait and try again
        if (retryCount < maxRetries) {
          const delay = Math.min(2000 * Math.pow(1.5, retryCount), 15000); // Exponential backoff with max delay of 15 seconds
          console.log(`${config.name}|[fetchAndSaveSwapDetails]| Waiting ${delay / 1000} seconds before next transaction details API request attempt...`, processRunCounter);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          // All retries failed
          console.error(`${config.name}|[fetchAndSaveSwapDetails]| ⛔ All transaction details API request attempts failed. \n${error.message} \ntx: https://solscan.io/tx/${tx}`, processRunCounter);
          return false;
        }
      }
    }
    
    // Check if we have a valid response after all retries
    if (!txResponse || !txResponse.data || txResponse.data.length === 0) {
      console.warn(`${config.name}|[fetchAndSaveSwapDetails]| ⛔ No transaction data recived from Solana Node. Check manually: http://solscan.io/tx/${tx}`, processRunCounter);
      return false;
    }

    // Safely access the event information
    const transactions: TransactionDetailsResponseArray = txResponse.data;
    if (!transactions[0]?.events?.swap || !transactions[0]?.events?.swap?.innerSwaps) {
      console.warn(`${config.name}|[fetchAndSaveSwapDetails]| ⛔ No swap details recived from Solana Node. Check manually: http://solscan.io/tx/${tx}`, processRunCounter);
      return false;
    }
    const swapTransactionData: SwapEventDetailsResponse = {
      programInfo: transactions[0]?.events?.swap?.innerSwaps[0]?.programInfo,
      tokenInputs: transactions[0]?.events?.swap?.innerSwaps[0]?.tokenInputs,
      tokenOutputs: transactions[0]?.events?.swap?.innerSwaps[transactions[0]?.events?.swap?.innerSwaps?.length - 1]?.tokenOutputs,
      fee: transactions[0]?.fee,
      slot: transactions[0]?.slot,
      timestamp: transactions[0]?.timestamp,
      description: transactions[0]?.description,
    };
    console.log(`${config.name}|[fetchAndSaveSwapDetails]| Swap transaction data:`, processRunCounter, swapTransactionData);

    // Second API call - Get latest Sol Price
    console.log(`${config.name}|[fetchAndSaveSwapDetails]| Getting latest Sol Price`, processRunCounter);
    
    // Reset retry counter for price API
    let priceResponse = null;
    retryCount = 0;
    
    // Retry loop for price API
    while (retryCount < maxRetries) {
      try {
        console.log(`${config.name}|[fetchAndSaveSwapDetails]| Price API request attempt ${retryCount + 1}/${maxRetries}`, processRunCounter);
        priceResponse = await retryAxiosRequest(
          () => axios.get<any>(priceUrl, {
            params: {
              ids: config.sol_mint,
            },
            timeout: config.tx.get_timeout,
          }),
          5, // maxRetries
          1000, // initialDelay
          processRunCounter
        );
        
        // If we got a valid response with price data, break out of the retry loop
        if (priceResponse && priceResponse.data && priceResponse.data.data && 
            priceResponse.data.data[config.sol_mint]?.price) {
          break;
        } else {
          throw new Error("Invalid price data received");
        }
      } catch (error: any) {
        retryCount++;
        console.error(`${config.name}|[fetchAndSaveSwapDetails]| ⛔ Price API request failed (Attempt ${retryCount}/${maxRetries}): ${error.message}`, processRunCounter);
        
        // If we haven't exhausted all retries, wait and try again
        if (retryCount < maxRetries) {
          const delay = Math.min(2000 * Math.pow(1.5, retryCount), 15000); // Exponential backoff with max delay of 15 seconds
          console.log(`${config.name}|[fetchAndSaveSwapDetails]| Waiting ${delay / 1000} seconds before next price API request attempt...`, processRunCounter);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          // All retries failed
          console.error(`${config.name}|[fetchAndSaveSwapDetails]| ⛔ All price API request attempts failed`, processRunCounter);
          return false;
        }
      }
    }
    
    // Check if we have a valid price response after all retries
    if (!priceResponse || !priceResponse.data || !priceResponse.data.data || 
        !priceResponse.data.data[config.sol_mint]?.price) {
      console.log(`${config.name}|[fetchAndSaveSwapDetails]| ⛔ Could not fetch latest Sol Price: No valid data received from API after ${maxRetries} attempts.`, processRunCounter);
      return false;
    }
    
    console.log(`${config.name}|[fetchAndSaveSwapDetails]| Latest Sol Price:`, processRunCounter, priceResponse.data.data[config.sol_mint]?.price);
    
    // Calculate estimated price paid in sol
    console.log(`${config.name}|[fetchAndSaveSwapDetails]| Calculating estimated price paid in sol`, processRunCounter);
    const solUsdcPrice = priceResponse.data.data[config.sol_mint]?.price;
    const solPaidUsdc = swapTransactionData.tokenInputs[0].tokenAmount * solUsdcPrice;
    const solFeePaidUsdc = (swapTransactionData.fee / 1_000_000_000) * solUsdcPrice;
    const perTokenUsdcPrice = solPaidUsdc / swapTransactionData.tokenOutputs[0].tokenAmount;

    // Get token meta data
    console.log(`${config.name}|[fetchAndSaveSwapDetails]| Caclulated Prices`, processRunCounter, {solPaidUsdc, solFeePaidUsdc, perTokenUsdcPrice});
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
      SolFeePaid: swapTransactionData.fee / 1e9,
      SolPaidUSDC: solPaidUsdc,
      SolFeePaidUSDC: solFeePaidUsdc,
      PerTokenPaidUSDC: perTokenUsdcPrice,
      Slot: swapTransactionData.slot,
      Program: swapTransactionData.programInfo ? swapTransactionData.programInfo.source : "N/A",
      BotName: config.name,
      WalletPublicKey: walletPublicKey,
      TxId: tx
    };

    await insertHolding(newHolding, processRunCounter).catch((err: any) => {
      console.log(`${config.name}|[fetchAndSaveSwapDetails]| ⛔ Insert Holding Database Error: ${err}`, processRunCounter);
      return false;
    });

    // Insert transaction record
    const transactionData = {
      Time: swapTransactionData.timestamp,
      Token: swapTransactionData.tokenOutputs[0].mint,
      TokenName: tokenName,
      TransactionType: 'BUY' as 'BUY',
      TokenAmount: swapTransactionData.tokenOutputs[0].tokenAmount,
      SolAmount: swapTransactionData.tokenInputs[0].tokenAmount,
      SolFee: swapTransactionData.fee / 1e9,
      PricePerTokenUSDC: perTokenUsdcPrice,
      TotalUSDC: solPaidUsdc,
      Slot: swapTransactionData.slot,
      Program: swapTransactionData.programInfo ? swapTransactionData.programInfo.source : "N/A",
      BotName: config.name,
      WalletPublicKey: walletPublicKey,
      TxId: tx
    };
    
    // Insert transaction into database
    await insertTransaction(transactionData, processRunCounter).catch((err: any) => {
      console.log(`${config.name}|[fetchAndSaveSwapDetails]| ⛔ Insert Transaction Database Error: ${err}`, processRunCounter);
    });

    console.log(`${config.name}|[fetchAndSaveSwapDetails]| ✅ Swap transaction details fetched and saved successfully. Going to Search Another Opportunities!`, processRunCounter, newHolding, TAGS.saved_in_holding.name);

    return true;
  } catch (error: any) {
    console.error(`${config.name}|[fetchAndSaveSwapDetails]| ⛔ Fetch and Save Swap Details Error: ${error.message}`, processRunCounter);
    return false;
  }
}