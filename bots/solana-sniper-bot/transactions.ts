import axios from "axios";
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
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
import { insertHolding, insertNewToken, selectTokenByMint, insertTransaction } from "../tracker-bot/holding.db";
import { HoldingRecord } from "../tracker-bot/types";
import { TAGS } from "../utils/log-tags";
import { retryAxiosRequest } from "../utils/help-functions";

dotenv.config();

export async function fetchTransactionDetails(signature: string, processRunCounter: number): Promise<MintsDataReponse | null> {
  // Set function constants
  console.log(`${config.name}|[fetchTransactionDetails]| Fetching transaction details for signature: ${signature}`, processRunCounter);
  const txUrl = process.env.HELIUS_HTTPS_URI_TX || "";
  const maxRetries = config.tx.fetch_tx_max_retries;
  let retryCount = 0;

  // Add longer initial delay to allow transaction to be processed
  console.log(`${config.name}|[fetchTransactionDetails]| Waiting ${config.tx.fetch_tx_initial_delay / 1000} seconds for transaction to be confirmed...`, processRunCounter);
  await new Promise((resolve) => setTimeout(resolve, config.tx.fetch_tx_initial_delay));
  let txLastError = "";
  let response: any = null;
  while (retryCount < maxRetries) {
    try {
      // Output logs
      console.log(`${config.name}|[fetchTransactionDetails]| Attempt ${retryCount + 1} of ${maxRetries} to fetch transaction details...`, processRunCounter);

        response = await retryAxiosRequest(
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
        throw new Error(`${config.name}|[fetchTransactionDetails]| No response data received`);
      }

      // Verify if the response was in the correct format and not empty
      if (!Array.isArray(response.data) || response.data.length === 0) {
        throw new Error(`${config.name}|[fetchTransactionDetails]| Response data array is empty`);
      }

      // Access the `data` property which contains the array of transactions
      const transactions: TransactionDetailsResponseArray = response.data;
      console.log(`${config.name}|[fetchTransactionDetails]| Transactions Data Received`, processRunCounter, transactions);

      // Verify if transaction details were found
      if (!transactions[0]) {
        throw new Error(`${config.name}|[fetchTransactionDetails]| Transaction not found`);
      }

      // Access the `instructions` property which contains account instructions
      console.log(`${config.name}|[fetchTransactionDetails]| Instructions Data Received`, processRunCounter, transactions[0].instructions);
      const instructions = transactions[0].instructions;
      if (!instructions || !Array.isArray(instructions) || instructions.length === 0) {
        throw new Error(`${config.name}|[fetchTransactionDetails]| No instructions found in transaction`);
      }

      // Verify and find the instructions for the correct market maker id
      const instruction = instructions.find((ix) => ix.programId === config.liquidity_pool.radiyum_program_id);
      console.log(`${config.name}|[fetchTransactionDetails]| Verify and find the instructions for the correct market maker id`, processRunCounter, instruction);
      if (!instruction || !instruction.accounts) {
        throw new Error(`${config.name}|[fetchTransactionDetails]| No market maker instruction found`);
      }
      if (!Array.isArray(instruction.accounts) || instruction.accounts.length < 10) {
        throw new Error(`${config.name}|[fetchTransactionDetails]| Invalid accounts array in instruction`);
      }

      // Store quote and token mints
      const accountOne = instruction.accounts[8];
      const accountTwo = instruction.accounts[9];
      console.log(`${config.name}|[fetchTransactionDetails]| Store quote and token mints accounts`, processRunCounter, { accountOne, accountTwo });
      
      // Verify if we received both quote and token mints
      if (!accountOne || !accountTwo) {
        throw new Error(`${config.name}|[fetchTransactionDetails]| Required accounts not found`);
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
      console.log(`${config.name}|[fetchTransactionDetails]| Successfully fetched transaction details!`, processRunCounter);
      console.log(`${config.name}|[fetchTransactionDetails]| SOL Token Account: ${solTokenAccount}`, processRunCounter);
      console.log(`${config.name}|[fetchTransactionDetails]| New Token Account: ${newTokenAccount}`, processRunCounter);

      const displayData: MintsDataReponse = {
        tokenMint: newTokenAccount,
        solMint: solTokenAccount,
      };

      return displayData;
    } catch (error: any) {
      txLastError = error.message;
      console.log(`${config.name}|[fetchTransactionDetails]| Attempt ${retryCount + 1} failed: ${error.message}`, processRunCounter);

      retryCount++;

      if (retryCount < maxRetries) {
        const delay = Math.min(4000 * Math.pow(1.5, retryCount), 15000);
        console.log(`${config.name}|[fetchTransactionDetails]| Waiting ${delay / 1000} seconds before next attempt...`, processRunCounter);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  console.error(`${config.name}|[fetchTransactionDetails]| All attempts to fetch transaction details failed: ${txLastError}`, processRunCounter, response);
  return null;
}

export async function createSwapTransaction(solMint: string, tokenMint: string, processRunCounter: number, privateKey: string): Promise<{ txid: string | null; walletPublicKey: string } | null> {
  const quoteUrl = process.env.JUP_HTTPS_QUOTE_URI || "";
  const swapUrl = process.env.JUP_HTTPS_SWAP_URI || "";
  const rpcUrl = process.env.HELIUS_HTTPS_URI || "";
  let quoteResponseData: QuoteResponse | null = null;
  let serializedQuoteResponseData: SerializedQuoteResponse | null = null;
  const connection = new Connection(rpcUrl);
  
  // Use provided private key or fallback to environment variable
  if (!privateKey) {
    console.error(`${config.name}|[createSwapTransaction]| ⛔ No private key provided`, processRunCounter);
    return null;
  }
  
  const myWallet = new Wallet(Keypair.fromSecretKey(bs58.decode(privateKey)));
  const walletPublicKey = myWallet.publicKey.toString();

  console.log(`${config.name}|[createSwapTransaction]|Creating swap transaction for wallet: ${walletPublicKey}, tokenMint: ${tokenMint}, amount: ${config.swap.amount}, slippageBps: ${config.swap.slippageBps}`, processRunCounter);

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
        console.log(`${config.name}|[createSwapTransaction]| Quote response data:`, processRunCounter, quoteResponse.data);
      }

      quoteResponseData = quoteResponse.data; // Store the successful response
      break;
    } catch (error: any) {
      // Retry when error is TOKEN_NOT_TRADABLE
      if (error.response && error.response.status === 400) {
        const errorData = error.response.data;
        if (errorData.errorCode === "TOKEN_NOT_TRADABLE") {
          console.warn(`${config.name}|[createSwapTransaction]|Token not tradable. Retrying...`, processRunCounter);
          retryCount++;
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
      console.error(`${config.name}|[createSwapTransaction]| ⛔ No quote response data.`, processRunCounter, quoteResponseData);
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

  if (serializedQuoteResponseData) {
    console.log(`${config.name}|[createSwapTransaction]| ✅ Swap quote serialized.`, processRunCounter);
  } else {
    console.error(`${config.name}|[createSwapTransaction]| ⛔ No swap quote serialized.`, processRunCounter, serializedQuoteResponseData);
    return null;
  }

  // deserialize, sign and send the transaction
  try {
    const swapTransactionBuf = Buffer.from(serializedQuoteResponseData.swapTransaction, "base64");
    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    // sign the transaction
    console.log(`${config.name}|[createSwapTransaction]| Signing transaction with wallet: ${myWallet.publicKey.toString()}`, processRunCounter);
    transaction.sign([myWallet.payer]);

    // get the latest block hash
    const latestBlockHash = await connection.getLatestBlockhash();
    console.log(`${config.name}|[createSwapTransaction]| Getting the latest block hash`, processRunCounter, latestBlockHash);

    // Execute the transaction
    console.log(`${config.name}|[createSwapTransaction]| Executing the transaction`, processRunCounter);
    const rawTransaction = transaction.serialize();
    const txid = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: true, // If True, This will skip transaction simulation entirely.
      maxRetries: 3,
    });

    // Return null when no tx was returned
    if (!txid) {
      console.error(`${config.name}|[createSwapTransaction]| ⛔ No id received for sent raw transaction.`, processRunCounter, txid, TAGS.no_txid.name);
      return null;
    }

    if (txid) console.log(`${config.name}|[createSwapTransaction]| ✅ Raw transaction id received.`, processRunCounter, txid);

    // Fetch the current status of a transaction signature (processed, confirmed, finalized).
    console.log(`${config.name}|[createSwapTransaction]| Fetching the current status of a transaction signature (processed, confirmed, finalized).`, processRunCounter);
    
    // Add retry mechanism for transaction confirmation
    const maxConfirmRetries = 3;
    let confirmRetryCount = 0;
    let conf = null;
    
    while (confirmRetryCount < maxConfirmRetries) {
      try {
        console.log(`${config.name}|[createSwapTransaction]| Confirmation attempt ${confirmRetryCount + 1}/${maxConfirmRetries}`, processRunCounter);
        
        conf = await connection.confirmTransaction({
          blockhash: latestBlockHash.blockhash,
          lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
          signature: txid,
        });
        
        // Check if there's an error in confirmation
        if (!conf.value.err) {
          // No error - confirmation successful
          break;
        }
        
        // If there's an error, log it but continue with retries
        console.log(`${config.name}|[createSwapTransaction]| ⚠️ Confirmation attempt ${confirmRetryCount + 1}/${maxConfirmRetries} failed, retrying...`, processRunCounter);
        
        // Increment retry counter
        confirmRetryCount++;
        
        // If we haven't exhausted all retries, wait with exponential backoff
        if (confirmRetryCount < maxConfirmRetries) {
          const delay = Math.min(1000 * Math.pow(2, confirmRetryCount), 5000); // Exponential backoff with max delay of 5 seconds
          console.log(`${config.name}|[createSwapTransaction]| Waiting ${delay / 1000} seconds before next confirmation attempt...`, processRunCounter);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } catch (confirmError: any) {
        console.log(`${config.name}|[createSwapTransaction]| ⛔ Error getting transaction confirmation ${confirmRetryCount + 1}/${maxConfirmRetries}: ${confirmError.message}`, processRunCounter);
        
        // Increment retry counter
        confirmRetryCount++;
        
        // If we haven't exhausted all retries, wait with exponential backoff
        if (confirmRetryCount < maxConfirmRetries) {
          const delay = Math.min(1000 * Math.pow(2, confirmRetryCount), 5000);
          console.log(`${config.name}|[createSwapTransaction]| Waiting ${delay / 1000} seconds before next confirmation attempt...`, processRunCounter);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // If we have no confirmation result after all retries, return null
    if (conf && (conf.value.err || conf.value.err !== null)) {
      console.error(`${config.name}|[createSwapTransaction]| ⛔ All confirmation attempts failed ${confirmRetryCount}/${maxConfirmRetries}.\n${JSON.stringify(conf)} \nYou can check transaction manually https://solscan.io/tx/${txid}.`, processRunCounter);
      return null;
    }

    console.log(`${config.name}|[createSwapTransaction]| ✅ Transaction confirmed. Bought ${tokenMint} for ${config.swap.amount} SOL\n https://solscan.io/tx/${txid}`, processRunCounter, {txid, tokenMint: tokenMint, amount: config.swap.amount, walletPublicKey}, TAGS.buy_tx_confirmed.name);

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

export async function getRugCheckConfirmed(token: string, processRunCounter: number): Promise<boolean> {
  try {
    console.log(`${config.name}|[getRugCheckConfirmed]| Getting Rug Check for token: ${token}`, processRunCounter);
    
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
      console.log(`${config.name}|[getRugCheckConfirmed]| ⛔ Could not fetch Rug Check: No response received from API.`, processRunCounter);
      return false;
    }
  
    if (config.verbose_log && config.verbose_log === true) {
      console.log(`${config.name}|[getRugCheckConfirmed]| Rug Check Response:`, processRunCounter, rugResponse.data);
    }
  
    // Extract information
    console.log(`${config.name}|[getRugCheckConfirmed]| Extracting information from Rug Check Response`, processRunCounter);
    const tokenReport: RugResponseExtended = rugResponse.data;
    const tokenCreator = tokenReport.creator ? tokenReport.creator : token;
    const tokenProgram = tokenReport.tokenProgram;
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
      console.log(`${config.name}|[getRugCheckConfirmed]| Excluding liquidity pools from top holders`, processRunCounter);
      // local types
      type Market = {
        liquidityA?: string;
        liquidityB?: string;
      };
  
      const markets: Market[] | undefined = tokenReport.markets;
      if (markets) {
        console.log(`${config.name}|[getRugCheckConfirmed]| Extracting liquidity addresses from markets`, processRunCounter);
        // Safely extract liquidity addresses from markets
        const liquidityAddresses: string[] = (markets ?? [])
          .flatMap((market) => [market.liquidityA, market.liquidityB])
          .filter((address): address is string => !!address);
  
        // Filter out topHolders that match any of the liquidity addresses
        topHolders = topHolders.filter((holder) => !liquidityAddresses.includes(holder.address));
        console.log(`${config.name}|[getRugCheckConfirmed]| Top Holders after filtering:`, processRunCounter, topHolders);
      }
    }
  
    // Get config
    console.log(`${config.name}|[getRugCheckConfirmed]| Getting bot config`, processRunCounter, config);
    const rugCheckConfig = config.rug_check;
    const rugCheckLegacy = rugCheckConfig.legacy_not_allowed;
  
    // Set conditions
    console.log(`${config.name}|[getRugCheckConfirmed]| Setting conditions`, processRunCounter);
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

    console.log(`${config.name}|[getRugCheckConfirmed]| Rug Check Result ${conditions.every((condition) => !condition.check) ? "✅" : "⛔"}:`, processRunCounter, conditions, TAGS.rug_validation.name);
    console.log(`${config.name}|[getRugCheckConfirmed]| \n${conditions.filter((condition) => !condition.check).map((condition) => condition.message).join("\n")}\n`, processRunCounter, null, TAGS.rug_validation.name);
    
  
    // Create new token record
    const newToken: NewTokenRecord = {
      time: Date.now(),
      mint: token,
      name: tokenName,
      creator: tokenCreator,
      program: tokenProgram,
      supply: supply,
      decimals: decimals,
      rug_conditions: JSON.stringify(conditions),
      tokenReport: JSON.stringify(tokenReport),
    };
    await insertNewToken(newToken, processRunCounter, conditions).catch((err) => {
        console.log(`${config.name}|[getRugCheckConfirmed]| ⛔ Unable to store new token for tracking duplicate tokens: ${err}`, processRunCounter);
    });
  
    //Validate conditions
    for (const condition of conditions) {
      if (condition.check) {
        console.log(`${config.name}|[getRugCheckConfirmed]| ⛔ Condition failed: ${condition.message}`, processRunCounter);
      }
    }
  
    return conditions.every((condition) => !condition.check);
  } catch (error: any) {
    console.error(`${config.name}|[getRugCheckConfirmed]| ⛔ Error during rug check processing: ${error.message}`, processRunCounter);
    return false;
  }
}

export async function fetchAndSaveSwapDetails(tx: string, processRunCounter: number, walletPublicKey: string): Promise<boolean> {
  const txUrl = process.env.HELIUS_HTTPS_URI_TX || "";
  const priceUrl = process.env.JUP_HTTPS_PRICE_URI || "";
  console.log(`${config.name}|[fetchAndSaveSwapDetails]| Fetching swap details for tx: ${tx}, wallet: ${walletPublicKey}`, processRunCounter);
  
  try {
    // Set retry parameters for API requests
    const maxRetries = 5;
    
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
      console.log(`${config.name}|[fetchAndSaveSwapDetails]| ⛔ Could not fetch swap details: No response received from API after ${maxRetries} attempts.`, processRunCounter);
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
        !priceResponse.data.data[config.liquidity_pool.wsol_pc_mint]?.price) {
      console.log(`${config.name}|[fetchAndSaveSwapDetails]| ⛔ Could not fetch latest Sol Price: No valid data received from API after ${maxRetries} attempts.`, processRunCounter);
      return false;
    }
    
    console.log(`${config.name}|[fetchAndSaveSwapDetails]| Latest Sol Price:`, processRunCounter, priceResponse.data.data[config.liquidity_pool.wsol_pc_mint]?.price);
    
    // Calculate estimated price paid in sol
    console.log(`${config.name}|[fetchAndSaveSwapDetails]| Calculating estimated price paid in sol`, processRunCounter);
    const solUsdcPrice = priceResponse.data.data[config.liquidity_pool.wsol_pc_mint]?.price;
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
