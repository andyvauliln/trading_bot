import * as express from 'express';
import { Request, Response } from 'express';
import { getWalletData } from './helpers';
import { DateTime } from 'luxon';
import { insertHistoricalData } from './db';
import { InsertHistoricalDataDetails } from './types';
const router = express.Router();

router.get('/make-account-historical-data', (req: Request, res: Response) => {
    (async () => {
        try {
            let { date } = req.query;
            //TODO NEED ROUND TIMES TO INTERVALS
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
            const addresses = process.env.PRIV_KEY_WALLETS?.split(',');
            if (!addresses) {
                res.status(500).json({ error: 'No addresses found' });
                return;
            }
            for (const address of addresses) {
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
                    }
                    insertHistoricalData(insertHistoricalDataDetails);
                }
            }


            res.json({ status: 'success', message: 'Historical data generated successfully' });
        } catch (error) {
            console.error('Error generating historical data:', error);
            res.status(500).json({ status: 'error', message: 'Failed to generate historical data' });
        }
    })();
});


export default router; 