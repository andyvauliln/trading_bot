import path from 'path';

/**
 * Logger configuration
 */
export const config = {
  // Application name (used for logging)
  name: 'Logger',
  
  // Logger settings
  logger: {
    // Database logging
    db_logs: true,
    db_logs_path: path.resolve(process.cwd(), 'data', 'logs.db'),
    
    // File logging
    file_logs: true,
    file_logs_path: path.resolve(process.cwd(), 'logs', 'application.log'),
    
    // Terminal logging
    terminal_logs: true,
    
    // Maximum log retention (days)
    max_log_age_days: 7
  }
}; 