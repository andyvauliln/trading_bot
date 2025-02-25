import { config } from "./telegram-trading-bot-config";
import axios from "axios";
import { RugResponseExtended, NewTokenRecord } from "./types";
import { selectTokenByNameAndCreator, insertNewToken } from "../tracker-bot/db";
import { createSwapTransaction, fetchAndSaveSwapDetails } from "./transactions";

export async function getRugCheckConfirmed(token: string): Promise<boolean> {
    const rugResponse = await axios.get<RugResponseExtended>("https://api.rugcheck.xyz/v1/tokens/" + token + "/report", {
      timeout: 10000,
    });
  
    if (!rugResponse.data) return false;
  
    if (config.rug_check.verbose_log && config.rug_check.verbose_log === true) {
      console.log(rugResponse.data);
    }
  
    // Extract information
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
      // local types
      type Market = {
        liquidityA?: string;
        liquidityB?: string;
      };
  
      const markets: Market[] | undefined = tokenReport.markets;
      if (markets) {
        // Safely extract liquidity addresses from markets
        const liquidityAddresses: string[] = (markets ?? [])
          .flatMap((market) => [market.liquidityA, market.liquidityB])
          .filter((address): address is string => !!address);
  
        // Filter out topHolders that match any of the liquidity addresses
        topHolders = topHolders.filter((holder) => !liquidityAddresses.includes(holder.address));
      }
    }
  
    // Get config
    const rugCheckConfig = config.rug_check;
    const rugCheckLegacy = rugCheckConfig.legacy_not_allowed;
  
    // Set conditions
    const conditions = [
      {
        check: !rugCheckConfig.allow_mint_authority && mintAuthority !== null,
        message: "🚫 Mint authority should be null",
      },
      {
        check: !rugCheckConfig.allow_not_initialized && !isInitialized,
        message: "🚫 Token is not initialized",
      },
      {
        check: !rugCheckConfig.allow_freeze_authority && freezeAuthority !== null,
        message: "🚫 Freeze authority should be null",
      },
      {
        check: !rugCheckConfig.allow_mutable && tokenMutable !== false,
        message: "🚫 Mutable should be false",
      },
      {
        check: !rugCheckConfig.allow_insider_topholders && topHolders.some((holder) => holder.insider),
        message: "🚫 Insider accounts should not be part of the top holders",
      },
      {
        check: topHolders.some((holder) => holder.pct > rugCheckConfig.max_alowed_pct_topholders),
        message: "🚫 An individual top holder cannot hold more than the allowed percentage of the total supply",
      },
      {
        check: totalLPProviders < rugCheckConfig.min_total_lp_providers,
        message: "🚫 Not enough LP Providers.",
      },
      {
        check: marketsLength < rugCheckConfig.min_total_markets,
        message: "🚫 Not enough Markets.",
      },
      {
        check: totalMarketLiquidity < rugCheckConfig.min_total_market_Liquidity,
        message: "🚫 Not enough Market Liquidity.",
      },
      {
        check: !rugCheckConfig.allow_rugged && isRugged, //true
        message: "🚫 Token is rugged",
      },
      {
        check: rugCheckConfig.block_symbols.includes(tokenSymbol),
        message: "🚫 Symbol is blocked",
      },
      {
        check: rugCheckConfig.block_names.includes(tokenName),
        message: "🚫 Name is blocked",
      },
      {
        check: rugScore > rugCheckConfig.max_score && rugCheckConfig.max_score !== 0,
        message: "🚫 Rug score to high.",
      },
      {
        check: rugRisks.some((risk) => rugCheckLegacy.includes(risk.name)),
        message: "🚫 Token has legacy risks that are not allowed.",
      },
    ];
  
    // If tracking duplicate tokens is enabled
    if (config.rug_check.block_returning_token_names || config.rug_check.block_returning_token_creators) {
      // Get duplicates based on token min and creator
      const duplicate = await selectTokenByNameAndCreator(tokenName, tokenCreator);
  
      // Verify if duplicate token or creator was returned
      if (duplicate.length !== 0) {
        if (config.rug_check.block_returning_token_names && duplicate.some((token: any) => token.name === tokenName)) {
          console.log("🚫 Token with this name was already created");
          return false;
        }
        if (config.rug_check.block_returning_token_creators && duplicate.some((token: any) => token.creator === tokenCreator)) {
          console.log("🚫 Token from this creator was already created");
          return false;
        }
      }
    }
  
    // Create new token record
    const newToken: NewTokenRecord = {
      time: Date.now(),
      mint: token,
      name: tokenName,
      creator: tokenCreator,
    };
    await insertNewToken(newToken).catch((err) => {
      if (config.rug_check.block_returning_token_names || config.rug_check.block_returning_token_creators) {
        console.log("⛔ Unable to store new token for tracking duplicate tokens: " + err);
      }
    });
  
    //Validate conditions
    for (const condition of conditions) {
      if (condition.check) {
        console.log(condition.message);
        return false;
      }
    }
  
    return true;
  }
  
  export async function validateAndSwapToken(token: string): Promise<void> {
    const isRugCheckPassed = await getRugCheckConfirmed(token);
    if (!isRugCheckPassed) {
        console.log("🚫 Rug Check not passed! Transaction aborted.");
        console.log("🟢 Resuming looking for new tokens...\n");
        return;
    }

    // Handle ignored tokens
    if (token.trim().toLowerCase().endsWith("pump") && config.rug_check.ignore_pump_fun) {
        // Check if ignored
        console.log("🚫 Transaction skipped. Ignoring Pump.fun.");
        console.log("🟢 Resuming looking for new tokens..\n");
        return;
    }

    // Ouput logs
    console.log("Token found");
    console.log("👽 GMGN: https://gmgn.ai/sol/token/" + token);
    console.log("😈 BullX: https://neo.bullx.io/terminal?chainId=1399811149&address=" + token);

    // Check if simulation mode is enabled
    if (config.rug_check.simulation_mode) {
        console.log("👀 Token not swapped. Simulation mode is enabled.");
        console.log("🟢 Resuming looking for new tokens..\n");
        return;
    }
    // Add initial delay before first buy
  await new Promise((resolve) => setTimeout(resolve, config.tx.swap_tx_initial_delay));

  // Create Swap transaction
  const tx = await createSwapTransaction("So11111111111111111111111111111111111111112", token);
  if (!tx) {
    console.log("⛔ Transaction aborted.");
    console.log("🟢 Resuming looking for new tokens...\n");
    return;
  }

  // Output logs
  console.log("🚀 Swapping SOL for Token.");
  console.log("Swap Transaction: ", "https://solscan.io/tx/" + tx);

  // Fetch and store the transaction for tracking purposes
  const saveConfirmation = await fetchAndSaveSwapDetails(tx);
  if (!saveConfirmation) {
    console.log("❌ Warning: Transaction not saved for tracking! Track Manually!");
  }
  }
