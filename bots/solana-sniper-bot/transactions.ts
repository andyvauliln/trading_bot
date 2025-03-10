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
  RugResponseExtended,
  NewTokenRecord,
} from "./types";
import { insertHolding, insertNewToken, selectTokenByMint } from "../tracker-bot/holding.db";
import { HoldingRecord } from "../tracker-bot/types";
import { TAGS } from "../utils/log-tags";
import { retryAxiosRequest } from "../utils/help-functions";

dotenv.config();

export async function fetchTransactionDetails(signature: string, processRunCounter: number): Promise<MintsDataReponse | null> {
  // Set function constants
  console.log(`[solana-sniper-bot]|[fetchTransactionDetails]| Fetching transaction details for signature: ${signature}`, processRunCounter);
  const txUrl = process.env.HELIUS_HTTPS_URI_TX || "";
  const maxRetries = config.tx.fetch_tx_max_retries;
  let retryCount = 0;

  // Add longer initial delay to allow transaction to be processed
  console.log(`[solana-sniper-bot]|[fetchTransactionDetails]| Waiting ${config.tx.fetch_tx_initial_delay / 1000} seconds for transaction to be confirmed...`, processRunCounter);
  await new Promise((resolve) => setTimeout(resolve, config.tx.fetch_tx_initial_delay));

  while (retryCount < maxRetries) {
    try {
      // Output logs
      console.log(`[solana-sniper-bot]|[fetchTransactionDetails]| Attempt ${retryCount + 1} of ${maxRetries} to fetch transaction details...`, processRunCounter);

      const response = await retryAxiosRequest(
        () => axios.post<any>(
          txUrl,
          {
            transactions: [signature],
            commitment: "finalized",
            encoding: "jsonParsed",
          },
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

      // Verify if a response was received
      if (!response.data) {
        throw new Error(`[solana-sniper-bot]|[fetchTransactionDetails]| No response data received`);
      }

      // Verify if the response was in the correct format and not empty
      if (!Array.isArray(response.data) || response.data.length === 0) {
        throw new Error(`[solana-sniper-bot]|[fetchTransactionDetails]| Response data array is empty`);
      }

      // Access the `data` property which contains the array of transactions
      const transactions: TransactionDetailsResponseArray = response.data;
      console.log(`[solana-sniper-bot]|[fetchTransactionDetails]| Transactions Data Received`, processRunCounter, transactions);

      // Verify if transaction details were found
      if (!transactions[0]) {
        throw new Error(`[solana-sniper-bot]|[fetchTransactionDetails]| Transaction not found`);
      }

      // Access the `instructions` property which contains account instructions
      console.log(`[solana-sniper-bot]|[fetchTransactionDetails]| Instructions Data Received`, processRunCounter, transactions[0].instructions);
      const instructions = transactions[0].instructions;
      if (!instructions || !Array.isArray(instructions) || instructions.length === 0) {
        throw new Error(`[solana-sniper-bot]|[fetchTransactionDetails]| No instructions found in transaction`);
      }

      // Verify and find the instructions for the correct market maker id
      const instruction = instructions.find((ix) => ix.programId === config.liquidity_pool.radiyum_program_id);
      console.log(`[solana-sniper-bot]|[fetchTransactionDetails]| Verify and find the instructions for the correct market maker id`, processRunCounter, instruction);
      if (!instruction || !instruction.accounts) {
        throw new Error(`[solana-sniper-bot]|[fetchTransactionDetails]| No market maker instruction found`);
      }
      if (!Array.isArray(instruction.accounts) || instruction.accounts.length < 10) {
        throw new Error(`[solana-sniper-bot]|[fetchTransactionDetails]| Invalid accounts array in instruction`);
      }

      // Store quote and token mints
      const accountOne = instruction.accounts[8];
      const accountTwo = instruction.accounts[9];
      console.log(`[solana-sniper-bot]|[fetchTransactionDetails]| Store quote and token mints accounts`, processRunCounter, { accountOne, accountTwo });
      
      // Verify if we received both quote and token mints
      if (!accountOne || !accountTwo) {
        throw new Error(`[solana-sniper-bot]|[fetchTransactionDetails]| Required accounts not found`);
      }

      // Set new token and SOL mint
      let solTokenAccount = "";
      let newTokenAccount = "";
      if (accountOne === config.liquidity_pool.wsol_pc_mint) {
        solTokenAccount = accountOne;
        newTokenAccount = accountTwo;
      } else {
        solTokenAccount = accountTwo;
        newTokenAccount = accountOne;
      }

      // Output logs
      console.log(`[solana-sniper-bot]|[fetchTransactionDetails]| Successfully fetched transaction details!`, processRunCounter);
      console.log(`[solana-sniper-bot]|[fetchTransactionDetails]| SOL Token Account: ${solTokenAccount}`, processRunCounter);
      console.log(`[solana-sniper-bot]|[fetchTransactionDetails]| New Token Account: ${newTokenAccount}`, processRunCounter);

      const displayData: MintsDataReponse = {
        tokenMint: newTokenAccount,
        solMint: solTokenAccount,
      };

      return displayData;
    } catch (error: any) {
      console.error(`[solana-sniper-bot]|[fetchTransactionDetails]| Attempt ${retryCount + 1} failed: ${error.message}`, processRunCounter);

      retryCount++;

      if (retryCount < maxRetries) {
        const delay = Math.min(4000 * Math.pow(1.5, retryCount), 15000);
        console.log(`[solana-sniper-bot]|[fetchTransactionDetails]| Waiting ${delay / 1000} seconds before next attempt...`, processRunCounter);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  console.log(`[solana-sniper-bot]|[fetchTransactionDetails]| All attempts to fetch transaction details failed`, processRunCounter);
  return null;
}

export async function createSwapTransaction(solMint: string, tokenMint: string, processRunCounter: number): Promise<string | null> {
  const quoteUrl = process.env.JUP_HTTPS_QUOTE_URI || "";
  const swapUrl = process.env.JUP_HTTPS_SWAP_URI || "";
  const rpcUrl = process.env.HELIUS_HTTPS_URI || "";
  let quoteResponseData: QuoteResponse | null = null;
  let serializedQuoteResponseData: SerializedQuoteResponse | null = null;
  const connection = new Connection(rpcUrl);
  const myWallet = new Wallet(Keypair.fromSecretKey(bs58.decode(process.env.PRIV_KEY_WALLET_2 || "")));

  console.log(`[solana-sniper-bot]|[createSwapTransaction]|Creating swap transaction for wallet: ${myWallet.publicKey.toString()}, tokenMint: ${tokenMint}, amount: ${config.swap.amount}, slippageBps: ${config.swap.slippageBps}`, processRunCounter);

   // Check if wallet has enough SOL to cover fees
   const solBalance = await connection.getBalance(myWallet.publicKey);
   const minRequiredBalance = config.swap.prio_fee_max_lamports + 5000 + 1000000; // prio fee + base fee + safety buffer
   if (solBalance < minRequiredBalance) {
     throw new Error(`Insufficient SOL balance for fees. Required: ${minRequiredBalance/1e9} SOL, Current: ${solBalance/1e9} SOL`);
   }


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
        console.log("[solana-sniper-bot]|[createSwapTransaction]| Quote response data:", processRunCounter, quoteResponse.data);
      }

      quoteResponseData = quoteResponse.data; // Store the successful response
      break;
    } catch (error: any) {
      // Retry when error is TOKEN_NOT_TRADABLE
      if (error.response && error.response.status === 400) {
        const errorData = error.response.data;
        if (errorData.errorCode === "TOKEN_NOT_TRADABLE") {
          console.warn(`[solana-sniper-bot]|[createSwapTransaction]|Token not tradable. Retrying...`, processRunCounter);
          retryCount++;
          await new Promise((resolve) => setTimeout(resolve, config.swap.token_not_tradable_400_error_delay));
          continue; // Retry
        }
      }

      // Throw error (null) when error is not TOKEN_NOT_TRADABLE
      console.error(`[solana-sniper-bot]|[createSwapTransaction]| ⛔ Error while requesting a new swap quote: ${error.message}`, processRunCounter);
      if (config.verbose_log && config.verbose_log === true) {
        if (error.response) {
          // Server responded with a status other than 2xx
          console.error(`[solana-sniper-bot]|[createSwapTransaction]| ⛔ Error Status: ${error.response.status} - ${error.response.statusText}`, processRunCounter, error.response.data);
        } else if (error.request) {
          // Request was made but no response was received
          console.error("[solana-sniper-bot]|[createSwapTransaction]| ⛔ No Response:", processRunCounter, error.request);
        } else {
          // Other errors
          console.error("[solana-sniper-bot]|[createSwapTransaction]| ⛔ Error Message:", processRunCounter, error.message);
        }
      }
      return null;
    }
  }

  if (quoteResponseData) console.log("[solana-sniper-bot]|[createSwapTransaction]| ✅ Swap quote recieved.", processRunCounter, quoteResponseData);

  // Serialize the quote into a swap transaction that can be submitted on chain
  try {
    if (!quoteResponseData) {
      console.error("[solana-sniper-bot]|[createSwapTransaction]| ⛔ No quote response data.", processRunCounter, quoteResponseData);
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
      console.log("[solana-sniper-bot]|[createSwapTransaction]| ⛔ Swap response data:", processRunCounter, swapResponse.data);
    }

    serializedQuoteResponseData = swapResponse.data; // Store the successful response
  } catch (error: any) {
    console.error(`[solana-sniper-bot]|[createSwapTransaction]| ⛔ Error while sending the swap quote: ${error.message}`, processRunCounter);
    if (config.verbose_log && config.verbose_log === true) {
      console.log(`[solana-sniper-bot]|[createSwapTransaction]| ⛔ Verbose Error Message:`, processRunCounter);
      if (error.response) {
        // Server responded with a status other than 2xx
        console.error(`[solana-sniper-bot]|[createSwapTransaction]| ⛔ Error Status: ${error.response.status} Error Status Text: ${error.response.statusText}`, processRunCounter, error.response.data);
      } else if (error.request) {
        // Request was made but no response was received
        console.error(`[solana-sniper-bot]|[createSwapTransaction]| ⛔ No Response`, processRunCounter, error.request);
      } else {
        // Other errors
        console.error(`[solana-sniper-bot]|[createSwapTransaction]| ⛔ Error Message:`, processRunCounter, error.message);
      }
    }
    return null;
  }

  if (serializedQuoteResponseData) {
    console.log(`[solana-sniper-bot]|[createSwapTransaction]| ✅ Swap quote serialized.`, processRunCounter);
  } else {
    console.error(`[solana-sniper-bot]|[createSwapTransaction]| ⛔ No swap quote serialized.`, processRunCounter, serializedQuoteResponseData);
    return null;
  }

  // deserialize, sign and send the transaction
  try {
    const swapTransactionBuf = Buffer.from(serializedQuoteResponseData.swapTransaction, "base64");
    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    // sign the transaction
    console.log(`[solana-sniper-bot]|[createSwapTransaction]| Signing transaction with wallet: ${myWallet.publicKey.toString()}`, processRunCounter);
    transaction.sign([myWallet.payer]);

    // get the latest block hash
    const latestBlockHash = await connection.getLatestBlockhash();
    console.log(`[solana-sniper-bot]|[createSwapTransaction]| Getting the latest block hash`, processRunCounter, latestBlockHash);

    // Execute the transaction
    console.log(`[solana-sniper-bot]|[createSwapTransaction]| Executing the transaction`, processRunCounter);
    const rawTransaction = transaction.serialize();
    const txid = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: true, // If True, This will skip transaction simulation entirely.
      maxRetries: 2,
    });

    // Return null when no tx was returned
    if (!txid) {
      console.error(`[solana-sniper-bot]|[createSwapTransaction]| ⛔ No id received for sent raw transaction.`, processRunCounter, txid, "no-txid");
      return null;
    }

    if (txid) console.log(`[solana-sniper-bot]|[createSwapTransaction]| ✅ Raw transaction id received.`, processRunCounter);

    // Fetch the current status of a transaction signature (processed, confirmed, finalized).
    console.log(`[solana-sniper-bot]|[createSwapTransaction]| Fetching the current status of a transaction signature (processed, confirmed, finalized).`, processRunCounter);
    const conf = await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: txid,
    });


    // Return null when an error occured when confirming the transaction
    if (conf.value.err || conf.value.err !== null) {
      console.error(`[solana-sniper-bot]|[createSwapTransaction]| ⛔ Transaction confirmation failed.`, processRunCounter, conf);
      return null;
    }
    console.log(`[solana-sniper-bot]|[createSwapTransaction]| ✅ Transaction confirmed.`, processRunCounter, {txid, tokenMint: tokenMint, amount: config.swap.amount}, TAGS.buy_tx_confirmed.name);

    return txid;
  } catch (error: any) {
    console.error(`[solana-sniper-bot]|[createSwapTransaction]| ⛔ Error while signing and sending the transaction: ${error.message}`, processRunCounter);
    if (config.verbose_log && config.verbose_log === true) {
      console.log(`[solana-sniper-bot]|[createSwapTransaction]| ⛔ Verbose Error Message:`, processRunCounter);
      if (error.response) {
        // Server responded with a status other than 2xx
        console.error(`[solana-sniper-bot]|[createSwapTransaction]| ⛔ Error Status: ${error.response.status} Error Status Text: ${error.response.statusText}`, processRunCounter, error.response.data);
      } else if (error.request) {
        // Request was made but no response was received
        console.error(`[solana-sniper-bot]|[createSwapTransaction]| ⛔ No Response`, processRunCounter, error.request);
      } else {
        // Other errors
        console.error(`[solana-sniper-bot]|[createSwapTransaction]| ⛔ Error Message:`, processRunCounter, error.message);
      }
    }
    return null;
  }
}

export async function getRugCheckConfirmed(token: string, processRunCounter: number): Promise<boolean> {
  try {
    console.log(`[solana-sniper-bot]|[getRugCheckConfirmed]| Getting Rug Check for token: ${token}`, processRunCounter);
    
    const rugResponse = await retryAxiosRequest(
      () => axios.get<RugResponseExtended>("https://api.rugcheck.xyz/v1/tokens/" + token + "/report", {
        timeout: 100000,
      }),
      3, // maxRetries
      1000, // initialDelay
      processRunCounter
    );
    
    // Check if we have a valid response
    if (!rugResponse || !rugResponse.data) {
      console.log(`[solana-sniper-bot]|[getRugCheckConfirmed]| ⛔ Could not fetch Rug Check: No response received from API.`, processRunCounter);
      return false;
    }
  
    if (config.verbose_log && config.verbose_log === true) {
      console.log(`[solana-sniper-bot]|[getRugCheckConfirmed]| Rug Check Response:`, processRunCounter, rugResponse.data);
    }
  
    // Extract information
    console.log(`[solana-sniper-bot]|[getRugCheckConfirmed]| Extracting information from Rug Check Response`, processRunCounter);
    const tokenReport: RugResponseExtended = rugResponse.data;
    const tokenCreator = tokenReport.creator ? tokenReport.creator : token;
    const mintAuthority = tokenReport.token.mintAuthority;
    const freezeAuthority = tokenReport.token.freezeAuthority;
    const isInitialized = tokenReport.token.isInitialized;
    const supply = tokenReport.token.supply;
    const decimals = tokenReport.token.decimals;
    const tokenName = tokenReport.tokenMeta.name;
    const tokenSymbol = tokenReport.tokenMeta.symbol;
    const tokenMutable = tokenReport.tokenMeta.mutable;
    let topHolders = tokenReport.topHolders;
    const marketsLength = tokenReport.markets ? tokenReport.markets.length : 0;
    const totalLPProviders = tokenReport.totalLPProviders;
    const totalMarketLiquidity = tokenReport.totalMarketLiquidity;
    const isRugged = tokenReport.rugged;
    const rugScore = tokenReport.score;
    const rugRisks = tokenReport.risks
      ? tokenReport.risks
      : [
          {
            name: "Good",
            value: "",
            description: "",
            score: 0,
            level: "good",
          },
        ];
  
    // Update topholders if liquidity pools are excluded
    if (config.rug_check.exclude_lp_from_topholders) {
      console.log(`[solana-sniper-bot]|[getRugCheckConfirmed]| Excluding liquidity pools from top holders`, processRunCounter);
      // local types
      type Market = {
        liquidityA?: string;
        liquidityB?: string;
      };
  
      const markets: Market[] | undefined = tokenReport.markets;
      if (markets) {
        console.log(`[solana-sniper-bot]|[getRugCheckConfirmed]| Extracting liquidity addresses from markets`, processRunCounter);
        // Safely extract liquidity addresses from markets
        const liquidityAddresses: string[] = (markets ?? [])
          .flatMap((market) => [market.liquidityA, market.liquidityB])
          .filter((address): address is string => !!address);
  
        // Filter out topHolders that match any of the liquidity addresses
        topHolders = topHolders.filter((holder) => !liquidityAddresses.includes(holder.address));
        console.log(`[solana-sniper-bot]|[getRugCheckConfirmed]| Top Holders after filtering:`, processRunCounter, topHolders);
      }
    }
  
    // Get config
    console.log(`[solana-sniper-bot]|[getRugCheckConfirmed]| Getting bot config`, processRunCounter, config);
    const rugCheckConfig = config.rug_check;
    const rugCheckLegacy = rugCheckConfig.legacy_not_allowed;
  
    // Set conditions
    console.log(`[solana-sniper-bot]|[getRugCheckConfirmed]| Setting conditions`, processRunCounter);
    const conditions = [
      {
        check: !rugCheckConfig.allow_mint_authority && mintAuthority !== null,
        message: `🚫 Mint authority should be null: Config: ${rugCheckConfig.allow_mint_authority} - Current: ${mintAuthority}`,
      },
      {
        check: !rugCheckConfig.allow_not_initialized && !isInitialized,
        message: `🚫 Token is not initialized: Config: ${rugCheckConfig.allow_not_initialized} - Current: ${isInitialized}`,
      },
      {
        check: !rugCheckConfig.allow_freeze_authority && freezeAuthority !== null,
        message: `🚫 Freeze authority should be null: Config: ${rugCheckConfig.allow_freeze_authority} - Current: ${freezeAuthority}`,
      },
      {
        check: !rugCheckConfig.allow_mutable && tokenMutable !== false,
        message: `🚫 Mutable should be false: Config: ${rugCheckConfig.allow_mutable} - Current: ${tokenMutable}`,
      },
      {
        check: !rugCheckConfig.allow_insider_topholders && topHolders.some((holder) => holder.insider),
        message: `🚫 Insider accounts should not be part of the top holders: Config: ${rugCheckConfig.allow_insider_topholders} - Current: ${topHolders.map((holder) => holder.insider).join(", ")}`,
      },
      {
        check: topHolders.some((holder) => holder.pct > rugCheckConfig.max_alowed_pct_topholders),
        message: `🚫 An individual top holder cannot hold more than the allowed percentage of the total supply: Config: ${rugCheckConfig.max_alowed_pct_topholders} - Current: ${topHolders.map((holder) => holder.pct).join(", ")}`,
      },
      {
        check: totalLPProviders < rugCheckConfig.min_total_lp_providers,
        message: `🚫 Not enough LP Providers: Config: ${rugCheckConfig.min_total_lp_providers} - Current: ${totalLPProviders}`,
      },
      {
        check: marketsLength < rugCheckConfig.min_total_markets,
        message: `🚫 Not enough Markets: Config: ${rugCheckConfig.min_total_markets} - Current: ${marketsLength}`,
      },
      {
        check: totalMarketLiquidity < rugCheckConfig.min_total_market_Liquidity,
        message: `🚫 Not enough Market Liquidity: Config: ${rugCheckConfig.min_total_market_Liquidity} - Current: ${totalMarketLiquidity}`,
      },
      {
        check: !rugCheckConfig.allow_rugged && isRugged, //true
        message: `🚫 Token is rugged: Config: ${rugCheckConfig.allow_rugged} - Current: ${isRugged}`,
      },
      {
        check: rugCheckConfig.block_symbols.includes(tokenSymbol),
        message: `🚫 Symbol is blocked: Config: ${rugCheckConfig.block_symbols} - Current: ${tokenSymbol}`,
      },
      {
        check: rugCheckConfig.block_names.includes(tokenName),
        message: `🚫 Name is blocked: Config: ${rugCheckConfig.block_names} - Current: ${tokenName}`,
      },
      {
        check: rugScore > rugCheckConfig.max_score && rugCheckConfig.max_score !== 0,
        message: `🚫 Rug score to high: Config: ${rugCheckConfig.max_score} - Current: ${rugScore}`,
      },
      {
        check: rugRisks.some((risk) => rugCheckLegacy.includes(risk.name)),
        message: `🚫 Token has legacy risks that are not allowed: Config: ${rugCheckLegacy} - Current: ${rugRisks.map((risk) => risk.name).join(", ")}`,
      },
    ];

    console.log(`[solana-sniper-bot]|[getRugCheckConfirmed]| Conditions:`, processRunCounter, conditions, TAGS.rug_validation.name);
  
    // Create new token record
    const newToken: NewTokenRecord = {
      time: Date.now(),
      mint: token,
      name: tokenName,
      creator: tokenCreator,
    };
    await insertNewToken(newToken, processRunCounter, conditions).catch((err) => {
        console.log(`[solana-sniper-bot]|[getRugCheckConfirmed]| ⛔ Unable to store new token for tracking duplicate tokens: ${err}`, processRunCounter);
    });
  
    //Validate conditions
    for (const condition of conditions) {
      if (condition.check) {
        console.log(`[solana-sniper-bot]|[getRugCheckConfirmed]| ⛔ Condition failed: ${condition.message}`, processRunCounter);
      }
    }
  
    return conditions.every((condition) => !condition.check);
  } catch (error: any) {
    console.error(`[solana-sniper-bot]|[getRugCheckConfirmed]| ⛔ Error during rug check processing: ${error.message}`, processRunCounter);
    return false;
  }
}

export async function fetchAndSaveSwapDetails(tx: string, processRunCounter: number): Promise<boolean> {
  const txUrl = process.env.HELIUS_HTTPS_URI_TX || "";
  const priceUrl = process.env.JUP_HTTPS_PRICE_URI || "";
  console.log(`[solana-sniper-bot]|[fetchAndSaveSwapDetails]| Fetching swap details for tx: ${tx}`, processRunCounter);
  
  try {
    // Set retry parameters for API requests
    const maxRetries = 5;
    
    // First API call - Get transaction details
    let txResponse = null;
    let retryCount = 0;
    
    // Retry loop for transaction details API
    while (retryCount < maxRetries) {
      try {
        console.log(`[solana-sniper-bot]|[fetchAndSaveSwapDetails]| Transaction details API request attempt ${retryCount + 1}/${maxRetries}`, processRunCounter);
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
        console.error(`[solana-sniper-bot]|[fetchAndSaveSwapDetails]| ⛔ Transaction details API request failed (Attempt ${retryCount}/${maxRetries}): ${error.message}`, processRunCounter);
        
        // If we haven't exhausted all retries, wait and try again
        if (retryCount < maxRetries) {
          const delay = Math.min(2000 * Math.pow(1.5, retryCount), 15000); // Exponential backoff with max delay of 15 seconds
          console.log(`[solana-sniper-bot]|[fetchAndSaveSwapDetails]| Waiting ${delay / 1000} seconds before next transaction details API request attempt...`, processRunCounter);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          // All retries failed
          console.error(`[solana-sniper-bot]|[fetchAndSaveSwapDetails]| ⛔ All transaction details API request attempts failed`, processRunCounter);
          return false;
        }
      }
    }
    
    // Check if we have a valid response after all retries
    if (!txResponse || !txResponse.data || txResponse.data.length === 0) {
      console.log(`[solana-sniper-bot]|[fetchAndSaveSwapDetails]| ⛔ Could not fetch swap details: No response received from API after ${maxRetries} attempts.`, processRunCounter);
      return false;
    }

    // Safely access the event information
    const transactions: TransactionDetailsResponseArray = txResponse.data;
    const swapTransactionData: SwapEventDetailsResponse = {
      programInfo: transactions[0]?.events.swap.innerSwaps[0].programInfo,
      tokenInputs: transactions[0]?.events.swap.innerSwaps[0].tokenInputs,
      tokenOutputs: transactions[0]?.events.swap.innerSwaps[transactions[0]?.events.swap.innerSwaps.length - 1].tokenOutputs,
      fee: transactions[0]?.fee,
      slot: transactions[0]?.slot,
      timestamp: transactions[0]?.timestamp,
      description: transactions[0]?.description,
    };
    console.log(`[solana-sniper-bot]|[fetchAndSaveSwapDetails]| Swap transaction data:`, processRunCounter, swapTransactionData);

    // Second API call - Get latest Sol Price
    console.log(`[solana-sniper-bot]|[fetchAndSaveSwapDetails]| Getting latest Sol Price`, processRunCounter);
    
    // Reset retry counter for price API
    let priceResponse = null;
    retryCount = 0;
    
    // Retry loop for price API
    while (retryCount < maxRetries) {
      try {
        console.log(`[solana-sniper-bot]|[fetchAndSaveSwapDetails]| Price API request attempt ${retryCount + 1}/${maxRetries}`, processRunCounter);
        priceResponse = await retryAxiosRequest(
          () => axios.get<any>(priceUrl, {
            params: {
              ids: config.liquidity_pool.wsol_pc_mint,
            },
            timeout: config.tx.get_timeout,
          }),
          5, // maxRetries
          1000, // initialDelay
          processRunCounter
        );
        
        // If we got a valid response with price data, break out of the retry loop
        if (priceResponse && priceResponse.data && priceResponse.data.data && 
            priceResponse.data.data[config.liquidity_pool.wsol_pc_mint]?.price) {
          break;
        } else {
          throw new Error("Invalid price data received");
        }
      } catch (error: any) {
        retryCount++;
        console.error(`[solana-sniper-bot]|[fetchAndSaveSwapDetails]| ⛔ Price API request failed (Attempt ${retryCount}/${maxRetries}): ${error.message}`, processRunCounter);
        
        // If we haven't exhausted all retries, wait and try again
        if (retryCount < maxRetries) {
          const delay = Math.min(2000 * Math.pow(1.5, retryCount), 15000); // Exponential backoff with max delay of 15 seconds
          console.log(`[solana-sniper-bot]|[fetchAndSaveSwapDetails]| Waiting ${delay / 1000} seconds before next price API request attempt...`, processRunCounter);
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          // All retries failed
          console.error(`[solana-sniper-bot]|[fetchAndSaveSwapDetails]| ⛔ All price API request attempts failed`, processRunCounter);
          return false;
        }
      }
    }
    
    // Check if we have a valid price response after all retries
    if (!priceResponse || !priceResponse.data || !priceResponse.data.data || 
        !priceResponse.data.data[config.liquidity_pool.wsol_pc_mint]?.price) {
      console.log(`[solana-sniper-bot]|[fetchAndSaveSwapDetails]| ⛔ Could not fetch latest Sol Price: No valid data received from API after ${maxRetries} attempts.`, processRunCounter);
      return false;
    }
    
    console.log(`[solana-sniper-bot]|[fetchAndSaveSwapDetails]| Latest Sol Price:`, processRunCounter, priceResponse.data.data[config.liquidity_pool.wsol_pc_mint]?.price);
    
    // Calculate estimated price paid in sol
    console.log(`[solana-sniper-bot]|[fetchAndSaveSwapDetails]| Calculating estimated price paid in sol`, processRunCounter);
    const solUsdcPrice = priceResponse.data.data[config.liquidity_pool.wsol_pc_mint]?.price;
    const solPaidUsdc = swapTransactionData.tokenInputs[0].tokenAmount * solUsdcPrice;
    const solFeePaidUsdc = (swapTransactionData.fee / 1_000_000_000) * solUsdcPrice;
    const perTokenUsdcPrice = solPaidUsdc / swapTransactionData.tokenOutputs[0].tokenAmount;

    // Get token meta data
    console.log(`[solana-sniper-bot]|[fetchAndSaveSwapDetails]| Caclulated Prices`, processRunCounter, {solPaidUsdc, solFeePaidUsdc, perTokenUsdcPrice});
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
      BotName: "solana-sniper-bot",
    };

    await insertHolding(newHolding, processRunCounter).catch((err: any) => {
      console.log(`[solana-sniper-bot]|[fetchAndSaveSwapDetails]| ⛔ Insert Holding Database Error: ${err}`, processRunCounter);
      return false;
    });

    console.log(`[solana-sniper-bot]|[fetchAndSaveSwapDetails]| ✅ Swap transaction details fetched and saved successfully`, processRunCounter, newHolding, "saved-in-holding");

    return true;
  } catch (error: any) {
    console.error(`[solana-sniper-bot]|[fetchAndSaveSwapDetails]| ⛔ Fetch and Save Swap Details Error: ${error.message}`, processRunCounter);
    return false;
  }
}
