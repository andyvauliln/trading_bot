import * as express from 'express';
import { Request, Response } from 'express';
import * as sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { config } from '../bots/tracker-bot/config';
import { TAGS } from "../bots/utils/log-tags";

const router = express.Router();

// Initialize database connection and create table if not exists
const initDb = async (db_path: string) => {
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
      const { limit } = req.query;

      // Validate limit if provided
      let parsedLimit: number | undefined;
      if (limit) {
        parsedLimit = parseInt(limit as string, 10);
        if (isNaN(parsedLimit) || parsedLimit < 1) {
          parsedLimit = 3;
        }
      }
      const db = await initDb();

      const targetLogs = [];
      const tableNames = ['logger', 'tracker', 'discord', 'telegram', 'database', 'api', 'helpers', 'trades-monitoring'];
      for (const tableName of tableNames) {
        // Initialize DB and ensure table exists
        const tableExists = await checkTableExists(db, tableName);
        if (!tableExists) {
          return res.status(500).json({ error: 'Table does not exist' });
        }
        
        let query = `
          SELECT *
          FROM ${tableName}
          WHERE tag = ${TAGS.sell_tx_confirmed.name} or tag = ${TAGS.buy_tx_confirmed.name} or tag = ${TAGS.rug_validation.name} or tag = ${TAGS.telegram_ai_token_analysis.name}
          ORDER BY date DESC, time DESC
          ${parsedLimit ? 'LIMIT ?' : ''}
        `;
      
        const params = [];
        if (parsedLimit) params.push(parsedLimit);
        
        const logs = await db.all(query, ...params);
      
        // Parse JSON data field
        const parsedLogs = logs.map(log => ({
          ...log,
          data: log.data ? JSON.parse(log.data) : null
        }));
        
        targetLogs.push(...parsedLogs);

      }
      res.json({
        data: {logs: targetLogs, tags: [TAGS.sell_tx_confirmed, TAGS.buy_tx_confirmed, TAGS.rug_validation, TAGS.telegram_ai_token_analysis]},
        success: true
      });
      await db.close();
    } catch (error) {
      console.error(`${config.name}|[logs-api]|Error fetching logs:`, 0, error);
      res.status(500).json({ error: 'Failed to fetch logs', success: false });
    }
  })();
});

export default router; 