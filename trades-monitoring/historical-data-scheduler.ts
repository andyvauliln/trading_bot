import axios from 'axios';
import { DateTime } from 'luxon';
import * as cron from 'node-cron';
import { config } from './config';

// Function to call the historical data API
async function collectHistoricalData(): Promise<void> {
    try {
        console.log(`[${DateTime.now().toISO()}] Starting historical data collection...`);
        
        // Call the API endpoint to collect historical data
        const response = await axios.get(`http://localhost:${config.port}/api/make-account-historical-data`);
        
        if (response.data.status === 'success' || response.data.status === 'partial_success') {
            console.log(`[${DateTime.now().toISO()}] Historical data collection completed successfully.`);
            console.log(`Time: ${response.data.time}`);
            console.log(`Success count: ${response.data.results.success.length}`);
            
            if (response.data.results.errors.length > 0) {
                console.warn(`Errors encountered: ${response.data.results.errors.length}`);
                console.warn(response.data.results.errors);
            }
        } else {
            console.error(`[${DateTime.now().toISO()}] Historical data collection failed:`, response.data);
        }
    } catch (error) {
        console.error(`[${DateTime.now().toISO()}] Error collecting historical data:`, error);
    }
}

// Schedule the task to run every 4 hours
// The cron pattern '0 */4 * * *' means: at minute 0, every 4 hours, every day, every month, any day of the week
cron.schedule('0 */4 * * *', collectHistoricalData);

// Also run immediately on startup
collectHistoricalData();

console.log(`[${DateTime.now().toISO()}] Historical data scheduler started. Will collect data every 4 hours.`);

// Keep the process running
process.on('SIGINT', () => {
    console.log(`[${DateTime.now().toISO()}] Historical data scheduler stopped.`);
    process.exit(0);
}); 