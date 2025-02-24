import { scrapeJsonData, createBrowser } from './scraperClient';
import { Browser } from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Represents lock information for a token
 */
export interface LockInfo {
    is_locked: boolean;
    lock_detail: any | null;
    lock_tags: any | null;
    lock_percent: string;
    left_lock_percent: string;
}

/**
 * Represents security information for a token
 */
export interface SecurityData {
    address: string;
    is_show_alert: boolean;
    top_10_holder_rate: string;
    renounced_mint: boolean;
    renounced_freeze_account: boolean;
    burn_ratio: string;
    burn_status: string;
    dev_token_burn_amount: string;
    dev_token_burn_ratio: string;
    is_open_source: boolean | null;
    open_source: number;
    is_blacklist: boolean | null;
    blacklist: number;
    is_honeypot: boolean | null;
    honeypot: number;
    is_renounced: boolean | null;
    renounced: boolean | null;
    can_sell: number;
    can_not_sell: number;
    buy_tax: string;
    sell_tax: string;
    average_tax: string;
    high_tax: string;
    flags: string[];
    lockInfo: any | null;
    lock_summary: LockInfo;
    hide_risk: boolean;
}

/**
 * Represents the API response structure
 */
export interface GMGNResponse {
    code: number;
    reason: string;
    message: string;
    data: {
        address: string;
        security: SecurityData;
        launchpad: any | null;
    };
}

/**
 * Represents a record in the security history file
 */
interface SecurityRecord {
    timestamp: string;
    chain: string;
    token_address: string;
    security_data: SecurityData;
}

/**
 * Saves security data to a JSON file, appending to existing records
 * @param chain - The blockchain chain identifier
 * @param tokenAddress - The token contract address
 * @param security - The security data to save
 */
export async function save(chain: string, tokenAddress: string, security: SecurityData): Promise<void> {
    try {
        const timestamp = new Date().toISOString();
        const securityRecord: SecurityRecord = {
            timestamp,
            chain,
            token_address: tokenAddress,
            security_data: security
        };

        const filePath = path.join(process.cwd(), 'gmgn_api', 'get_token_security_launchpad.json');
        
        // Read existing data or initialize empty array
        let existingData: SecurityRecord[] = [];
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
        existingData.push(securityRecord);

        // Write back to file
        await fs.writeFile(
            filePath,
            JSON.stringify(existingData, null, 2),
            'utf8'
        );

        console.log(`Successfully saved security data for ${chain}:${tokenAddress} at ${timestamp}`);
    } catch (error: any) {
        console.error('Error saving security data:', error?.message || 'Unknown error');
        throw error;
    }
}

/**
 * Fetches token security and launchpad information from GMGN API using scraper
 * @param chain - The blockchain chain (e.g., 'sol' for Solana)
 * @param tokenAddress - The token contract address
 * @param browser - Optional browser instance to reuse
 * @returns Promise containing security information
 */
export async function getTokenSecurityWithScraper(chain: string = 'sol', tokenAddress: string, browser?: Browser): Promise<SecurityData | null> {
    try {
        const baseUrl = 'https://gmgn.ai/api/v1/mutil_window_token_security_launchpad';
        const url = `${baseUrl}/${chain}/${tokenAddress}`;
        const data = await scrapeJsonData(url, browser) as GMGNResponse;
        
        if (!data || typeof data !== 'object') {
            console.error('Failed to fetch data or invalid response format');
            return null;
        }

        const security = data.data.security;

        // Save the security data
        await save(chain, tokenAddress, security);

        return security;
    } catch (error: any) {
        console.error('Error fetching token security:', error?.message || 'Unknown error');
        return null;
    }
}

/**
 * Example usage:
 * const security = await getTokenSecurityWithScraper('sol', '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN');
 */