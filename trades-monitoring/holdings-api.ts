import * as express from 'express';
import { Request, Response } from 'express';
import * as sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { config } from '../bots/tracker-bot/config';
import { getAllHoldings, getTotalProfitLoss, getProfitLossRecords } from '../bots/tracker-bot/holding.db';
import { Keypair, Connection } from '@solana/web3.js';
import bs58 from "bs58";
import { Wallet } from "@project-serum/anchor";
import { HoldingRecord } from '../bots/tracker-bot/types';
import axios from 'axios';
import { LastPriceDexReponse } from '../bots/tracker-bot/types';
const router = express.Router();

async function populateWithCurrentProfitsLosses(holdings: HoldingRecord[]) {
  try {
    if (holdings.length === 0) return holdings;

    // Get all token ids for price fetching
    const tokenValues = holdings.map((holding) => holding.Token).join(",");
    const solMint = config.liquidity_pool.wsol_pc_mint;
    const priceUrl = process.env.JUP_HTTPS_PRICE_URI || "";
    const dexPriceUrl = process.env.DEX_HTTPS_LATEST_TOKENS || "";
    const priceSource = config.sell.price_source || "jup";

    // Fetch prices from Jupiter Aggregator
    const priceResponse = await axios.get<any>(priceUrl, {
      params: {
        ids: tokenValues + "," + solMint,
        showExtraInfo: true,
      },
      timeout: config.tx.get_timeout,
    });

    const currentPrices = priceResponse.data;
    let dexRaydiumPairs = null;

    // Fetch prices from Dexscreener if configured
    if (priceSource === "dex") {
      const dexPriceUrlPairs = `${dexPriceUrl}${tokenValues}`;
      const priceResponseDex = await axios.get<LastPriceDexReponse>(dexPriceUrlPairs, {
        timeout: config.tx.get_timeout,
      });
      const currentPricesDex = priceResponseDex.data;

      // Get raydium legacy pairs prices
      dexRaydiumPairs = currentPricesDex.pairs
        .filter((pair) => pair.dexId === "raydium")
        .reduce<Array<(typeof currentPricesDex.pairs)[0]>>((uniquePairs, pair) => {
          const exists = uniquePairs.some((p) => p.baseToken.address === pair.baseToken.address);
          if (!exists || (pair.labels && pair.labels.length === 0)) {
            return uniquePairs.filter((p) => p.baseToken.address !== pair.baseToken.address).concat(pair);
          }
          return uniquePairs;
        }, []);
    }

    // Process each holding with current prices
    return holdings.map(holding => {
      try {
        let tokenCurrentPrice = currentPrices[holding.Token]?.extraInfo?.lastSwappedPrice?.lastJupiterSellPrice;
        let priceSource = "Jupiter Aggregator";

        // Try Dexscreener price if Jupiter price not available
        if (!tokenCurrentPrice && dexRaydiumPairs) {
          const pair = dexRaydiumPairs.find(p => p.baseToken.address === holding.Token);
          if (pair) {
            tokenCurrentPrice = parseFloat(pair.priceUsd);
            priceSource = "Dexscreener Tokens API";
          }
        }

        // If we have a valid price, calculate PnL
        if (tokenCurrentPrice) {
          const unrealizedPnLUSDC = (tokenCurrentPrice - holding.PerTokenPaidUSDC) * holding.Balance - holding.SolFeePaidUSDC;
          const unrealizedPnLPercentage = (unrealizedPnLUSDC / (holding.PerTokenPaidUSDC * holding.Balance)) * 100;

          return {
            ...holding,
            currentPrice: tokenCurrentPrice,
            priceSource: priceSource,
            unrealizedPnLUSDC: unrealizedPnLUSDC,
            unrealizedPnLPercentage: unrealizedPnLPercentage,
            hasValidPrice: true,
            priceError: null
          };
        } else {
          // Mark holding as having price issues
          return {
            ...holding,
            currentPrice: null,
            priceSource: "No valid price source",
            unrealizedPnLUSDC: null,
            unrealizedPnLPercentage: null,
            hasValidPrice: false,
            priceError: "Could not fetch current price"
          };
        }
      } catch (error) {
        console.error(`Error processing holding ${holding.Token}:`, error);
        return {
          ...holding,
          currentPrice: null,
          priceSource: "Error processing",
          unrealizedPnLUSDC: null,
          unrealizedPnLPercentage: null,
          hasValidPrice: false,
          priceError: "Error calculating profits/losses"
        };
      }
    });
  } catch (error) {
    console.error('Error fetching current prices:', error);
    // Return holdings with error status
    return holdings.map(holding => ({
      ...holding,
      currentPrice: null,
      priceSource: "Error fetching prices",
      unrealizedPnLUSDC: null,
      unrealizedPnLPercentage: null,
      hasValidPrice: false,
      priceError: "Failed to fetch price data"
    }));
  }
}

// Get active holdings
router.get('/active-holdings', (req: Request, res: Response) => {
  (async () => {
    try {
      const { module } = req.query;
      const holdings = await getAllHoldings();
      
      // Filter by module if specified
      const filteredHoldings = module 
        ? holdings.filter(h => h.BotName === module)
        : holdings;
      const holdingsWithCurrentProfitsLosses = await populateWithCurrentProfitsLosses(filteredHoldings);
      res.json({
        success: true,
        holdings: holdingsWithCurrentProfitsLosses
      });
    } catch (error) {
      console.error('Error fetching active holdings:', error);
      res.status(500).json({ error: 'Failed to fetch active holdings' });
    }
  })();
});

router.get('/get-current-sol-balance', (req: Request, res: Response) => {
  (async () => {
    try {
      const {publicKey} = req.query;
      const rpcUrl = process.env.HELIUS_HTTPS_URI || "";
      const myWallet = new Wallet(Keypair.fromSecretKey(bs58.decode(publicKey as string || process.env.PRIV_KEY_WALLET_2 || "")));
      const connection = new Connection(rpcUrl);
      const solBalance = await connection.getBalance(myWallet.publicKey);

      res.json({
        success: true,
        solBalance: solBalance
      });
    } catch (error) {
      console.error('Error fetching current SOL balance:', error);
      res.status(500).json({ error: 'Failed to fetch current SOL balance' });
    }
  })();
});

router.get('/get-total-profit-loss', (req: Request, res: Response) => {
  (async () => {
    try {
      const { module } = req.query;
      const profitLoss = await getTotalProfitLoss(module ? module as string : undefined);

      res.json({
        success: true,
        ...profitLoss
      });
    } catch (error) {
      console.error('Error fetching total profit/loss:', error);
      res.status(500).json({ error: 'Failed to fetch total profit/loss' });
    }
  })();
});

router.get('/get-profit-losses', (req: Request, res: Response) => {
  (async () => {
    try {
      const { startDate, endDate, limit, offset, module } = req.query;

      const records = await getProfitLossRecords({
        startDate: startDate ? parseInt(startDate as string) : undefined,
        endDate: endDate ? parseInt(endDate as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
        offset: offset ? parseInt(offset as string) : undefined,
        module: module as string | undefined
      });

      res.json({
        success: true,
        records
      });
    } catch (error) {
      console.error('Error getting profit/losses:', error);
      res.status(500).json({ error: 'Failed to get profit/losses' });
    }
  })();
});

export default router; 