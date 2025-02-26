import axios from "axios";
import { Connection, Keypair, VersionedTransaction, PublicKey } from "@solana/web3.js";
import { Wallet } from "@project-serum/anchor";
import bs58 from "bs58";
import dotenv from "dotenv";
import { config } from "./config";
import {
  TransactionDetailsResponseArray,
  MintsDataReponse,
  QuoteResponse,
  SerializedQuoteResponse,
  SwapEventDetailsResponse,
  HoldingRecord,
  NewTokenRecord,
} from "./types";
import { insertHolding, insertNewToken, removeHolding, selectTokenByMint, selectTokenByNameAndCreator } from "../tracker-bot/db";

// Load environment variables from the .env file
dotenv.config();


export async function createSwapTransaction(solMint: string, tokenMint: string): Promise<string | null> {
  const quoteUrl = process.env.JUP_HTTPS_QUOTE_URI || "";
  const swapUrl = process.env.JUP_HTTPS_SWAP_URI || "";
  const rpcUrl = process.env.HELIUS_HTTPS_URI || "";
  let quoteResponseData: QuoteResponse | null = null;
  let serializedQuoteResponseData: SerializedQuoteResponse | null = null;
  const connection = new Connection(rpcUrl);
  const myWallet = new Wallet(Keypair.fromSecretKey(bs58.decode(process.env.PRIV_KEY_WALLET_2 || "")));

  // Get Swap Quote
  let retryCount = 0;
  while (retryCount < config.swap.token_not_tradable_400_error_retries) {
    try {
      // Request a quote in order to swap SOL for new token
      const quoteResponse = await axios.get<QuoteResponse>(quoteUrl, {
        params: {
          inputMint: solMint,
          outputMint: tokenMint,
          amount: config.swap.amount,
          slippageBps: config.swap.slippageBps,
        },
        timeout: config.tx.get_timeout,
      });

      if (!quoteResponse.data) return null;

      if (config.verbose_log && config.verbose_log === true) {
        console.log("\nVerbose log:");
        console.log(quoteResponse.data);
      }

      quoteResponseData = quoteResponse.data; // Store the successful response
      break;
    } catch (error: any) {
      // Retry when error is TOKEN_NOT_TRADABLE
      if (error.response && error.response.status === 400) {
        const errorData = error.response.data;
        if (errorData.errorCode === "TOKEN_NOT_TRADABLE") {
          retryCount++;
          await new Promise((resolve) => setTimeout(resolve, config.swap.token_not_tradable_400_error_delay));
          continue; // Retry
        }
      }

      // Throw error (null) when error is not TOKEN_NOT_TRADABLE
      console.error("Error while requesting a new swap quote:", error.message);
      if (config.verbose_log && config.verbose_log === true) {
        console.log("Verbose Error Message:");
        if (error.response) {
          // Server responded with a status other than 2xx
          console.error("Error Status:", error.response.status);
          console.error("Error Status Text:", error.response.statusText);
          console.error("Error Data:", error.response.data); // API error message
          console.error("Error Headers:", error.response.headers);
        } else if (error.request) {
          // Request was made but no response was received
          console.error("No Response:", error.request);
        } else {
          // Other errors
          console.error("Error Message:", error.message);
        }
      }
      return null;
    }
  }

  if (quoteResponseData) console.log("✅ Swap quote recieved.");

  // Serialize the quote into a swap transaction that can be submitted on chain
  try {
    if (!quoteResponseData) return null;

    const swapResponse = await axios.post<SerializedQuoteResponse>(
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
    );
    if (!swapResponse.data) return null;

    if (config.verbose_log && config.verbose_log === true) {
      console.log(swapResponse.data);
    }

    serializedQuoteResponseData = swapResponse.data; // Store the successful response
  } catch (error: any) {
    console.error("Error while sending the swap quote:", error.message);
    if (config.verbose_log && config.verbose_log === true) {
      console.log("Verbose Error Message:");
      if (error.response) {
        // Server responded with a status other than 2xx
        console.error("Error Status:", error.response.status);
        console.error("Error Status Text:", error.response.statusText);
        console.error("Error Data:", error.response.data); // API error message
        console.error("Error Headers:", error.response.headers);
      } else if (error.request) {
        // Request was made but no response was received
        console.error("No Response:", error.request);
      } else {
        // Other errors
        console.error("Error Message:", error.message);
      }
    }
    return null;
  }

  if (serializedQuoteResponseData) console.log("✅ Swap quote serialized.");

  // deserialize, sign and send the transaction
  try {
    if (!serializedQuoteResponseData) return null;
    const swapTransactionBuf = Buffer.from(serializedQuoteResponseData.swapTransaction, "base64");
    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    // sign the transaction
    transaction.sign([myWallet.payer]);

    // get the latest block hash
    const latestBlockHash = await connection.getLatestBlockhash();

    // Execute the transaction
    const rawTransaction = transaction.serialize();
    const txid = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: true, // If True, This will skip transaction simulation entirely.
      maxRetries: 2,
    });

    // Return null when no tx was returned
    if (!txid) {
      console.log("🚫 No id received for sent raw transaction.");
      return null;
    }

    if (txid) console.log("✅ Raw transaction id received.");

    // Fetch the current status of a transaction signature (processed, confirmed, finalized).
    const conf = await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: txid,
    });

    if (txid) console.log("🔎 Checking transaction confirmation ...");

    // Return null when an error occured when confirming the transaction
    if (conf.value.err || conf.value.err !== null) {
      console.log("🚫 Transaction confirmation failed.");
      return null;
    }

    return txid;
  } catch (error: any) {
    console.error("Error while signing and sending the transaction:", error.message);
    if (config.verbose_log && config.verbose_log === true) {
      console.log("Verbose Error Message:");
      if (error.response) {
        // Server responded with a status other than 2xx
        console.error("Error Status:", error.response.status);
        console.error("Error Status Text:", error.response.statusText);
        console.error("Error Data:", error.response.data); // API error message
        console.error("Error Headers:", error.response.headers);
      } else if (error.request) {
        // Request was made but no response was received
        console.error("No Response:", error.request);
      } else {
        // Other errors
        console.error("Error Message:", error.message);
      }
    }
    return null;
  }
}


export async function fetchAndSaveSwapDetails(tx: string): Promise<boolean> {
  const txUrl = process.env.HELIUS_HTTPS_URI_TX || "";
  const priceUrl = process.env.JUP_HTTPS_PRICE_URI || "";

  try {
    const response = await axios.post<any>(
      txUrl,
      { transactions: [tx] },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000, // Timeout for each request
      }
    );

    // Verify if we received tx reponse data
    if (!response.data || response.data.length === 0) {
      console.log("⛔ Could not fetch swap details: No response received from API.", response);
      console.log("txUrl", txUrl);
      console.log("tx", tx);
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

    // Get latest Sol Price
    const priceResponse = await axios.get<any>(priceUrl, {
      params: {
        ids: config.sol_mint,
      },
      timeout: config.tx.get_timeout,
    });

    // Verify if we received the price response data
    if (!priceResponse.data.data[config.sol_mint]?.price) return false;

    // Calculate estimated price paid in sol
    const solUsdcPrice = priceResponse.data.data[config.sol_mint]?.price;
    const solPaidUsdc = swapTransactionData.tokenInputs[0].tokenAmount * solUsdcPrice;
    const solFeePaidUsdc = (swapTransactionData.fee / 1_000_000_000) * solUsdcPrice;
    const perTokenUsdcPrice = solPaidUsdc / swapTransactionData.tokenOutputs[0].tokenAmount;

    // Get token meta data
    let tokenName = "N/A";
    const tokenData: NewTokenRecord[] = await selectTokenByMint(swapTransactionData.tokenOutputs[0].mint);
    if (tokenData) {
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
    };

    await insertHolding(newHolding).catch((err: any) => {
      console.log("⛔ Database Error: " + err);
      return false;
    });

    return true;
  } catch (error: any) {
    console.error("Error during request:", error.message);
    return false;
  }
}