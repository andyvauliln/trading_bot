import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

// Load environment variables from the .env file
dotenv.config();

// Get the number of days to keep logs from environment variable
const keepDays = parseInt(process.env.LOGS_DAYS_TO_KEEP || '10');

/**
 * Database cleaner script
 * Deletes logs older than 10 days from all logger tables
 * 
 * This script is meant to be run daily via a cron job at midnight
 */
async function cleanDatabaseLogs() {
  console.log('[clean-db-logs] Starting log cleanup process');
  
  const dbPath = path.resolve(process.cwd(), 'data', 'app-logs.db');
  
  // Check if database exists
  if (!fs.existsSync(dbPath)) {
    console.log(`[clean-db-logs] Database file not found at ${dbPath}`);
    return;
  }
  
  try {
    // Open database connection
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database
    });
    
    // Configure SQLite for better concurrency
    await db.exec('PRAGMA journal_mode = WAL');
    await db.exec('PRAGMA busy_timeout = 10000');
    
    
    // Calculate the cutoff date (10 days ago)
    const date = new Date();
    date.setDate(date.getDate() - keepDays);
    const cutoffDate = date.toISOString().split('T')[0]; // Format as YYYY-MM-DD
    
    console.log(`[clean-db-logs] Will delete logs older than ${cutoffDate}`);
    
    // Get all tables in the database
    const tables = await db.all(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `);
    
    // Start a transaction for better performance and atomic operations
    await db.exec('BEGIN TRANSACTION');
    
    let totalDeletedRows = 0;
    
    try {
      // Process each table
      for (const { name: tableName } of tables) {
        // Check if this table has a date column (all logger tables should have it)
        const tableInfo = await db.all(`PRAGMA table_info(${tableName})`);
        const hasDateColumn = tableInfo.some(column => column.name === 'date');
        
        if (hasDateColumn) {
          // This appears to be a logger table, delete old logs
          console.log(`[clean-db-logs] Processing table: ${tableName}`);
          
          // Get count of rows to be deleted for logging purposes
          const countResult = await db.get(`
            SELECT COUNT(*) as count 
            FROM ${tableName} 
            WHERE date < ?
          `, cutoffDate);
          
          if (countResult.count > 0) {
            // Delete old logs
            const result = await db.run(`
              DELETE FROM ${tableName} 
              WHERE date < ?
            `, cutoffDate);
            
            const deletedRows = result.changes || 0;
            console.log(`[clean-db-logs] Deleted ${deletedRows} rows from ${tableName}`);
            totalDeletedRows += deletedRows;
          } else {
            console.log(`[clean-db-logs] No logs to delete from ${tableName}`);
          }
        } else {
          console.log(`[clean-db-logs] Skipping table ${tableName} (not a logger table)`);
        }
      }
      
      // Commit the transaction
      await db.exec('COMMIT');
      console.log(`[clean-db-logs] Successfully deleted ${totalDeletedRows} log entries older than ${cutoffDate}`);
      
      // Optimize database after large deletions
      console.log('[clean-db-logs] Running VACUUM to optimize database size');
      await db.exec('VACUUM');
      
    } catch (error) {
      // Rollback on error
      await db.exec('ROLLBACK');
      throw error;
    } finally {
      // Close the database connection
      await db.close();
    }
    
    console.log('[clean-db-logs] Log cleanup completed successfully');
    
  } catch (error) {
    console.error('[clean-db-logs] Error during log cleanup:', error);
    throw error;  // Re-throw to be caught by the main function
  }
}

/**
 * Main function that keeps the process alive for PM2 cron job
 */
async function main() {
  try {
    // Run the cleanup immediately on startup
    await cleanDatabaseLogs();
    console.log('[clean-db-logs] Cleanup completed, waiting for next scheduled run');
    
    // For a PM2 cron job, we need to keep the process alive
    // PM2 will restart this process according to cron_restart setting
    
    // If this is NOT being run by PM2 cron (e.g., direct execution), exit
    if (!process.env.PM2_HOME) {
      process.exit(0);
    }
    
    // Otherwise, keep the process alive
    setInterval(() => {
      // This interval keeps the Node.js event loop active
      // PM2 will handle the cron schedule and restart when needed
    }, 24 * 60 * 60 * 1000); // No need to do anything in this interval
  } catch (error) {
    console.error('[clean-db-logs] Unhandled error in main function:', error);
    process.exit(1);
  }
}

// Execute the main function
if (require.main === module) {
  main();
}

export { cleanDatabaseLogs };
