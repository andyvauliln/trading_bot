import { scrapeJsonData } from './scraperClient';
import { Browser } from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Represents a single data point in the trends
 */
export interface TrendDataPoint {
    /** Unix timestamp */
    timestamp: number;
    /** Value for this data point */
    value: string;
}

/**
 * Represents all available trend types
 */
export interface TokenTrends {
    /** Average holding balance trend */
    avg_holding_balance: TrendDataPoint[];
    /** Holder count trend */
    holder_count: TrendDataPoint[];
    /** Top 10 holder percentage trend */
    top10_holder_percent: TrendDataPoint[];
    /** Blue chip owner percentage trend */
    bluechip_owner_percent: TrendDataPoint[];
    /** Insider percentage trend */
    insider_percent: TrendDataPoint[];
}

/**
 * Represents the API response structure
 */
export interface GMGNResponse {
    /** Response code (0 indicates success) */
    code: number;
    /** Response reason */
    reason: string;
    /** Response message */
    msg: string;
    /** Response data containing trends information */
    data: {
        trends: TokenTrends;
    };
}

/**
 * Represents a record in the token trends history file
 */
interface TokenTrendsRecord {
    timestamp: string;
    chain: string;
    token_address: string;
    trends_data: TokenTrends;
}

/**
 * Saves token trends data to a JSON file, appending to existing records
 * @param chain - The blockchain chain identifier
 * @param tokenAddress - The token contract address
 * @param trends - The trends data to save
 */
export async function save(chain: string, tokenAddress: string, trends: TokenTrends): Promise<void> {
    try {
        const timestamp = new Date().toISOString();
        const trendsRecord: TokenTrendsRecord = {
            timestamp,
            chain,
            token_address: tokenAddress,
            trends_data: trends
        };

        const filePath = path.join(process.cwd(), 'gmgn_api', 'get_token_trades_by_type.json');
        
        // Read existing data or initialize empty array
        let existingData: TokenTrendsRecord[] = [];
        try {
            const fileContent = await fs.readFile(filePath, 'utf8');
            const parsedData = JSON.parse(fileContent);
            if (Array.isArray(parsedData)) {
                existingData = parsedData;
            }
        } catch (err) {
            // File doesn't exist or is invalid, start with empty array
            existingData = [];
        }

        // Append new record
        existingData.push(trendsRecord);

        // Write back to file
        await fs.writeFile(
            filePath,
            JSON.stringify(existingData, null, 2),
            'utf8'
        );

        console.log(`Successfully saved token trends data for ${chain}:${tokenAddress} at ${timestamp}`);
    } catch (error: any) {
        console.error('Error saving token trends data:', error?.message || 'Unknown error');
        throw error;
    }
}

/**
 * Fetches token trends information from GMGN API using scraper
 * @param chain - The blockchain chain (e.g., 'sol' for Solana)
 * @param tokenAddress - The token contract address
 * @param browser - Optional browser instance to reuse
 * @returns Promise containing trends information
 */
export async function getTokenTrendsByType(chain: string = 'sol', tokenAddress: string, browser?: Browser): Promise<TokenTrends | null> {
    try {
        const baseUrl = 'https://gmgn.ai/api/v1/token_trends';
        const trendTypes = [
            'avg_holding_balance',
            'holder_count',
            'top10_holder_percent',
            'bluechip_owner_percent',
            'insider_percent'
        ];
        
        const queryParams = trendTypes.map(type => `trends_type=${type}`).join('&');
        const url = `${baseUrl}/${chain}/${tokenAddress}?${queryParams}`;
        
        const data = await scrapeJsonData(url, browser) as GMGNResponse;
        
        if (!data || typeof data !== 'object' || !data.data?.trends) {
            console.error('Failed to fetch data or invalid response format');
            return null;
        }

        const trends: TokenTrends = data.data.trends;

        // Save the trends data
        await save(chain, tokenAddress, trends);

        return trends;
    } catch (error: any) {
        console.error('Error fetching token trends:', error?.message || 'Unknown error');
        return null;
    }
}

/**
 * Example usage:
 * const trends = await getTokenTrendsByType('sol', '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN');
 */