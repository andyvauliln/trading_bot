import * as express from 'express';
import { Request, Response } from 'express';
import * as sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { TAGS } from "../bots/utils/log-tags";
import { config } from './config';
import path from 'path';
const router = express.Router();

// Initialize database connection and create table if not exists
const initDb = async (module: string) => {
  const db_path = path.resolve(process.cwd(), 'data', `${module}-logs.db`);
  console.log(`${config.name}|[logs-api]|DB: ${db_path}`);
  const db = await open({
    filename: db_path,
    driver: sqlite3.Database
  });
  return db;
};

const checkTableExists = async (db: any,tableName: string) => {
  // Create logs table if it doesn't exist
  try {
    await db.exec(`
      CREATE TABLE IF NOT EXISTS ${tableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT,
        time TEXT,
        run_prefix TEXT,
        full_message TEXT,
        message TEXT,
        module TEXT,
        function TEXT,
        type TEXT,
        data TEXT,
        cycle INTEGER,
        tag TEXT
      )
    `);
    return true;
  } catch (error) {
    console.error(`${config.name}|[checkTableExists]|Error creating table:`, 0, error);
    return false;
  }
};

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
      if (typeof module !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(module)) {
        return res.status(400).json({
          error: 'Invalid module name format'
        });
      }

      // Validate date format if provided
      if (date && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
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

      const tableName = module.replace(/-/g, '_');
      
      // Initialize DB and ensure table exists
      const db = await initDb(module);
      const tableExists = await checkTableExists(db, tableName);
      if (!tableExists) {
        return res.status(500).json({ error: 'Table does not exist' });
      }
      
      let query = `
        SELECT *
        FROM ${tableName}
        ${date ? 'WHERE date = ?' : ''}
        ORDER BY date DESC, time DESC
        ${parsedLimit ? 'LIMIT ?' : ''}
      `;
      
      const params = [];
      if (date) params.push(date);
      if (parsedLimit) params.push(parsedLimit);
      
      const logs = await db.all(query, ...params);
      
      // Parse JSON data field
      const parsedLogs = logs.map(log => ({
        ...log,
        data: log.data ? JSON.parse(log.data) : null
      }));
      
      res.json({
        module,
        date: date || null,
        limit: parsedLimit || null,
        count: parsedLogs.length,
        logs: parsedLogs
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
     
      for (const module of modules) {
        const db = await initDb(module);
        console.log(`${config.name}|[logs-api]|DB: ${db}`);
        // Initialize DB and ensure table exists
        const tableName = module.replace(/-/g, '_');
        console.log(`${config.name}|[logs-api]|Table: ${tableName}`);
        const tableExists = await checkTableExists(db, tableName);
        if (!tableExists) {
          return res.status(500).json({ error: 'Table does not exist' });
        }
        
        // Using parameterized query for safety
        const sellTag = TAGS.sell_tx_confirmed.name;
        const buyTag = TAGS.buy_tx_confirmed.name;
        const rugTag = TAGS.rug_validation.name;
        const telegramTag = TAGS.telegram_ai_token_analysis.name;
        
        const query = `
          SELECT *
          FROM ${tableName}
          WHERE tag = ? OR tag = ? OR tag = ? OR tag = ?
          ORDER BY date DESC, time DESC LIMIT 5
        `;
        console.log(`${config.name}|[logs-api]|Query with parameters: ${query} [${sellTag}, ${buyTag}, ${rugTag}, ${telegramTag}]`);
      
        const logs = await db.all(query, sellTag, buyTag, rugTag, telegramTag);
      
        // Parse JSON data field
        const parsedLogs = logs.map(log => ({
          ...log,
          data: log.data ? JSON.parse(log.data) : null
        }));
        
        targetLogs.push(...parsedLogs);
        await db.close();
      }
      res.json({
        data: {logs: targetLogs, tags: [TAGS.sell_tx_confirmed, TAGS.buy_tx_confirmed, TAGS.rug_validation, TAGS.telegram_ai_token_analysis]},
        success: true
      });
     
    } catch (error) {
      console.error(`${config.name}|[logs-api]|Error fetching logs:`, 0, error);
      res.status(500).json({ error: 'Failed to fetch logs', success: false });
    }
  })();
});

export default router; 