import * as express from 'express';
import { Request, Response } from 'express';
import { 
  initDatabaseConnection, 
  createTableLogs, 
  validateModuleName, 
  validateDateFormat, 
  getLogs, 
  getLogsByTags 
} from '../db/db.logs';
import { TAGS } from "../common/logger";
import { config } from './config';
const router = express.Router();

// Get logs with module and date parameters
router.get('/logs', (req: Request, res: Response) => {
  (async () => {
    try {
      const { module, date, limit } = req.query;

      // Validate required parameters
      if (!module) {
        return res.status(400).json({
          error: 'Module parameter is required'
        });
      }

      // Validate and sanitize module name for table lookup
      if (!validateModuleName(module as string)) {
        return res.status(400).json({
          error: 'Invalid module name format'
        });
      }

      // Validate date format if provided
      if (date && !validateDateFormat(date as string)) {
        return res.status(400).json({ 
          error: 'Invalid date format. Please use YYYY-MM-DD format.' 
        });
      }

      // Validate limit if provided
      let parsedLimit: number | undefined;
      if (limit) {
        parsedLimit = parseInt(limit as string, 10);
        if (isNaN(parsedLimit) || parsedLimit < 1) {
          return res.status(400).json({
            error: 'Limit must be a positive number'
          });
        }
      }

      // Initialize DB and ensure table exists
      const db = await initDatabaseConnection(module as string);
      const tableExists = await createTableLogs(db, module as string);
      if (!tableExists) {
        await db.close();
        return res.status(500).json({ error: 'Failed to access logs table' });
      }
      
      // Get logs with provided filters
      const logs = await getLogs(db, module as string, { 
        date: date as string | undefined, 
        limit: parsedLimit 
      });
      
      res.json({
        module,
        date: date || null,
        limit: parsedLimit || null,
        count: logs.length,
        logs
      });
      
      await db.close();
    } catch (error) {
      console.error(`${config.name}|[logs-api]|Error fetching logs:`, 0, error);
      res.status(500).json({ error: 'Failed to fetch logs' });
    }
  })();
});

router.get('/live-logs', (req: Request, res: Response) => {
  (async () => {
    try {
      //TODO: DO SOMETHING WITH THIS, not need hardcore
      const modules = ['solana-sniper-bot', 'telegram-trading-bot', 'tracker-bot'];
      const targetLogs = [];
      
      const tags = [
        TAGS.sell_tx_confirmed.name,
        TAGS.buy_tx_confirmed.name,
        TAGS.rug_validation.name,
        TAGS.telegram_ai_token_analysis.name
      ];
     
      for (const module of modules) {
        const db = await initDatabaseConnection(module);
        
        // Initialize DB and ensure table exists
        const tableExists = await createTableLogs(db, module);
        if (!tableExists) {
          await db.close();
          return res.status(500).json({ error: 'Failed to access logs table' });
        }
        
        // Get logs filtered by specified tags
        const logs = await getLogsByTags(db, module, tags, 5);
        
        targetLogs.push(...logs);
        await db.close();
      }
      
      res.json({
        data: {
          logs: targetLogs, 
          tags: [
            TAGS.sell_tx_confirmed, 
            TAGS.buy_tx_confirmed, 
            TAGS.rug_validation, 
            TAGS.telegram_ai_token_analysis
          ]
        },
        success: true
      });
     
    } catch (error) {
      console.error(`${config.name}|[logs-api]|Error fetching logs:`, 0, error);
      res.status(500).json({ error: 'Failed to fetch logs', success: false });
    }
  })();
});

export default router; 