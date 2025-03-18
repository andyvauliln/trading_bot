import axios from 'axios';
import {config} from '../trades-monitoring/config';
import { DateTime } from 'luxon';

const API_BASE_URL = `http://localhost:${config.port}`;

async function fetchPoolHistoricData() {
    try {
        const response = await axios.get(`${API_BASE_URL}/api/make-account-historical-data`);
        
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
    }
}

// Execute the function
fetchPoolHistoricData();
