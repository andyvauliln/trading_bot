import { scrapeJsonData } from './scraperClient';
import { Browser } from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Represents gas price information for a blockchain
 */
export interface GasPriceData {
    last_block: number;
    high: string;
    average: string;
    low: string;
    suggest_base_fee: string;
    high_prio_fee: string;
    average_prio_fee: string;
    low_prio_fee: string;
    high_prio_fee_mixed: string;
    average_prio_fee_mixed: string;
    low_prio_fee_mixed: string;
    native_token_usd_price: number;
    eth_usd_price: number;
    high_estimate_time: number;
    average_estimate_time: number;
    low_estimate_time: number;
    high_orign: string;
    average_orign: string;
    low_orign: string;
}

/**
 * Represents the API response structure
 */
export interface GMGNGasPriceResponse {
    /** Response code (0 indicates success) */
    code: number;
    /** Response reason */
    reason: string;
    /** Response message */
    message: string;
    /** Response data containing gas price information */
    data: GasPriceData;
}

/**
 * Represents a record in the gas price history file
 */
interface GasPriceRecord {
    timestamp: string;
    chain: string;
    address: string;
    gas_price_data: GasPriceData;
}

/**
 * Saves gas price data to a JSON file, appending to existing records
 * @param chain - The blockchain chain identifier
 * @param address - The address of the token
 * @param gasPrice - The gas price data to save
 */
export async function save(chain: string, address: string, gasPrice: GasPriceData): Promise<void> {
    try {
        const timestamp = new Date().toISOString();
        const gasPriceRecord: GasPriceRecord = {
            timestamp,
            address,
            chain,
            gas_price_data: gasPrice
        };

        const filePath = path.join(process.cwd(), 'gmgn_api', 'get_gas_price.json');
        
        // Read existing data or initialize empty array
        let existingData: GasPriceRecord[] = [];
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
        existingData.push(gasPriceRecord);

        // Write back to file
        await fs.writeFile(
            filePath,
            JSON.stringify(existingData, null, 2),
            'utf8'
        );

        console.log(`Successfully saved gas price data for ${chain} at ${timestamp}`);
    } catch (error: any) {
        console.error('Error saving gas price data:', error?.message || 'Unknown error');
        throw error;
    }
}

/**
 * Fetches gas price information from GMGN API using scraper
 * @param chain - The blockchain chain (e.g., 'sol' for Solana)
 * @param browser - Optional browser instance to reuse
 * @returns Promise containing gas price information
 */
export async function getGasPriceWithScraper(chain: string = 'sol', address: string, browser?: Browser): Promise<GasPriceData | null> {
    try {
        const baseUrl = 'https://gmgn.ai/api/v1/gas_price';
        const url = `${baseUrl}/${chain}`;
        const data = await scrapeJsonData(url, browser) as GMGNGasPriceResponse;
        
        if (!data || typeof data !== 'object') {
            console.error('Failed to fetch data or invalid response format');
            return null;
        }

        // Save the gas price data
        await save(chain, address, data.data);

        return data.data;
    } catch (error: any) {
        console.error('Error fetching gas price:', error?.message || 'Unknown error');
        return null;
    }
}

/**
 * Example usage:
 * const gasPrice = await getGasPriceWithScraper('sol');
 */