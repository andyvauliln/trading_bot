import axios from 'axios';
import {config} from '../trades-monitoring/config';
import { DateTime } from 'luxon';
import { retryAxiosRequest } from '../bots/utils/help-functions';
import dotenv from 'dotenv';

dotenv.config();

const API_BASE_URL = process.env.SERVER_URL;
const MAX_API_CHECK_RETRIES = 30; // Try for about 5 minutes (30 * 10s = 300s = 5 minutes)
const API_CHECK_INTERVAL = 10000; // 10 seconds between retries

/**
 * Check if the API is ready and responding
 */
async function isApiReady(): Promise<boolean> {
    try {
        // Try different health check endpoints
        // We don't know which one exists, so we'll try a few common ones
        const endpoints = [
            '/api/health',
            '/health',
            '/api/status',
            '/status',
            // Try the actual endpoint we need as a last resort
            '/api/make-account-historical-data'
        ];
        
        // Try one endpoint at a time
        for (const endpoint of endpoints) {
            try {
                const response = await axios.get(`${API_BASE_URL}${endpoint}`, {
                    timeout: 5000 // 5 second timeout
                });
                
                if (response.status >= 200 && response.status < 500) {
                    // Any non-5xx response means the server is running
                    console.log(`[${DateTime.now().toISO()}] API check succeeded with endpoint: ${endpoint}`);
                    return true;
                }
            } catch (error: any) {
                // Specifically check for connection errors vs application errors
                if (
                    error.code === 'ECONNREFUSED' || 
                    error.code === 'ENOTFOUND' || 
                    error.code === 'ETIMEDOUT'
                ) {
                    // Server isn't running at all
                    return false;
                }
                
                // If we get a 404 for this endpoint, that's fine, try the next one
                if (error.response && error.response.status === 404) {
                    continue;
                }
                
                // If we get any other response (even an error), the server is running
                if (error.response) {
                    console.log(`[${DateTime.now().toISO()}] API is running (got status ${error.response.status} for ${endpoint})`);
                    return true;
                }
            }
        }
        
        // If all endpoints fail with connection errors, API is not ready
        return false;
    } catch (error) {
        // If we can't connect at all, API is not ready
        return false;
    }
}

/**
 * Waits for the API to become available
 * Returns true if API becomes available, false if it times out
 */
async function waitForApi(): Promise<boolean> {
    console.log(`[${DateTime.now().toISO()}] Waiting for API at ${API_BASE_URL} to become available...`);
    
    // First attempt
    if (await isApiReady()) {
        console.log(`[${DateTime.now().toISO()}] API is already available.`);
        return true;
    }
    
    // If not immediately ready, start checking periodically
    return new Promise((resolve) => {
        let attempts = 0;
        
        const checkInterval = setInterval(async () => {
            attempts++;
            console.log(`[${DateTime.now().toISO()}] Checking API availability (attempt ${attempts}/${MAX_API_CHECK_RETRIES})...`);
            
            if (await isApiReady()) {
                clearInterval(checkInterval);
                console.log(`[${DateTime.now().toISO()}] API is now available.`);
                resolve(true);
                return;
            }
            
            if (attempts >= MAX_API_CHECK_RETRIES) {
                clearInterval(checkInterval);
                console.error(`[${DateTime.now().toISO()}] Timed out waiting for API after ${attempts} attempts.`);
                resolve(false);
            }
        }, API_CHECK_INTERVAL);
    });
}

/**
 * Fetches historical pool data from the API
 */
async function fetchPoolHistoricData() {
    // First ensure the API is available
    const apiReady = await waitForApi();
    if (!apiReady) {
        console.error(`[${DateTime.now().toISO()}] Cannot proceed with data collection. API is not available.`);
        return;
    }
    
    try {
        console.log(`[${DateTime.now().toISO()}] Starting historical data collection...`);
        
        const response = await retryAxiosRequest(
            () => axios.get(`${API_BASE_URL}/api/make-account-historical-data`),
            3, // maxRetries
            1000, // initialDelay
            1 // processRunCounter
        );
        
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
        console.error('Error fetching pool historic data:', error);
        throw error; // Re-throw to be caught by the main function
    }
}

/**
 * Main function that keeps the process alive for PM2 cron job
 */
async function main() {
    try {
        // Signal to PM2 that we're ready to receive signals
        if (process.send) {
            process.send('ready');
        }
        
        // Run the data fetch immediately on startup
        await fetchPoolHistoricData();
        console.log(`[${DateTime.now().toISO()}] Historical data collection completed, waiting for next scheduled run`);
        
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
        console.error(`[${DateTime.now().toISO()}] Unhandled error in main function:`, error);
        process.exit(1);
    }
}

// Execute the main function instead of directly calling fetchPoolHistoricData
if (require.main === module) {
    main();
}

export { fetchPoolHistoricData };
