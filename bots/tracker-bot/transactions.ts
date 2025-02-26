import axios from "axios";
import { Connection, Keypair, VersionedTransaction, PublicKey } from "@solana/web3.js";
import { Wallet } from "@project-serum/anchor";
import bs58 from "bs58";
import dotenv from "dotenv";
import { config } from "./config";
import {
  QuoteResponse,
  SerializedQuoteResponse,
  createSellTransactionResponse,
} from "./types";
import { removeHolding} from "./holding.db";

// Load environment variables from the .env file
dotenv.config();

export async function createSellTransaction(solMint: string, tokenMint: string, amount: string, processRunCounter: number): Promise<createSellTransactionResponse> {
  const quoteUrl = process.env.JUP_HTTPS_QUOTE_URI || "";
  const swapUrl = process.env.JUP_HTTPS_SWAP_URI || "";
  const rpcUrl = process.env.HELIUS_HTTPS_URI || "";
  const myWallet = new Wallet(Keypair.fromSecretKey(bs58.decode(process.env.PRIV_KEY_WALLET_2 || "")));
  const connection = new Connection(rpcUrl);

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

    // Verify returned balance
    if (totalBalance <= 0n) {
      await removeHolding(tokenMint, processRunCounter).catch((err) => {
        console.log("⛔ Database Error: " + err);
      });
      throw new Error(`Token has 0 balance - Already sold elsewhere. Removing from tracking.`);
    }

    // Verify amount with tokenBalance
    if (totalBalance !== BigInt(amount)) {
      throw new Error(`Wallet and tracker balance mismatch. Sell manually and token will be removed during next price check.`);
    }

    // Request a quote in order to swap SOL for new token
    const quoteResponse = await axios.get<QuoteResponse>(quoteUrl, {
      params: {
        inputMint: tokenMint,
        outputMint: solMint,
        amount: amount,
        slippageBps: config.sell.slippageBps,
      },
      timeout: config.tx.get_timeout,
    });

    // Throw error if no quote was received
    if (!quoteResponse.data) {
      throw new Error("No valid quote for selling the token was received from Jupiter!");
    }

    // Serialize the quote into a swap transaction that can be submitted on chain
    const swapTransaction = await axios.post<SerializedQuoteResponse>(
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
          maxBps: 300, // Make sure to set a reasonable cap here to prevent MEV
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
    );

    // Throw error if no quote was received
    if (!swapTransaction.data) {
      throw new Error("No valid swap transaction was received from Jupiter!");
    }

    // deserialize the transaction
    const swapTransactionBuf = Buffer.from(swapTransaction.data.swapTransaction, "base64");
    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    // sign the transaction
    transaction.sign([myWallet.payer]);

    // Execute the transaction
    const rawTransaction = transaction.serialize();
    const txid = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: true, // If True, This will skip transaction simulation entirely.
      maxRetries: 2,
    });

    // Return null when no tx was returned
    if (!txid) {
      throw new Error("Could not send transaction that was signed and serialized!");
    }

    // get the latest block hash
    const latestBlockHash = await connection.getLatestBlockhash();

    // Fetch the current status of a transaction signature (processed, confirmed, finalized).
    const conf = await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: txid,
    });

    // Return null when an error occured when confirming the transaction
    if (conf.value.err || conf.value.err !== null) {
      throw new Error("Transaction was not successfully confirmed!");
    }

    // Delete holding
    await removeHolding(tokenMint, processRunCounter).catch((err) => {
      console.log("⛔ Database Error: " + err);
    });

    return {
      success: true,
      msg: null,
      tx: txid,
    };
  } catch (error: any) {
    return {
      success: false,
      msg: error instanceof Error ? error.message : "Unknown error",
      tx: null,
    };
  }
}
