import * as express from 'express';
import { Request, Response } from 'express';
import { getAllHoldings, getTotalProfitLoss, getProfitLossRecords, getAllTransactions } from '../bots/tracker-bot/holding.db';
import { getWalletData, populateWithCurrentProfitsLosses, getHistoricalWalletData, addComments, getPoolSizeData } from './helpers';
import { WalletToken } from './types';
import { config } from './config';

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
        data: holdingsWithCurrentProfitsLosses
      });
    } catch (error) {
      console.error(`${config.name}|[active-holdings-api]|Error fetching active holdings: ${error}`, 0, req);
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
        data: profitLoss
      });
    } catch (error) {
      console.error(`${config.name}|[get-total-profit-loss-api]|Error fetching total profit/loss: ${error}`, 0, req);
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
        data: records
      });
    } catch (error) {
      console.error(`${config.name}|[get-profit-losses-api]|Error getting profit/losses: ${error}`, 0, req);
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
      
      const poolData = await getPoolSizeData();
      
      res.json({
        success: true,
        data: {
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
            value: poolData.value.toFixed(2),
            change: parseFloat(poolData.change.toFixed(1))
          }
        }
      });
    } catch (error) {
      console.error(`${config.name}|[performance-metrics-api]|Error fetching performance metrics: ${error}`, 0, req);
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
        endDate: now
      });
      
      // Sort records by timestamp
      records.sort((a, b) => a.Time - b.Time);
      
      // Generate chart data points
      let cumulativeProfitUSD = 0;
      
      // Create daily buckets for the last 30 days
      const dailyProfits = new Map();
      for (let i = 0; i < dataPoints; i++) {
        const date = new Date(startTime + (i * 24 * 60 * 60 * 1000));
        const dateKey = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        dailyProfits.set(dateKey, 0);
      }
      
      // Fill in actual profits for days with activity
      records.forEach(record => {
        const recordDate = new Date(record.Time);
        const dateKey = recordDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
        if (dailyProfits.has(dateKey)) {
          dailyProfits.set(dateKey, (dailyProfits.get(dateKey) || 0) + record.ProfitLossUSDC);
        }
      });
      
      // Create chart data with cumulative profits
      for (const [date, profit] of dailyProfits) {
        cumulativeProfitUSD += profit;
        chartData.push({
          x: date,
          y: parseFloat(cumulativeProfitUSD.toFixed(2))
        });
      }
      
      res.json({
        success: true,
        data: chartData
      });
    } catch (error) {
      console.error(`${config.name}|[agent-performance-chart-api]|Error fetching agent performance chart data: ${error}`, 0, req);
      res.status(500).json({ error: 'Failed to fetch agent performance chart data' });
    }
  })();
});



router.get('/get-pool-data', (req: Request, res: Response) => {
  (async () => {
    try {
      let { wallets } = req.query;
      if (!wallets) {
        wallets = process.env.PRIV_KEY_WALLETS || "";
      }
      const walletsArray = (wallets as string).split(',');
      const tokens: WalletToken[] = [];
      for (const wallet of walletsArray) {
        const data = await getWalletData(wallet);
        tokens.push(...data);
      }
      const mergedTokens = tokens.reduce((acc: WalletToken[], token: WalletToken) => {
        const existingToken = acc.find(t => t.tokenMint === token.tokenMint);
        if (existingToken) {
          existingToken.tokenValueUSDC += token.tokenValueUSDC;
        } else {
          acc.push(token);
        }
        return acc;
      }, []);
      
      // Calculate total value of all tokens
      const calculateTotalValueUSDC = mergedTokens.reduce((acc, token) => acc + token.tokenValueUSDC, 0);
      
      // Sort tokens by value, descending
      const sortedTokens = [...mergedTokens].sort((a, b) => b.tokenValueUSDC - a.tokenValueUSDC);
      
      // Take top 9 tokens
      const topTokens = sortedTokens.slice(0, 9);
      
      // Calculate value of remaining tokens for "Other" category
      let otherTokens = sortedTokens.slice(9);
      let otherValue = 0;
      
      if (otherTokens.length > 0) {
        otherValue = otherTokens.reduce((acc, token) => acc + token.tokenValueUSDC, 0);
        
        // Create an "Other" token if there are more than 9 tokens
        if (otherValue > 0) {
          topTokens.push({
            tokenMint: 'other',
            tokenSymbol: 'Other',
            tokenName: 'Other Tokens',
            balance: 0,
            tokenValueUSDC: otherValue,
            percentage: (otherValue / calculateTotalValueUSDC) * 100
          });
        }
      }
      
      res.json({
        success: true,
        data: {
          poolSizeTotalValueUSDC: calculateTotalValueUSDC,
          tokens: topTokens
        }
      });

    } catch (error) {
      console.error(`${config.name}|[get-pool-data-api]|Error fetching pool data: ${error}`, 0, req);
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
      const chartData = historicalData.map(dataPoint => ({
        x: new Date(dataPoint.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' }),
        y: parseFloat(dataPoint.totalValueUSDC.toFixed(2))
      }));

      const response = {
        success: true,
        data: {
          timeframe: '30d',
          chartData: chartData,
          rawData: historicalData.map(point => ({
            ...point,
            date: new Date(point.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })
          }))
        }
      };

      res.json(response);

    } catch (error) {
      console.error(`${config.name}|[get-pool-historical-data-api]|Error fetching pool historical data: ${error}`, 0, req);
      res.status(500).json({ error: 'Failed to fetch pool historical data' });
    }
  })();
});

router.get('/get-trading-history', (req: Request, res: Response) => {
  (async () => {
    try {
      const { module, limit, offset } = req.query;
      const tradingHistory = await getAllTransactions({ module: module as string, limit: limit ? parseInt(limit as string) : undefined, offset: offset ? parseInt(offset as string) : undefined });
      console.log(`${config.name}|[get-trading-history]| Trading history:`, tradingHistory);
      const historyWithComments = await addComments(tradingHistory);
      console.log(`${config.name}|[get-trading-history]| History with comments:`, historyWithComments);
      res.json({
        success: true,
        data: historyWithComments
      });
    } catch (error) {
      console.error(`${config.name}|[get-trading-history-api]|Error fetching trading history: ${error}`, 0, req);
      res.status(500).json({ error: 'Failed to fetch trading history' });
    }
  })();
});

export default router; 