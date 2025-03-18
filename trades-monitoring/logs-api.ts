import * as express from 'express';
import { Request, Response } from 'express';
import * as sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { config } from '../bots/tracker-bot/config';

const router = express.Router();

// Initialize database connection and create table if not exists
const initDb = async (tableName: string) => {
  const db = await open({
    filename: config.logger.db_logs_path,
    driver: sqlite3.Database
  });

  // Create logs table if it doesn't exist
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
  console.log('[api]|[initDb]|Table created',0,{tableName:tableName});
  return db;
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
      const db = await initDb(tableName);
      
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
      console.log('[api]|[logs-api]|Error fetching logs:', 0, error);
      res.status(500).json({ error: 'Failed to fetch logs' });
    }
  })();
});

export default router; 