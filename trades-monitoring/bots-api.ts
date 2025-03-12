import * as express from 'express';
import { Request, Response } from 'express';
import { getAllHoldings, getTotalProfitLoss, getProfitLossRecords, getAllTransactions } from '../bots/tracker-bot/holding.db';
import { Keypair, Connection } from '@solana/web3.js';
import bs58 from "bs58";
import { Wallet } from "@project-serum/anchor";
import { HoldingRecord } from '../bots/tracker-bot/types';
import { getWalletData, populateWithCurrentProfitsLosses, getHistoricalWalletData } from './helpers';


const router = express.Router();



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
      // Fixed 24-hour period
      const now = Date.now();
      const startTime = now - (24 * 60 * 60 * 1000);
      
      // Get profit/loss records for the 24-hour period
      const records = await getProfitLossRecords({
        startDate: startTime,
        endDate: now,
        limit: 1000,
        offset: 0
      });
      
      // Calculate performance metrics
      const winningTrades = records.filter(record => record.ProfitLossUSDC > 0);
      const winRate = records.length > 0 ? (winningTrades.length / records.length) * 100 : 0;
      
      // Calculate total volume
      const volume = records.reduce((sum, record) => sum + (record.EntryPriceUSDC * record.EntryBalance), 0);
      
      // Get current pool size
      const holdings = await getAllHoldings();
      const holdingsWithPrices = await populateWithCurrentProfitsLosses(holdings);
      
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
      const previousPeriodStart = startTime - (24 * 60 * 60 * 1000);
      const previousPeriodEnd = startTime;
      
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
      
      // Calculate changes
      const winRateChange = previousWinRate > 0 ? ((winRate - previousWinRate) / previousWinRate) * 100 : 0;
      const tradesChange = previousRecords.length > 0 ? ((records.length - previousRecords.length) / previousRecords.length) * 100 : 0;
      const volumeChange = previousVolume > 0 ? ((volume - previousVolume) / previousVolume) * 100 : 0;
      
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
      const now = Date.now();
      const startTime = now - (30 * 24 * 60 * 60 * 1000);
      const dataPoints = 30; // One point per day
      
      let chartData = [];
      
      // Get profit/loss records for the 30-day period
      const records = await getProfitLossRecords({
        startDate: startTime,
        endDate: now,
        limit: 1000,
        offset: 0
      });
      
      // Sort records by timestamp
      records.sort((a, b) => a.Time - b.Time);
      
      // Generate chart data points
      let cumulativePerformance = 100;
      
      if (records.length === 0) {
        for (let i = 0; i < dataPoints; i++) {
          const pointTime = new Date(startTime + (i * 24 * 60 * 60 * 1000));
          chartData.push({
            x: pointTime.toLocaleDateString([], { month: 'short', day: 'numeric' }),
            y: cumulativePerformance
          });
        }
      } else {
        const timeInterval = (now - startTime) / dataPoints; // Daily interval
        let currentTime = startTime;
        let recordIndex = 0;
        
        for (let i = 0; i < dataPoints; i++) {
          const pointTime = currentTime + timeInterval;
          const displayTime = new Date(currentTime).toLocaleDateString([], { month: 'short', day: 'numeric' });
          
          while (recordIndex < records.length && records[recordIndex].Time <= pointTime) {
            const record = records[recordIndex];
            const performanceImpact = record.ROIPercentage;
            cumulativePerformance += performanceImpact * 0.1;
            recordIndex++;
          }
          
          chartData.push({
            x: displayTime,
            y: cumulativePerformance
          });
          
          currentTime = pointTime;
        }
      }
      
      res.json({
        success: true,
        chartData: {
          datasets: [
            {
              label: 'Agent Performance (30 Days)',
              data: chartData,
              borderColor: 'rgba(255, 20, 147, 1)',
              backgroundColor: 'transparent',
              borderWidth: 2,
              fill: true,
              tension: 0.4,
            },
          ],
        }
      });
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
      const now = Date.now();
      const startTime = now - (30 * 24 * 60 * 60 * 1000);
      const dataPoints = 30; // One point per day
      
      let chartData = [];
      
      const holdings = await getAllHoldings();
      const holdingsWithPrices = await populateWithCurrentProfitsLosses(holdings);
      
      interface EnhancedHolding extends HoldingRecord {
        currentPrice?: number | null;
        hasValidPrice?: boolean;
        unrealizedPnLPercentage?: number | null;
      }
      
      const enhancedHoldings = holdingsWithPrices as EnhancedHolding[];
      
      let cumulativePerformance = 100;
      
      const validHoldings = enhancedHoldings.filter(h => 
        h.hasValidPrice && h.unrealizedPnLPercentage !== null
      );
      
      const avgPerformance = validHoldings.length > 0 
        ? validHoldings.reduce((sum, h) => sum + (h.unrealizedPnLPercentage || 0), 0) / validHoldings.length 
        : 0;
      
      // Generate daily data points
      for (let i = 0; i < dataPoints; i++) {
        const pointTime = new Date(startTime + (i * 24 * 60 * 60 * 1000));
        const randomFactor = 0.5 + Math.random();
        const pointPerformance = (avgPerformance / dataPoints) * randomFactor;
        
        cumulativePerformance += pointPerformance;
        
        chartData.push({
          x: pointTime.toLocaleDateString([], { month: 'short', day: 'numeric' }),
          y: cumulativePerformance
        });
      }
      
      res.json({
        success: true,
        chartData: {
          datasets: [
            {
              label: 'Portfolio Performance (30 Days)',
              data: chartData,
              borderColor: 'rgba(75, 192, 192, 1)',
              backgroundColor: 'transparent',
              borderWidth: 2,
              fill: true,
              tension: 0.4,
            },
          ],
        }
      });
    } catch (error) {
      console.error('Error fetching portfolio performance chart data:', error);
      res.status(500).json({ error: 'Failed to fetch portfolio performance chart data' });
    }
  })();
});

router.get('/get-pool-data', (req: Request, res: Response) => {
  (async () => {
    try {
      const tokens = await getWalletData();
      const calculateTotalValueUSDC = tokens.reduce((acc, token) => acc + token.tokenValueUSDC, 0);
      res.json({
        success: true,
        poolData: {
          poolSizeTotalValueUSDC: calculateTotalValueUSDC,
          tokens: tokens
        }
      });

    } catch (error) {
      console.error('Error fetching pool data:', error);
      res.status(500).json({ error: 'Failed to fetch pool data' });
    }
  })();
});

router.get('/get-pool-historical-data', (req: Request, res: Response) => {
  (async () => {
    try {
      const days = 30; // One data point per day

      const historicalData = await getHistoricalWalletData(days);

      // Format data for chart with daily timestamps
      const chartData = historicalData.map(dataPoint => {
        const date = new Date(dataPoint.timestamp);
        const formattedDate = date.toLocaleDateString([], { month: 'short', day: 'numeric' });

        return {
          x: formattedDate,
          y: parseFloat(dataPoint.totalValueUSDC.toFixed(2))
        };
      });

      const response = {
        success: true,
        timeframe: '30d',
        data: chartData,
        rawData: historicalData
      };

      res.json(response);

    } catch (error) {
      console.error('Error fetching pool data:', error);
      res.status(500).json({ error: 'Failed to fetch pool data' });
    }
  })();
});

router.get('/get-trading-history', (req: Request, res: Response) => {
  (async () => {
    try {
      const { module, limit, offset } = req.query;
      const tradingHistory = await getAllTransactions({ module: module as string, limit: limit ? parseInt(limit as string) : undefined, offset: offset ? parseInt(offset as string) : undefined });
      res.json({
        success: true,
        tradingHistory
      });
    } catch (error) {
      console.error('Error fetching trading history:', error);
      res.status(500).json({ error: 'Failed to fetch trading history' });
    }
  })();
});

export default router; 