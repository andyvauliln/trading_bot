import { config } from "./config";
import axios from "axios";
import { RugResponseExtended, NewTokenRecord } from "./types";
import { insertNewToken, getHoldingRecord } from "../tracker-bot/db";
import { createSwapTransaction, fetchAndSaveSwapDetails } from "./transactions";

export async function getRugCheckConfirmed(token: string, processRunCounter: number): Promise<boolean> {
  console.log(`[telegram-trading-bot]|[getRugCheckConfirmed]| Getting Rug Check for token: ${token}`, processRunCounter);
  try {
    const rugResponse = await axios.get<RugResponseExtended>("https://api.rugcheck.xyz/v1/tokens/" + token + "/report", {
      timeout: 100000,
    });
  
    if (!rugResponse.data) {
      console.log(`[telegram-trading-bot]|[getRugCheckConfirmed]| ⛔ Could not fetch Rug Check: No response received from API.`, processRunCounter, rugResponse);
      return false;
    }
  
    if (config.verbose_log && config.verbose_log === true) {
      console.log(`[telegram-trading-bot]|[getRugCheckConfirmed]| Rug Check Response:`, processRunCounter, rugResponse.data);
    }
  
    // Extract information
    console.log(`[telegram-trading-bot]|[getRugCheckConfirmed]| Extracting information from Rug Check Response`, processRunCounter);
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
      console.log(`[telegram-trading-bot]|[getRugCheckConfirmed]| Excluding liquidity pools from top holders`, processRunCounter);
      // local types
      type Market = {
        liquidityA?: string;
        liquidityB?: string;
      };
  
      const markets: Market[] | undefined = tokenReport.markets;
      if (markets) {
        console.log(`[telegram-trading-bot]|[getRugCheckConfirmed]| Extracting liquidity addresses from markets`, processRunCounter);
        // Safely extract liquidity addresses from markets
        const liquidityAddresses: string[] = (markets ?? [])
          .flatMap((market) => [market.liquidityA, market.liquidityB])
          .filter((address): address is string => !!address);
  
        // Filter out topHolders that match any of the liquidity addresses
        topHolders = topHolders.filter((holder) => !liquidityAddresses.includes(holder.address));
        console.log(`[telegram-trading-bot]|[getRugCheckConfirmed]| Top Holders after filtering:`, processRunCounter, topHolders);
      }
    }
  
    // Get config
    console.log(`[telegram-trading-bot]|[getRugCheckConfirmed]| Getting bot config`, processRunCounter, config);
    const rugCheckConfig = config.rug_check;
    const rugCheckLegacy = rugCheckConfig.legacy_not_allowed;
  
    // Set conditions
    console.log(`[telegram-trading-bot]|[getRugCheckConfirmed]| Setting conditions`, processRunCounter);
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

    console.log(`[telegram-trading-bot]|[getRugCheckConfirmed]| Conditions:`, processRunCounter, conditions);
  
    // Create new token record
    const newToken: NewTokenRecord = {
      time: Date.now(),
      mint: token,
      name: tokenName,
      creator: tokenCreator,
    };
    await insertNewToken(newToken).catch((err) => {
        console.log(`[telegram-trading-bot]|[getRugCheckConfirmed]| ⛔ Unable to store new token for tracking duplicate tokens: ${err}`, processRunCounter);
    });
  
    //Validate conditions
    for (const condition of conditions) {
      if (condition.check) {
        console.log(`[telegram-trading-bot]|[getRugCheckConfirmed]| ⛔ Condition failed: ${condition.message}`, processRunCounter);
      }
    }

  
    return conditions.every((condition) => !condition.check);

  } catch (error: any) {
    console.error(`[telegram-trading-bot]|[getRugCheckConfirmed]| ⛔ Error during rug check: ${error.message}`, processRunCounter);
    return false;
  }
}
  
  export async function validateAndSwapToken(token: string, processRunCounter: number): Promise<boolean> {
    console.log(`[telegram-trading-bot]|[validateAndSwapToken]| Validating token: ${token}`, processRunCounter);
    const tokenRecord = await getHoldingRecord(token);
    console.log(`[telegram-trading-bot]|[validateAndSwapToken]| Checking if token already in holding: ${tokenRecord}, Buy additional holding: ${config.swap.is_additional_holding}`, processRunCounter);
    if(tokenRecord && config.swap.is_additional_holding) {
        console.log(`[telegram-trading-bot]|[validateAndSwapToken]| Additional holding is disabled. Skipping validation and swapping.`, processRunCounter);
        return false;
    }
    const isRugCheckPassed = await getRugCheckConfirmed(token, processRunCounter);
    if (!isRugCheckPassed) {
        console.warn(`[telegram-trading-bot]|[validateAndSwapToken]| Rug Check not passed! Transaction aborted.`, processRunCounter);
        console.log(`[telegram-trading-bot]|[validateAndSwapToken]| 🟢 Resuming looking for new tokens...`, processRunCounter);
        return false;
    }
    console.log(`[telegram-trading-bot]|[validateAndSwapToken]| 🚀 Rug Check passed! Swapping token: ${token}`, processRunCounter);

    // Handle ignored tokens
    if (token.trim().toLowerCase().endsWith("pump") && config.rug_check.ignore_pump_fun) {
        // Check if ignored
        console.log(`[telegram-trading-bot]|[validateAndSwapToken]| 🚫 Transaction skipped. Ignoring Pump.fun.`, processRunCounter);
        console.log(`[telegram-trading-bot]|[validateAndSwapToken]| 🟢 Resuming looking for new tokens..`, processRunCounter);
        return false;
    }

    // Ouput logs
    console.log(`[telegram-trading-bot]|[validateAndSwapToken]| Token found`, processRunCounter);
    console.log(`[telegram-trading-bot]|[validateAndSwapToken]| 👽 GMGN: https://gmgn.ai/sol/token/${token}`, processRunCounter);
    console.log(`[telegram-trading-bot]|[validateAndSwapToken]| 😈 BullX: https://neo.bullx.io/terminal?chainId=1399811149&address=${token}`, processRunCounter);

    // Check if simulation mode is enabled
    if (config.rug_check.simulation_mode) {
        console.log(`[telegram-trading-bot]|[validateAndSwapToken]| 👀 Token not swapped. Simulation mode is enabled.`, processRunCounter);
        console.log(`[telegram-trading-bot]|[validateAndSwapToken]| 🟢 Resuming looking for new tokens..`, processRunCounter);
        return false;
    }
    // Add initial delay before first buy
    await new Promise((resolve) => setTimeout(resolve, config.tx.swap_tx_initial_delay));

    // Create Swap transaction
    const tx = await createSwapTransaction(config.sol_mint, token, processRunCounter);
    if (!tx) {
      console.log(`[telegram-trading-bot]|[validateAndSwapToken]| ⛔ Transaction aborted.`, processRunCounter);
      console.log(`[telegram-trading-bot]|[validateAndSwapToken]| 🟢 Resuming looking for new tokens...`, processRunCounter);
      return false;
    }

    // Output logs
    console.log(`[telegram-trading-bot]|[validateAndSwapToken]| 🚀 Swapping SOL for Token.`, processRunCounter);
    console.log(`[telegram-trading-bot]|[validateAndSwapToken]| Swap Transaction: https://solscan.io/tx/${tx}`, processRunCounter);

    // Fetch and store the transaction for tracking purposes
    const saveConfirmation = await fetchAndSaveSwapDetails(tx, processRunCounter);
    if (!saveConfirmation) {
      console.warn(`[telegram-trading-bot]|[validateAndSwapToken]| ❌ Warning: Transaction not saved for tracking! Track Manually!`, processRunCounter);
    }
    return true;
}