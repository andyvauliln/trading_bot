import express, { Request, Response } from 'express';
import * as sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { config } from '../bots/tracker-bot/config';

const router = express.Router();

// Initialize database connection
const initDb = async () => {
  return await open({
    filename: config.logger.db_logs_path,
    driver: sqlite3.Database
  });
};

// Get logs with module and date parameters
router.get('/logs', (req: Request, res: Response) => {
  (async () => {
    try {
      const db = await initDb();
      const { module, date } = req.query;

      // Validate required parameters
      if (!module || !date) {
        return res.status(400).json({
          error: 'Both module and date parameters are required'
        });
      }

      // Validate date format
      if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ 
          error: 'Invalid date format. Please use YYYY-MM-DD format.' 
        });
      }

      // Validate and sanitize module name for table lookup
      if (typeof module !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(module)) {
        return res.status(400).json({
          error: 'Invalid module name format'
        });
      }

      const tableName = module.replace(/-/g, '_');
      
      const query = `
        SELECT *
        FROM ${tableName}
        WHERE date = ?
        ORDER BY time ASC
      `;
      
      const logs = await db.all(query, date);
      
      // Parse JSON data field
      const parsedLogs = logs.map(log => ({
        ...log,
        data: log.data ? JSON.parse(log.data) : null
      }));
      
      res.json({
        module,
        date,
        count: parsedLogs.length,
        logs: parsedLogs
      });
      
      await db.close();
    } catch (error) {
      console.error('Error fetching logs:', error);
      res.status(500).json({ error: 'Failed to fetch logs' });
    }
  })();
});

export default router; 