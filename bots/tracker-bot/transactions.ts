import axios from "axios";
import { Connection, Keypair, VersionedTransaction, PublicKey } from "@solana/web3.js";
import { Wallet } from "@project-serum/anchor";
import bs58 from "bs58";
import dotenv from "dotenv";
import { config } from "./config";
import {
  QuoteResponse,
  SerializedQuoteResponse,
} from "./types";
import { removeHolding } from "./holding.db";
import { TAGS } from "../utils/log-tags";
import { retryAxiosRequest } from "../utils/help-functions";
// Load environment variables from the .env file
dotenv.config();

export async function createSellTransaction(solMint: string, tokenMint: string, amount: string, processRunCounter: number, type: string, privateKey: string): Promise<{ success: boolean; msg: string | null; tx: string | null; walletPublicKey: string }> {
  const quoteUrl = process.env.JUP_HTTPS_QUOTE_URI || "";
  const swapUrl = process.env.JUP_HTTPS_SWAP_URI || "";
  const rpcUrl = process.env.HELIUS_HTTPS_URI || "";
  
  if (!privateKey) {
    console.error(`${config.name}|[createSellTransaction]| ⛔ No private key provided`, processRunCounter);
    return { success: false, msg: "No private key provided", tx: null, walletPublicKey: "" };
  }

  const connection = new Connection(rpcUrl);
  
  try {
    const myWallet = new Wallet(Keypair.fromSecretKey(bs58.decode(privateKey)));
    const walletPublicKey = myWallet.publicKey.toString();
    console.log(`${config.name}|[createSellTransaction]| Creating Sell Transaction for Wallet ${walletPublicKey} with token ${tokenMint} and amount ${amount}`, processRunCounter);

    // Check token balance using RPC connection
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(myWallet.publicKey, {
      mint: new PublicKey(tokenMint),
    });

    //Check if token exists in wallet with non-zero balance
    const totalBalance = tokenAccounts.value.reduce((sum, account) => {
      const tokenAmount = account.account.data.parsed.info.tokenAmount.amount;
      return sum + BigInt(tokenAmount);
    }, BigInt(0));

    // Log the balance format for debugging
    console.log(`${config.name}|[createSellTransaction]| Token balance format:`, processRunCounter, {
      totalBalance: totalBalance.toString(),
      requestedAmount: amount
    });

    // Skip this wallet if it doesn't have the token balance
    if (totalBalance <= 0n) {
      console.log(`${config.name}|[createSellTransaction]| Wallet ${walletPublicKey} has no balance for token ${tokenMint}`, processRunCounter);
      return { success: false, msg: "No token balance", tx: null, walletPublicKey };
    }

    // Verify amount with tokenBalance
    if (totalBalance < BigInt(amount)) {
      console.log(`${config.name}|[createSellTransaction]| Wallet ${walletPublicKey} has insufficient balance (${totalBalance}) for requested amount (${amount})`, processRunCounter);
      return { success: false, msg: "Insufficient token balance", tx: null, walletPublicKey };
    }

    // Check if wallet has enough SOL to cover fees
    const solBalance = await connection.getBalance(myWallet.publicKey);
    const minRequiredBalance = config.sell.prio_fee_max_lamports + 5000 + 1000000; // prio fee + base fee + safety buffer
    
    // Log fee details for clarity
    console.log(`${config.name}|[createSellTransaction]| Fee details:`, processRunCounter, {
      solBalanceLamports: solBalance,
      solBalanceSOL: solBalance / 1e9,
      requiredBalanceLamports: minRequiredBalance,
      requiredBalanceSOL: minRequiredBalance / 1e9,
      priorityFeeLamports: config.sell.prio_fee_max_lamports,
      priorityFeeSOL: config.sell.prio_fee_max_lamports / 1e9
    });
    
    if (solBalance < minRequiredBalance) {
      console.log(`${config.name}|[createSellTransaction]| Wallet ${walletPublicKey} has insufficient SOL for fees`, processRunCounter);
      return { success: false, msg: "Insufficient SOL for fees", tx: null, walletPublicKey };
    }

    // Request a quote in order to swap token for SOL
    console.log(`${config.name}|[createSellTransaction]| Requesting quote for swap of ${amount} ${tokenMint} to ${solMint}, slippageBps: ${config.sell.slippageBps}`, processRunCounter);
    
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

    if (!quoteResponse.data) {
      return { success: false, msg: "No valid quote received", tx: null, walletPublicKey };
    }

    // Serialize the quote into a swap transaction that can be submitted on chain
    console.log(`${config.name}|[createSellTransaction]| Serializing quote into a swap transaction that can be submitted on chain`, processRunCounter);
    const swapTransaction = await retryAxiosRequest(
      () => axios.post<SerializedQuoteResponse>(
        swapUrl,
        JSON.stringify({
          quoteResponse: quoteResponse.data,
          userPublicKey: myWallet.publicKey.toString(),
          wrapAndUnwrapSol: true,
          dynamicSlippage: {
            maxBps: 500,
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

    if (!swapTransaction.data) {
      return { success: false, msg: "No valid swap transaction received", tx: null, walletPublicKey };
    }

    // deserialize the transaction
    console.log(`${config.name}|[createSellTransaction]| Deserializing Swap Transaction`, processRunCounter);
    const swapTransactionBuf = Buffer.from(swapTransaction.data.swapTransaction, "base64");
    var transaction = VersionedTransaction.deserialize(swapTransactionBuf);

    // sign the transaction
    console.log(`${config.name}|[createSellTransaction]| Signing Swap Transaction`, processRunCounter);
    transaction.sign([myWallet.payer]);

    // Execute the transaction
    const rawTransaction = transaction.serialize();
    console.log(`${config.name}|[createSellTransaction]| Sending Swap Transaction`, processRunCounter);
    const txid = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: true,
      maxRetries: 2,
    });

    if (!txid) {
      return { success: false, msg: "Could not send transaction", tx: null, walletPublicKey };
    }

    // get the latest block hash
    const latestBlockHash = await connection.getLatestBlockhash();
    console.log(`${config.name}|[createSellTransaction]| Latest Block Hash`, processRunCounter, latestBlockHash);

    // Confirm the transaction
    console.log(`${config.name}|[createSellTransaction]| Confirming Transaction`, processRunCounter);
    const conf = await connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: txid,
    });

    // Log confirmation details
    console.log(`${config.name}|[createSellTransaction]| Transaction confirmation details:`, processRunCounter, {
      confirmed: conf.value.err === null,
      error: conf.value.err,
      context: {
        slot: conf.context?.slot
      }
    });

    if (conf.value.err || conf.value.err !== null) {
      console.warn(`${config.name}|[createSellTransaction]| ⛔ Transaction not confirmed: ${JSON.stringify(conf.value.err, null, 2)}`, processRunCounter, {txid, tokenMint, amount, type, walletPublicKey, conf});
      return { success: false, msg: `Transaction not confirmed: ${conf.value.err}`, tx: null, walletPublicKey };
    }

    console.log(`${config.name}|[createSellTransaction]| Transaction Confirmed`, processRunCounter, {txid, tokenMint, amount, type}, TAGS.sell_tx_confirmed.name);

    // After successful transaction confirmation
    if (conf.value.err === null) {
      // Delete holding for this specific wallet
      console.log(`${config.name}|[createSellTransaction]| Deleting Holding for wallet ${walletPublicKey}`, processRunCounter);
      await removeHolding(tokenMint, processRunCounter, walletPublicKey).catch((err) => {
        console.error(`${config.name}|[createSellTransaction]| ⛔ Database Error: ${err}`, processRunCounter);
      });

      return {
        success: true,
        msg: null,
        tx: txid,
        walletPublicKey
      };
    }

    return {
      success: false,
      msg: "Transaction failed to confirm",
      tx: null,
      walletPublicKey
    };

  } catch (error: any) {
    console.error(`${config.name}|[createSellTransaction]| Error with wallet: ${error.message}`, processRunCounter);
    return {
      success: false,
      msg: error.message,
      tx: null,
      walletPublicKey: ""
    };
  }
}
