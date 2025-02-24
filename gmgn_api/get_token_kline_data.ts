import { scrapeJsonData, createBrowser } from './scraperClient';
import { Browser } from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Represents kline (candlestick) data for a token
 */
export interface KlineData {
    /** Opening price */
    open: string;
    /** Closing price */
    close: string;
    /** Highest price */
    high: string;
    /** Lowest price */
    low: string;
    /** Timestamp in milliseconds */
    time: string;
    /** Trading volume */
    volume: string;
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
    message: string;
    /** Response data containing kline information */
    data: {
        list: KlineData[];
    };
}

/**
 * Represents a record in the kline history file
 */
interface KlineRecord {
    timestamp: string;
    chain: string;
    token_address: string;
    resolution: string;
    from: number;
    to: number;
    kline_data: KlineData[];
}

/**
 * Saves kline data to a JSON file, appending to existing records
 * @param chain - The blockchain chain identifier
 * @param tokenAddress - The token contract address
 * @param resolution - The time resolution (e.g., '1m' for 1 minute)
 * @param from - Start timestamp
 * @param to - End timestamp
 * @param klineData - The kline data to save
 */
export async function save(
    chain: string,
    tokenAddress: string,
    resolution: string,
    from: number,
    to: number,
    klineData: KlineData[]
): Promise<void> {
    try {
        const timestamp = new Date().toISOString();
        const klineRecord: KlineRecord = {
            timestamp,
            chain,
            token_address: tokenAddress,
            resolution,
            from,
            to,
            kline_data: klineData
        };

        const filePath = path.join(process.cwd(), 'gmgn_api', 'get_token_kline_data.json');
        
        // Read existing data or initialize empty array
        let existingData: KlineRecord[] = [];
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
        existingData.push(klineRecord);

        // Write back to file
        await fs.writeFile(
            filePath,
            JSON.stringify(existingData, null, 2),
            'utf8'
        );

        console.log(`Successfully saved kline data for ${chain}:${tokenAddress} at ${timestamp}`);
    } catch (error: any) {
        console.error('Error saving kline data:', error?.message || 'Unknown error');
        throw error;
    }
}

/**
 * Fetches token kline data from GMGN API using scraper
 * @param chain - The blockchain chain (e.g., 'sol' for Solana)
 * @param tokenAddress - The token contract address
 * @param resolution - The time resolution (e.g., '1m' for 1 minute)
 * @param from - Start timestamp
 * @param to - End timestamp
 * @param browser - Optional browser instance to reuse
 * @returns Promise containing kline information
 */
export async function getTokenKlineDataWithScraper(
    chain: string = 'sol',
    tokenAddress: string,
    resolution: string = '1m',
    from: number,
    to: number,
    browser?: Browser
): Promise<KlineData[] | null> {
    try {
        const baseUrl = 'https://gmgn.ai/api/v1/token_kline';
        const url = `${baseUrl}/${chain}/${tokenAddress}?&resolution=${resolution}&from=${from}&to=${to}`;
        const data = await scrapeJsonData(url, browser) as GMGNResponse;
        
        if (!data || typeof data !== 'object') {
            console.error('Failed to fetch data or invalid response format');
            return null;
        }

        const klineData = data.data.list;

        // Save the kline data
        await save(chain, tokenAddress, resolution, from, to, klineData);

        return klineData;
    } catch (error: any) {
        console.error('Error fetching token kline data:', error?.message || 'Unknown error');
        return null;
    }
}

/**
 * Example usage:
 * const klineData = await getTokenKlineDataWithScraper('sol', '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN', '1m', 1740116640, 1740116656);
 */