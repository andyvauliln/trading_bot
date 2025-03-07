import axios from "axios";
import { Connection, Keypair, VersionedTransaction, PublicKey } from "@solana/web3.js";
import { Wallet } from "@project-serum/anchor";
import bs58 from "bs58";
import dotenv from "dotenv";
import { config } from "./config";
import {
  QuoteResponse,
  SerializedQuoteResponse,
  createSellTransactionResponse
} from "./types";
import { removeHolding } from "./holding.db";
import { TAGS } from "../utils/log-tags";
import { retryAxiosRequest } from "../utils/help-functions";
// Load environment variables from the .env file
dotenv.config();

export async function createSellTransaction(solMint: string, tokenMint: string, amount: string, processRunCounter: number, type: string): Promise<createSellTransactionResponse> {
  const quoteUrl = process.env.JUP_HTTPS_QUOTE_URI || "";
  const swapUrl = process.env.JUP_HTTPS_SWAP_URI || "";
  const rpcUrl = process.env.HELIUS_HTTPS_URI || "";
  const myWallet = new Wallet(Keypair.fromSecretKey(bs58.decode(process.env.PRIV_KEY_WALLET_2 || "")));
  const connection = new Connection(rpcUrl);
  console.log(`[tracker-bot]|[createSellTransaction]| Crating Sell Transaction for Wallet ${myWallet.publicKey.toString()} with token ${tokenMint} and amount ${amount}`, processRunCounter);

  try {
    // Check token balance using RPC connection
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(myWallet.publicKey, {
      mint: new PublicKey(tokenMint),
    });

    //Check if token exists in wallet with non-zero balance
    const totalBalance = tokenAccounts.value.reduce((sum, account) => {
      const tokenAmount = account.account.data.parsed.info.tokenAmount.amount;
      return sum + BigInt(tokenAmount); // Use BigInt for precise calculations
    }, BigInt(0));

    // console.log(`[tracker-bot]|[createSellTransaction]| Token ${tokenMint} has ${totalBalance} balance`, processRunCounter);

    // Verify returned balance
    if (totalBalance <= 0n) {
      console.log(`[tracker-bot]|[createSellTransaction]| Token has 0 balance - Already sold elsewhere. Removing from tracking.`, processRunCounter);
      // await removeHolding(tokenMint, processRunCounter).catch((err) => {
      //   console.log(`[tracker-bot]|[createSellTransaction]| ⛔ Database Error: ${err}`, processRunCounter);
      // });
      console.log(`[tracker-bot]|[createSellTransaction]| Token has 0 balance - Already sold elsewhere. Removing from tracking.`, processRunCounter, totalBalance, {tokenMint, amount}, TAGS.tokens_finished.name);
      throw new Error(`Token has 0 balance - Already sold elsewhere. Removing from tracking.`);
    }

    // Verify amount with tokenBalance
    // TODO: Check need to sell amount minimum available
    if (totalBalance < BigInt(amount)) {
      throw new Error(`Wallet amount less then tracker balance.`);
    }

    // Check if wallet has enough SOL to cover fees
    const solBalance = await connection.getBalance(myWallet.publicKey);
    const minRequiredBalance = config.sell.prio_fee_max_lamports + 5000 + 1000000; // prio fee + base fee + safety buffer
    if (solBalance < minRequiredBalance) {
      throw new Error(`Insufficient SOL balance for fees. Required: ${minRequiredBalance/1e9} SOL, Current: ${solBalance/1e9} SOL`);
    }

    // Request a quote in order to swap SOL for new token
    console.log(`[tracker-bot]|[createSellTransaction]| Requesting quote for swap of ${amount} ${tokenMint} to ${solMint}, slippageBps: ${config.sell.slippageBps}`, processRunCounter);
    
    // Use the retry mechanism for the quote request
    const quoteResponse = await retryAxiosRequest(
      () => axios.get<QuoteResponse>(quoteUrl, {
        params: {
          inputMint: tokenMint,
          outputMint: solMint,
          amount: amount,
          slippageBps: 250,//config.sell.slippageBps,
        },
        timeout: config.tx.get_timeout,
      }),
      config.tx.fetch_tx_max_retries || 3,
      config.tx.retry_delay || 500,
      processRunCounter
    );

    // Throw error if no quote was received
    if (!quoteResponse.data) {
      throw new Error("No valid quote for selling the token was received from Jupiter!");
    }

    // Serialize the quote into a swap transaction that can be submitted on chain
    console.log(`[tracker-bot]|[createSellTransaction]| Serializing quote into a swap transaction that can be submitted on chain`, processRunCounter);
    const swapTransaction = await retryAxiosRequest(
      () => axios.post<SerializedQuoteResponse>(
        swapUrl,
        JSON.stringify({
          // quoteResponse from /quote api
          quoteResponse: quoteResponse.data,
          // user public key to be used for the swap
          userPublicKey: myWallet.publicKey.toString(),
          // auto wrap and unwrap SOL. default is true
          wrapAndUnwrapSol: true,
          //dynamicComputeUnitLimit: true, // allow dynamic compute limit instead of max 1,400,000
          dynamicSlippage: {
            // This will set an optimized slippage to ensure high success rate
            maxBps: 500, // Make sure to set a reasonable cap here to prevent MEV
          },
          prioritizationFeeLamports: {
            priorityLevelWithMaxLamports: {
              maxLamports: config.sell.prio_fee_max_lamports,
              priorityLevel: config.sell.prio_level,
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
      config.tx.fetch_tx_max_retries || 3,
      config.tx.retry_delay || 500,
      processRunCounter
    );

    // Throw error if no quote was received
    console.log(`[tracker-bot]|[createSellTransaction]| Serialized Swap Transaction`, processRunCounter, swapTransaction.data);
    if (!swapTransaction.data) {
      throw new Error("No valid swap transaction was received from Jupiter!");
    }

    // deserialize the transaction
    console.log(`[tracker-bot]|[createSellTransaction]| Deserializing Swap Transaction`, processRunCounter);
    const swapTransactionBuf = Buffer.from(swapTransaction.data.swapTransaction, "base64");
    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    // sign the transaction
    console.log(`[tracker-bot]|[createSellTransaction]| Signing Swap Transaction`, processRunCounter);
    transaction.sign([myWallet.payer]);

    // Execute the transaction
    const rawTransaction = transaction.serialize();
    console.log(`[tracker-bot]|[createSellTransaction]| Sending Swap Transaction`, processRunCounter);
    const txid = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: true, // If True, This will skip transaction simulation entirely.
      maxRetries: 2,
    });

    // Return null when no tx was returned
    if (!txid) {
      throw new Error("Could not send transaction that was signed and serialized!");
    }
    console.log(`[tracker-bot]|[createSellTransaction]| Transaction Sent`, processRunCounter,{ txid, rawTx: rawTransaction, url: `https://solscan.io/tx/${txid}`}, "transaction-sent");

    // get the latest block hash
    const latestBlockHash = await connection.getLatestBlockhash();
    console.log(`[tracker-bot]|[createSellTransaction]| Latest Block Hash`, processRunCounter, latestBlockHash);

    // Fetch the current status of a transaction signature (processed, confirmed, finalized).
    console.log(`[tracker-bot]|[createSellTransaction]| Confirming Transaction`, processRunCounter);
    const conf = await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: txid,
    });

    // Return null when an error occured when confirming the transaction
    if (conf.value.err || conf.value.err !== null) {
      throw new Error(`Transaction was not successfully confirmed! ${conf.value.err}`);
    }

    console.log(`[tracker-bot]|[createSellTransaction]| Transaction Confirmed`, processRunCounter, {txid, tokenMint, amount, type}, TAGS.sell_tx_confirmed.name);

    // After successful transaction confirmation
    if (conf.value.err === null) {
      // Delete holding
      console.log(`[tracker-bot]|[createSellTransaction]| Deleting Holding`, processRunCounter);
      await removeHolding(tokenMint, processRunCounter).catch((err) => {
        console.log(`[tracker-bot]|[createSellTransaction]| ⛔ Database Error: ${err}`, processRunCounter);
      });

      return {
        success: true,
        msg: null,
        tx: txid,
      };
    }

    return {
      success: false,
      msg: "Transaction failed to confirm",
      tx: null
    };
  } catch (error: any) {
    return {
      success: false,
      msg: error instanceof Error ? error.message : "Unknown error",
      tx: null,
    };
  }
}
