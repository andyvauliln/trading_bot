import { initializeDatabaseTables } from '../db/db.utils';

/**
 * Initialize all database tables
 */
async function init() {
  console.log('Starting database initialization...');
  
  try {
    const success = await initializeDatabaseTables();
    
    if (success) {
      console.log('✅ All database tables initialized successfully');
      process.exit(0);
    } else {
      console.error('⚠️ Some database tables failed to initialize');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error initializing database tables:', error);
    process.exit(1);
  }
}

// Run initialization
init(); 