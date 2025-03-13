import * as express from 'express';
import { Request, Response } from 'express';
import { getWalletData, getHistoricalWalletData } from './helpers';
import { DateTime } from 'luxon';
import { insertHistoricalData } from './db';
import { InsertHistoricalDataDetails } from './types';
const router = express.Router();

// Helper function to round time to nearest 4-hour interval
function roundToNearestInterval(dateTime: DateTime): DateTime {
    const hours = dateTime.hour;
    const roundedHours = Math.floor(hours / 4) * 4;
    return dateTime.set({ hour: roundedHours, minute: 0, second: 0, millisecond: 0 });
}

router.get('/make-account-historical-data', (req: Request, res: Response) => {
    (async () => {
        try {
            let { date } = req.query;
            let dateToUse: DateTime;
            
            if (!date) {
                dateToUse = DateTime.now();
            }
            else {
                dateToUse = DateTime.fromFormat(date as string, 'yyyy-MM-dd HH:mm:ss');
                if (!dateToUse.isValid) {
                    res.status(400).json({ error: 'Invalid date format' });
                    return;
                }
            }
            
            // Round time to nearest 4-hour interval
            dateToUse = roundToNearestInterval(dateToUse);
            
            const addresses = process.env.PRIV_KEY_WALLETS?.split(',');
            if (!addresses || addresses.length === 0) {
                res.status(500).json({ error: 'No addresses found' });
                return;
            }
            
            const results: { success: string[], errors: string[] } = { success: [], errors: [] };
            
            for (const address of addresses) {
                try {
                    const tokens = await getWalletData(address);
                    
                    for (const token of tokens) {
                        const insertHistoricalDataDetails: InsertHistoricalDataDetails = {
                            account: address,
                            token: token.tokenMint,
                            symbol: token.tokenSymbol,
                            tokenName: token.tokenName,
                            usdPrice: token.tokenValueUSDC,
                            time: dateToUse,
                            amount: token.balance
                        };
                        
                        const success = await insertHistoricalData(insertHistoricalDataDetails);
                        if (success) {
                            results.success.push(`${token.tokenSymbol} (${address})`);
                        } else {
                            results.errors.push(`Failed to insert ${token.tokenSymbol} (${address})`);
                        }
                    }
                } catch (error) {
                    console.error(`Error processing wallet ${address}:`, error);
                    results.errors.push(`Failed to process wallet ${address}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }

            res.json({ 
                status: results.errors.length === 0 ? 'success' : 'partial_success', 
                message: 'Historical data generation completed',
                time: dateToUse.toISO(),
                results
            });
        } catch (error) {
            console.error('Error generating historical data:', error);
            res.status(500).json({ 
                status: 'error', 
                message: 'Failed to generate historical data', 
                error: error instanceof Error ? error.message : String(error) 
            });
        }
    })();
});

// Endpoint to retrieve historical wallet data
router.get('/historical-wallet-data', (req: Request, res: Response) => {
    (async () => {
        try {
            const { days } = req.query;
            const daysToFetch = days ? parseInt(days as string) : 30;
            
            if (isNaN(daysToFetch) || daysToFetch <= 0 || daysToFetch > 365) {
                return res.status(400).json({ 
                    status: 'error', 
                    message: 'Invalid days parameter. Must be a number between 1 and 365.' 
                });
            }
            
            const historicalData = await getHistoricalWalletData(daysToFetch);
            
            if (historicalData.length === 0) {
                return res.status(404).json({ 
                    status: 'error', 
                    message: 'No historical data found for the specified period.' 
                });
            }
            
            return res.json({
                status: 'success',
                data: historicalData,
                days: daysToFetch,
                count: historicalData.length
            });
        } catch (error) {
            console.error('Error retrieving historical wallet data:', error);
            return res.status(500).json({ 
                status: 'error', 
                message: 'Failed to retrieve historical wallet data',
                error: error instanceof Error ? error.message : String(error)
            });
        }
    })();
});

export default router; 