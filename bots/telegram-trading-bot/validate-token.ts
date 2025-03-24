import { config } from "./config";
import axios from "axios";
import { RugResponseExtended, NewTokenRecord } from "./types";
import { insertNewToken, getHoldingRecord } from "../tracker-bot/holding.db";
import { createSwapTransaction, fetchAndSaveSwapDetails } from "./transactions";
import { retryAxiosRequest } from "../utils/help-functions";
import { TAGS } from "../utils/log-tags";


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

    console.log(`${config.name}|[getRugCheckConfirmed]| Rug Check Result ${conditions.every((condition) => !condition.check) ? "✅" : "⛔"}: For token ${tokenName} (${tokenSymbol}) ${token}`, processRunCounter, conditions, TAGS.rug_validation.name);
    console.log(`${config.name}|[getRugCheckConfirmed]| \n${conditions.filter((condition) => condition.check).map((condition) => condition.message).join("\n")}\n`, processRunCounter, null, TAGS.rug_validation.name);
  
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
    await insertNewToken(newToken, processRunCounter).catch((err) => {
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
    // Check if error is related to "Token not found" (status code 400)
    if (error.response && error.response.status === 400) {
      console.warn(`${config.name}|[getRugCheckConfirmed]| ⚠️ Warning: Token not found in rug validation: ${token} Token may be too new or not indexed yet by RugCheck or it's not a token, check it manually to be sure.`, processRunCounter, TAGS.rug_validation.name);
      
      return false; // Allow the token to pass rug check when it's not found
    } else {
      // Handle other errors with the original error message
      console.error(`${config.name}|[getRugCheckConfirmed]| ⛔ Error during rug check processing: ${error.message}`, processRunCounter);
      return false;
    }
  }
}
  
export async function validateAndSwapToken(token: string, processRunCounter: number): Promise<boolean> {
  console.log(`${config.name}|[validateAndSwapToken]| Validating token: ${token}`, processRunCounter);
  
  // Get wallet private keys from environment variable
  const walletPrivateKeys = (process.env.PRIV_KEY_WALLETS || "").split(",").map(key => key.trim()).filter(key => key);
  if (!walletPrivateKeys.length) {
    console.error(`${config.name}|[validateAndSwapToken]| ⛔ No wallet private keys found in PRIV_KEY_WALLETS`, processRunCounter);
    return false;
  }

  // Check if token is already in holdings for any wallet
  const tokenRecord = await getHoldingRecord(token, processRunCounter);
  if(tokenRecord) {
    console.log(`${config.name}|[validateAndSwapToken]| Token ${tokenRecord.TokenName} already in holdings. Config: Buy Additional Tokens if Present: ${config.swap.is_additional_holding ? 'Yes, going to swap.' : 'No, skipping swap.'}`, processRunCounter, tokenRecord, "discord-log");
  }
  if(tokenRecord && !config.swap.is_additional_holding) {
    return false;
  }

  const isRugCheckPassed = await getRugCheckConfirmed(token, processRunCounter);
  if (!isRugCheckPassed) {
    console.log(`${config.name}|[validateAndSwapToken]|🚫 Rug Check not passed for token ${token} ${config.rug_check.enabled ? '! Transaction aborted.' : 'But Rug Check is disabled. Going to swap anyway.'}`, processRunCounter, {token}, "discord-log");
    console.log(`${config.name}|[validateAndSwapToken]| 🟢 Resuming looking for new tokens...`, processRunCounter);
    if (config.rug_check.enabled) {
      return false;
    }
  }
  console.log(`${config.name}|[validateAndSwapToken]| 🚀 Rug Check passed! Swapping token: ${token}`, processRunCounter);


  // Handle ignored tokens
  if (token.trim().toLowerCase().endsWith("pump") && config.rug_check.ignore_pump_fun) {
    console.log(`${config.name}|[validateAndSwapToken]| 🚫 Transaction skipped. Ignoring Pump.fun.`, processRunCounter);
    console.log(`${config.name}|[validateAndSwapToken]| 🟢 Resuming looking for new tokens..`, processRunCounter);
    return false;
  }

  // Output logs
  console.log(`${config.name}|[validateAndSwapToken]| Token found`, processRunCounter);
  console.log(`${config.name}|[validateAndSwapToken]| 👽 GMGN: https://gmgn.ai/sol/token/${token}`, processRunCounter);
  console.log(`${config.name}|[validateAndSwapToken]| 😈 BullX: https://neo.bullx.io/terminal?chainId=1399811149&address=${token}`, processRunCounter);

  // Check if simulation mode is enabled
  if (config.simulation_mode) {
    console.log(`${config.name}|[validateAndSwapToken]| 👀 Token not swapped. Simulation mode is enabled.`, processRunCounter);
    console.log(`${config.name}|[validateAndSwapToken]| 🟢 Resuming looking for new tokens..`, processRunCounter);
    return false;
  }

  // Add initial delay before first buy
  await new Promise((resolve) => setTimeout(resolve, config.tx.swap_tx_initial_delay));

  let successfulTransactions = 0;
  
  // Try to create swap transactions for each wallet
  for (const privateKey of walletPrivateKeys) {
    try {
      // Create Swap transaction
      const result = await createSwapTransaction(config.sol_mint, token, processRunCounter, privateKey);
      if (!result || !result.txid) {
        console.log(`${config.name}|[validateAndSwapToken]| ⛔ Transaction failed for wallet: with private key starts from ${privateKey.slice(0, 5)}...`, processRunCounter);
        continue;
      }

      // Output logs
      console.log(`${config.name}|[validateAndSwapToken]| 🚀 Swapping SOL for Token using wallet: ${result.walletPublicKey}`, processRunCounter);
      console.log(`${config.name}|[validateAndSwapToken]| Swap Transaction: https://solscan.io/tx/${result.txid}`, processRunCounter);

      // Fetch and store the transaction for tracking purposes
      const saveConfirmation = await fetchAndSaveSwapDetails(result.txid, processRunCounter, result.walletPublicKey);
      if (!saveConfirmation) {
        console.warn(`${config.name}|[validateAndSwapToken]| ❌ Warning: Transaction not saved for tracking! Track Manually!, http://solscan.io/tx/${result.txid}`, processRunCounter);
      }

      successfulTransactions++;
    } catch (error: any) {
      console.error(`${config.name}|[validateAndSwapToken]| ⛔ Error processing transaction for wallet with private key starts from ${privateKey.slice(0, 5)}...}: ${error.message}`, processRunCounter);
    }
  }

  if (successfulTransactions === 0) {
    console.warn(`${config.name}|[validateAndSwapToken]| ⛔ All transactions failed. `, processRunCounter);
    return false;
  }

  console.log(`${config.name}|[validateAndSwapToken]| ✅ Successfully processed ${successfulTransactions} out of ${walletPrivateKeys.length} transactions`, processRunCounter);
  return true;
}