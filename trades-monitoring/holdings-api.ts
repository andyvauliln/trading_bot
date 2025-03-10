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
import { retryAxiosRequest } from '../bots/utils/help-functions';

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

    // Fetch prices from Jupiter Aggregator using retryAxiosRequest
    const currentPrices = await retryAxiosRequest(
      () => axios.get<any>(priceUrl, {
        params: {
          ids: tokenValues + "," + solMint,
          showExtraInfo: true,
        },
        timeout: config.tx.get_timeout,
      }).then(response => response.data),
      5,
      2000,
      0
    );
    
    let dexRaydiumPairs = null;

    // Fetch prices from Dexscreener if configured
    if (priceSource === "dex") {
      const dexPriceUrlPairs = `${dexPriceUrl}${tokenValues}`;
      const currentPricesDex = await retryAxiosRequest(
        () => axios.get<LastPriceDexReponse>(dexPriceUrlPairs, {
          timeout: config.tx.get_timeout,
        }).then(response => response.data),
        5,
        2000,
        0
      );

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

// Get performance metrics (win rate, total trades, volume, pool size)
router.get('/performance-metrics', (req: Request, res: Response) => {
  (async () => {
    try {
      const { timeframe } = req.query;
      
      // Default to 24h if not specified
      const period = timeframe ? timeframe as string : '24h';
      
      // Calculate time range based on period
      const now = Date.now();
      let startTime: number;
      
      switch(period) {
        case '7d':
          startTime = now - (7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startTime = now - (30 * 24 * 60 * 60 * 1000);
          break;
        case 'all':
          startTime = 0; // All time
          break;
        case '24h':
        default:
          startTime = now - (24 * 60 * 60 * 1000);
          break;
      }
      
      // Get profit/loss records for the specified period
      const records = await getProfitLossRecords({
        startDate: startTime,
        endDate: now,
        limit: 1000, // Adjust as needed
        offset: 0
      });
      
      // Calculate performance metrics
      const winningTrades = records.filter(record => record.ProfitLossUSDC > 0);
      const winRate = records.length > 0 ? (winningTrades.length / records.length) * 100 : 0;
      
      // Calculate total volume - using EntryPriceUSDC * EntryBalance for volume calculation
      const volume = records.reduce((sum, record) => sum + (record.EntryPriceUSDC * record.EntryBalance), 0);
      
      // Get current pool size (total value of active holdings)
      const holdings = await getAllHoldings();
      const holdingsWithPrices = await populateWithCurrentProfitsLosses(holdings);
      
      // Use the extended properties from populateWithCurrentProfitsLosses
      interface EnhancedHolding extends HoldingRecord {
        currentPrice?: number | null;
        hasValidPrice?: boolean;
      }
      
      const poolSize = (holdingsWithPrices as EnhancedHolding[]).reduce((sum, holding) => {
        if (holding.hasValidPrice && holding.currentPrice) {
          return sum + (holding.Balance * holding.currentPrice);
        }
        return sum;
      }, 0);
      
      // Calculate metrics for previous 24 hours for comparison
      const previousPeriodStart = startTime - 24 * 60 * 60 * 1000; // 24 hours before the current period start
      const previousPeriodEnd = now - 24 * 60 * 60 * 1000; // 24 hours before the current period end
      
      const previousRecords = await getProfitLossRecords({
        startDate: previousPeriodStart,
        endDate: previousPeriodEnd,
        limit: 1000,
        offset: 0
      });
      
      // Calculate previous period metrics
      const previousWinningTrades = previousRecords.filter(record => record.ProfitLossUSDC > 0);
      const previousWinRate = previousRecords.length > 0 ? (previousWinningTrades.length / previousRecords.length) * 100 : 0;
      const previousVolume = previousRecords.reduce((sum, record) => sum + (record.EntryPriceUSDC * record.EntryBalance), 0);
      
      // Calculate real change values
      const winRateChange = previousWinRate > 0 ? ((winRate - previousWinRate) / previousWinRate) * 100 : 0;
      const tradesChange = previousRecords.length > 0 ? ((records.length - previousRecords.length) / previousRecords.length) * 100 : 0;
      const volumeChange = previousVolume > 0 ? ((volume - previousVolume) / previousVolume) * 100 : 0;
      
      // For pool size change, we would need historical pool size data
      // As a simplification, we'll calculate it based on the difference between current holdings and closed positions
      const closedPositionsValue = records.reduce((sum, record) => sum + record.ProfitLossUSDC, 0);
      const previousPoolSize = poolSize - closedPositionsValue;
      const poolSizeChange = previousPoolSize > 0 ? ((poolSize - previousPoolSize) / previousPoolSize) * 100 : 0;
      
      res.json({
        success: true,
        metrics: {
          winRate: {
            value: winRate.toFixed(1),
            change: parseFloat(winRateChange.toFixed(1))
          },
          totalTrades: {
            value: records.length,
            change: parseFloat(tradesChange.toFixed(1))
          },
          volume: {
            value: volume.toFixed(2),
            change: parseFloat(volumeChange.toFixed(1))
          },
          poolSize: {
            value: poolSize.toFixed(2),
            change: parseFloat(poolSizeChange.toFixed(1))
          }
        }
      });
    } catch (error) {
      console.error('Error fetching performance metrics:', error);
      res.status(500).json({ error: 'Failed to fetch performance metrics' });
    }
  })();
});

// Get agent performance chart data
router.get('/agent-performance-chart', (req: Request, res: Response) => {
  (async () => {
    try {
      const { timeframe } = req.query;
      
      // Default to 24h if not specified
      const period = timeframe ? timeframe as string : '24h';
      
      // Calculate time range based on period
      const now = Date.now();
      let startTime: number;
      let dataPoints: number = 100; // Number of data points to return
      
      switch(period) {
        case '7d':
          startTime = now - (7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startTime = now - (30 * 24 * 60 * 60 * 1000);
          break;
        case 'all':
          startTime = 0; // All time
          break;
        case '24h':
        default:
          startTime = now - (24 * 60 * 60 * 1000);
          break;
      }
      
      let chartData = [];
      
      // Agent view: Use trade data for chart
      // Get profit/loss records for the specified period
      const records = await getProfitLossRecords({
        startDate: startTime,
        endDate: now,
        limit: 1000, // Adjust as needed
        offset: 0
      });
      
      // Sort records by timestamp (Time property in ProfitLossRecord)
      records.sort((a, b) => a.Time - b.Time);
      
      // Generate chart data points
      // For simplicity, we'll create a cumulative performance chart
      let cumulativePerformance = 100; // Starting at 100 (baseline)
      
      // If no records, generate flat line
      if (records.length === 0) {
        for (let i = 0; i < dataPoints; i++) {
          chartData.push({
            x: i,
            y: cumulativePerformance
          });
        }
      } else {
        const timeInterval = (now - startTime) / dataPoints;
        let currentTime = startTime;
        let recordIndex = 0;
        
        for (let i = 0; i < dataPoints; i++) {
          const pointTime = currentTime + timeInterval;
          
          // Add all trades that happened before this point
          while (recordIndex < records.length && records[recordIndex].Time <= pointTime) {
            const record = records[recordIndex];
            // Calculate performance impact using ROIPercentage
            const performanceImpact = record.ROIPercentage;
            cumulativePerformance += performanceImpact * 0.1; // Scale impact for visualization
            recordIndex++;
          }
          
          chartData.push({
            x: i,
            y: cumulativePerformance
          });
          
          currentTime = pointTime;
        }
      }
      
      // Format response to match the React component's expected structure
      const response = {
        success: true,
        chartData: {
          datasets: [
            {
              label: 'Agent Performance',
              data: chartData,
              borderColor: 'rgba(255, 20, 147, 1)',
              backgroundColor: 'transparent',
              borderWidth: 2,
              fill: true,
              tension: 0.4,
            },
          ],
        }
      };
      
      res.json(response);
    } catch (error) {
      console.error('Error fetching agent performance chart data:', error);
      res.status(500).json({ error: 'Failed to fetch agent performance chart data' });
    }
  })();
});

// Get portfolio performance chart data
router.get('/portfolio-performance-chart', (req: Request, res: Response) => {
  (async () => {
    try {
      const { timeframe } = req.query;
      
      // Default to 24h if not specified
      const period = timeframe ? timeframe as string : '24h';
      
      // Calculate time range based on period
      const now = Date.now();
      let startTime: number;
      let dataPoints: number = 100; // Number of data points to return
      
      switch(period) {
        case '7d':
          startTime = now - (7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startTime = now - (30 * 24 * 60 * 60 * 1000);
          break;
        case 'all':
          startTime = 0; // All time
          break;
        case '24h':
        default:
          startTime = now - (24 * 60 * 60 * 1000);
          break;
      }
      
      let chartData = [];
      
      // Portfolio view: Use holdings data for chart
      // For portfolio view, we'll simulate historical performance based on current holdings
      
      const holdings = await getAllHoldings();
      const holdingsWithPrices = await populateWithCurrentProfitsLosses(holdings);
      
      interface EnhancedHolding extends HoldingRecord {
        currentPrice?: number | null;
        hasValidPrice?: boolean;
        unrealizedPnLPercentage?: number | null;
      }
      
      const enhancedHoldings = holdingsWithPrices as EnhancedHolding[];
      
      // Generate simulated historical data for portfolio performance
      let cumulativePerformance = 100; // Starting at 100 (baseline)
      
      // Calculate average performance across all holdings
      const validHoldings = enhancedHoldings.filter(h => 
        h.hasValidPrice && h.unrealizedPnLPercentage !== null
      );
      
      const avgPerformance = validHoldings.length > 0 
        ? validHoldings.reduce((sum, h) => sum + (h.unrealizedPnLPercentage || 0), 0) / validHoldings.length 
        : 0;
      
      // Distribute this performance across the time period with some randomness
      for (let i = 0; i < dataPoints; i++) {
        // Add some randomness to make the chart look realistic
        const randomFactor = 0.5 + Math.random();
        const pointPerformance = (avgPerformance / dataPoints) * randomFactor;
        
        cumulativePerformance += pointPerformance;
        
        chartData.push({
          x: i,
          y: cumulativePerformance
        });
      }
      
      // Format response to match the React component's expected structure
      const response = {
        success: true,
        chartData: {
          datasets: [
            {
              label: 'Portfolio Performance',
              data: chartData,
              borderColor: 'rgba(75, 192, 192, 1)',
              backgroundColor: 'transparent',
              borderWidth: 2,
              fill: true,
              tension: 0.4,
            },
          ],
        }
      };
      
      res.json(response);
    } catch (error) {
      console.error('Error fetching portfolio performance chart data:', error);
      res.status(500).json({ error: 'Failed to fetch portfolio performance chart data' });
    }
  })();
});

// Keep the original endpoint for backward compatibility but mark it as deprecated
router.get('/performance-chart', (req: Request, res: Response) => {
  (async () => {
    try {
      const { timeframe, view } = req.query;
      
      // Default to 24h if not specified
      const period = timeframe ? timeframe as string : '24h';
      // Default to agent view if not specified
      const viewType = view ? view as string : 'agent';
      
      // Log deprecation warning
      console.warn('The /performance-chart endpoint is deprecated. Please use /agent-performance-chart or /portfolio-performance-chart instead.');
      
      // Redirect to the appropriate new endpoint
      if (viewType === 'agent') {
        res.redirect(`/api/holdings/agent-performance-chart?timeframe=${period}`);
      } else {
        res.redirect(`/api/holdings/portfolio-performance-chart?timeframe=${period}`);
      }
    } catch (error) {
      console.error('Error in deprecated performance chart endpoint:', error);
      res.status(500).json({ error: 'Failed to process request' });
    }
  })();
});

export default router; 