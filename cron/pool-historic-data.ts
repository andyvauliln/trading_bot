import axios from 'axios';
import {config} from '../trades-monitoring/config';

const API_BASE_URL = `http://localhost:${config.port}`;

async function fetchPoolHistoricData() {
    try {
        const response = await axios.get(`${API_BASE_URL}/pool/historic-data`);
        
        console.info('Successfully fetched pool historic data');
        console.debug('Data received:', response.data);
        
        // Add your data processing logic here
        
    } catch (error) {
        console.error('Error fetching pool historic data:', error);
    }
}

// Execute the function
fetchPoolHistoricData();
