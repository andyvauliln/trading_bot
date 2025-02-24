import { scrapeJsonData, createBrowser } from './scraperClient';
import { Browser } from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Represents slippage information for a token
 */
export interface SlippageData {
    /** Recommended slippage percentage */
    recommend_slippage: string;
    /** Whether the token has a tax */
    has_tax: boolean;
    /** Display slippage percentage */
    display_slippage: string;
    /** Volatility score */
    volatility: number;
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
    /** Response data containing slippage information */
    data: {
        recommend_slippage: string;
        has_tax: boolean;
        display_slippage: string;
        volatility: number;
    };
}

/**
 * Represents a record in the slippage history file
 */
interface SlippageRecord {
    timestamp: string;
    chain: string;
    token_address: string;
    slippage_data: SlippageData;
}

/**
 * Saves slippage data to a JSON file, appending to existing records
 * @param chain - The blockchain chain identifier
 * @param tokenAddress - The token contract address
 * @param slippage - The slippage data to save
 */
export async function save(chain: string, tokenAddress: string, slippage: SlippageData): Promise<void> {
    try {
        const timestamp = new Date().toISOString();
        const slippageRecord: SlippageRecord = {
            timestamp,
            chain,
            token_address: tokenAddress,
            slippage_data: slippage
        };

        const filePath = path.join(process.cwd(), 'gmgn_api', 'get_slippage.json');
        
        // Read existing data or initialize empty array
        let existingData: SlippageRecord[] = [];
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
        existingData.push(slippageRecord);

        // Write back to file
        await fs.writeFile(
            filePath,
            JSON.stringify(existingData, null, 2),
            'utf8'
        );

        console.log(`Successfully saved slippage data for ${chain}:${tokenAddress} at ${timestamp}`);
    } catch (error: any) {
        console.error('Error saving slippage data:', error?.message || 'Unknown error');
        throw error;
    }
}

/**
 * Fetches token slippage information from GMGN API using scraper
 * @param chain - The blockchain chain (e.g., 'sol' for Solana)
 * @param tokenAddress - The token contract address
 * @param browser - Optional browser instance to reuse
 * @returns Promise containing slippage information
 */
export async function getTokenSlippageWithScraper(chain: string = 'sol', tokenAddress: string, browser?: Browser): Promise<SlippageData | null> {
    try {
        const baseUrl = 'https://gmgn.ai/api/v1/recommend_slippage';
        const url = `${baseUrl}/${chain}/${tokenAddress}`;
        const data = await scrapeJsonData(url, browser) as GMGNResponse;
        
        if (!data || typeof data !== 'object') {
            console.error('Failed to fetch data or invalid response format');
            return null;
        }

        const slippage: SlippageData = {
            recommend_slippage: data.data.recommend_slippage,
            has_tax: data.data.has_tax,
            display_slippage: data.data.display_slippage,
            volatility: data.data.volatility
        };

        // Save the slippage data
        await save(chain, tokenAddress, slippage);

        return slippage;
    } catch (error: any) {
        console.error('Error fetching token slippage:', error?.message || 'Unknown error');
        return null;
    }
}

/**
 * Example usage:
 * const slippage = await getTokenSlippage('sol', '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN');
 */
