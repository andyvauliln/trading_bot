import axios from 'axios';
import { DateTime } from 'luxon';
import { config } from './config';
const BASE_URL = `http://localhost:${config.port}`; // adjust port if different

// Helper function to format test results
const formatResponse = (endpoint: string, success: boolean, data: any, error?: any) => {
    console.log('\n' + '='.repeat(50));
    console.log(`Testing endpoint: ${endpoint}`);
    console.log(`Status: ${success ? 'SUCCESS ✅' : 'FAILED ❌'}`);
    if (success) {
        console.log('Response data:', JSON.stringify(data, null, 2));
    } else {
        console.log('Error:', error);
    }
    console.log('='.repeat(50) + '\n');
};

// Test functions for each endpoint
async function testBotsApi() {
    try {
        // Test active holdings
        const holdingsResponse = await axios.get(`${BASE_URL}/api/active-holdings`);
        formatResponse('/api/active-holdings', true, holdingsResponse.data);

        // Test active holdings with module filter
        const holdingsWithModuleResponse = await axios.get(`${BASE_URL}/api/active-holdings?module=tracker-bot`);
        formatResponse('/api/active-holdings?module=tracker-bot', true, holdingsWithModuleResponse.data);

        // Test total profit/loss
        const profitLossResponse = await axios.get(`${BASE_URL}/api/get-total-profit-loss`);
        formatResponse('/api/get-total-profit-loss', true, profitLossResponse.data);

        // Test total profit/loss with module
        const profitLossModuleResponse = await axios.get(`${BASE_URL}/api/get-total-profit-loss?module=tracker-bot`);
        formatResponse('/api/get-total-profit-loss?module=tracker-bot', true, profitLossModuleResponse.data);

    } catch (error) {
        formatResponse('Bots API', false, null, error);
    }
}

async function testHistoricalDataApi() {
    try {
        // Test current time
        const currentResponse = await axios.get(`${BASE_URL}/api/make-account-historical-data`);
        formatResponse('/api/make-account-historical-data (current)', true, currentResponse.data);

        // Test specific date
        const specificDate = DateTime.now().minus({ days: 1 }).toFormat('yyyy-MM-dd HH:mm:ss');
        const dateResponse = await axios.get(`${BASE_URL}/api/make-account-historical-data?date=${specificDate}`);
        formatResponse('/api/make-account-historical-data (specific date)', true, dateResponse.data);

    } catch (error) {
        formatResponse('Historical Data API', false, null, error);
    }
}

async function testLogsApi() {
    try {
        
        // Test logs with module and date
        const logsResponse = await axios.get(`${BASE_URL}/api/logs?limit=10&module=tracker-bot`);
        formatResponse('/api/logs', true, logsResponse.data);

        const liveLogsResponse = await axios.get(`${BASE_URL}/api/live-logs`);
        formatResponse('/api/live-logs', true, liveLogsResponse.data);

    } catch (error) {
        formatResponse('Logs API', false, null, error);
    }
}

async function testProfitLossesApi() {
    try {
        // Test profit losses with default parameters
        const profitLossesResponse = await axios.get(`${BASE_URL}/api/get-profit-losses`);
        formatResponse('/api/get-profit-losses (default)', true, profitLossesResponse.data);

        // Test profit losses with parameters
        const queryParams = new URLSearchParams({
            startDate: (Date.now() - 7 * 24 * 60 * 60 * 1000).toString(),
            endDate: Date.now().toString(),
            limit: '10',
            offset: '0',
            module: 'tracker-bot'
        });
        const filteredResponse = await axios.get(`${BASE_URL}/api/get-profit-losses?${queryParams}`);
        formatResponse('/api/get-profit-losses (with filters)', true, filteredResponse.data);

    } catch (error) {
        formatResponse('Profit Losses API', false, null, error);
    }
}

async function testPerformanceMetricsApi() {
    try {
        const response = await axios.get(`${BASE_URL}/api/performance-metrics`);
        formatResponse('/api/performance-metrics', true, response.data);
    } catch (error) {
        formatResponse('Performance Metrics API', false, null, error);
    }
}

async function testAgentPerformanceChartApi() {
    try {
        const response = await axios.get(`${BASE_URL}/api/agent-performance-chart`);
        formatResponse('/api/agent-performance-chart', true, response.data);
    } catch (error) {
        formatResponse('Agent Performance Chart API', false, null, error);
    }
}

async function testPoolDataApi() {
    try {
        // Test pool data without specific wallets
        const defaultResponse = await axios.get(`${BASE_URL}/api/get-pool-data`);
        formatResponse('/api/get-pool-data (default)', true, defaultResponse.data);

        // Test pool data with specific wallets if available
        if (process.env.PRIV_KEY_WALLETS) {
            const walletsResponse = await axios.get(`${BASE_URL}/api/get-pool-data?wallets=${process.env.PRIV_KEY_WALLETS}`);
            formatResponse('/api/get-pool-data (with wallets)', true, walletsResponse.data);
        }
    } catch (error) {
        formatResponse('Pool Data API', false, null, error);
    }
}

async function testPoolHistoricalDataApi() {
    try {
        const response = await axios.get(`${BASE_URL}/api/get-pool-historical-data`);
        formatResponse('/api/get-pool-historical-data', true, response.data);
    } catch (error) {
        formatResponse('Pool Historical Data API', false, null, error);
    }
}

async function testTradingHistoryApi() {
    try {
        // Test trading history with default parameters
        const defaultResponse = await axios.get(`${BASE_URL}/api/get-trading-history`);
        formatResponse('/api/get-trading-history (default)', true, defaultResponse.data);

        // Test trading history with parameters
        const queryParams = new URLSearchParams({
            module: 'tracker-bot',
            limit: '10',
            offset: '0'
        });
        const filteredResponse = await axios.get(`${BASE_URL}/api/get-trading-history?${queryParams}`);
        formatResponse('/api/get-trading-history (with filters)', true, filteredResponse.data);
    } catch (error) {
        formatResponse('Trading History API', false, null, error);
    }
}

// Main test function
async function runAllTests() {
    console.log('Starting API tests...\n');

    console.log('Testing Historical Data API endpoints...');
    await testHistoricalDataApi();
    
    console.log('Testing Bots API endpoints...');
    await testBotsApi();
    
    console.log('Testing Logs API endpoints...');
    await testLogsApi();

    console.log('Testing Profit Losses API endpoints...');
    await testProfitLossesApi();

    console.log('Testing Performance Metrics API endpoints...');
    await testPerformanceMetricsApi();

    console.log('Testing Agent Performance Chart API endpoints...');
    await testAgentPerformanceChartApi();

    console.log('Testing Pool Data API endpoints...');
    await testPoolDataApi();

    console.log('Testing Pool Historical Data API endpoints...');
    await testPoolHistoricalDataApi();

    console.log('Testing Trading History API endpoints...');
    await testTradingHistoryApi();
    
    console.log('\nAll tests completed!');
}

// Run the tests
runAllTests().catch(error => {
    console.error('Error running tests:', error);
}); 