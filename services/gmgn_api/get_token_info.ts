import { scrapeJsonData, scrapeJsonDataWithPost, createBrowser } from './scraperClient';
import { Browser } from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Represents a token's pool information
 */
export interface TokenPool {
    address: string;
    pool_address: string;
    quote_address: string;
    quote_symbol: string;
    liquidity: string;
    base_reserve: string;
    quote_reserve: string;
    initial_liquidity: string;
    initial_base_reserve: string;
    initial_quote_reserve: string;
    creation_timestamp: number;
    base_reserve_value: string;
    quote_reserve_value: string;
    quote_vault_address: string;
    base_vault_address: string;
    creator: string;
    exchange: string;
    token0_address: string;
    token1_address: string;
    base_address: string;
}

/**
 * Represents developer-related information for a token
 */
export interface TokenDev {
    address: string;
    creator_address: string;
    creator_token_balance: string;
    creator_token_status: string;
    twitter_name_change_history: string[];
    top_10_holder_rate: string;
    dexscr_ad: number;
    dexscr_update_link: number;
    cto_flag: number;
}

/**
 * Represents price-related information for a token
 */
export interface TokenPrice {
    address: string;
    price: string;
    price_1m: string;
    price_5m: string;
    price_1h: string;
    price_6h: string;
    price_24h: string;
    buys_1m: number;
    buys_5m: number;
    buys_1h: number;
    buys_6h: number;
    buys_24h: number;
    sells_1m: number;
    sells_5m: number;
    sells_1h: number;
    sells_6h: number;
    sells_24h: number;
    volume_1m: string;
    volume_5m: string;
    volume_1h: string;
    volume_6h: string;
    volume_24h: string;
    buy_volume_1m: string;
    buy_volume_5m: string;
    buy_volume_1h: string;
    buy_volume_6h: string;
    buy_volume_24h: string;
    sell_volume_1m: string;
    sell_volume_5m: string;
    sell_volume_1h: string;
    sell_volume_6h: string;
    sell_volume_24h: string;
    swaps_1m: number;
    swaps_5m: number;
    swaps_1h: number;
    swaps_6h: number;
    swaps_24h: number;
    hot_level: number;
}

/**
 * Represents comprehensive token information
 */
export interface TokenInfo {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    logo: string;
    biggest_pool_address: string;
    open_timestamp: number;
    holder_count: number;
    circulating_supply: string;
    total_supply: string;
    max_supply: string;
    liquidity: string;
    creation_timestamp: number;
    pool: TokenPool;
    dev: TokenDev;
    price: TokenPrice;
}

/**
 * Represents the API response structure
 */
export interface TokenInfoResponse {
    code: number;
    reason: string;
    message: string;
    data: TokenInfo[];
}

/**
 * Represents a record in the token info history file
 */
interface TokenInfoRecord {
    timestamp: string;
    chain: string;
    token_address: string;
    token_info: TokenInfo;
}

/**
 * Saves token information to a JSON file, appending to existing records
 * @param chain - The blockchain chain identifier
 * @param tokenAddress - The token contract address
 * @param tokenInfo - The token information to save
 */
export async function save(chain: string, tokenAddress: string, tokenInfo: TokenInfo): Promise<void> {
    try {
        const timestamp = new Date().toISOString();
        const tokenInfoRecord: TokenInfoRecord = {
            timestamp,
            chain,
            token_address: tokenAddress,
            token_info: tokenInfo
        };

        const filePath = path.join(process.cwd(), 'gmgn_api', 'get_token_info.json');
        
        // Read existing data or initialize empty array
        let existingData: TokenInfoRecord[] = [];
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
        existingData.push(tokenInfoRecord);

        // Write back to file
        await fs.writeFile(
            filePath,
            JSON.stringify(existingData, null, 2),
            'utf8'
        );

        console.log(`Successfully saved token info for ${chain}:${tokenAddress} at ${timestamp}`);
    } catch (error: any) {
        console.error('Error saving token info:', error?.message || 'Unknown error');
        throw error;
    }
}

/**
 * Fetches token information from GMGN API using scraper
 * Handles both single token and multiple token requests
 * @param chain - The blockchain chain (e.g., 'sol' for Solana)
 * @param addresses - Single token address or array of token addresses
 * @param browser - Optional browser instance to reuse
 * @returns Promise containing array of token information
 */
export async function getTokenInfoWithScraper(
    chain: string = 'sol',
    addresses: string | string[],
    browser?: Browser
): Promise<TokenInfo[]> {
    const tokenAddresses = Array.isArray(addresses) ? addresses : [addresses];
    const shouldCloseBrowser = !browser;
    const browserInstance = browser || await createBrowser();

    try {
        // For multiple addresses, use POST request
        const baseUrl = 'https://gmgn.ai/api/v1/mutil_window_token_info';
        const payload = {
            chain,
            addresses: tokenAddresses
        };

        const data = await scrapeJsonDataWithPost(baseUrl, payload, browserInstance) as TokenInfoResponse;
        
        if (!data || typeof data !== 'object' || !Array.isArray(data.data)) {
            console.error('Failed to fetch data or invalid response format');
            return [];
        }

        // Save each token's info
        await Promise.all(data.data.map(tokenInfo => 
            save(chain, tokenInfo.address, tokenInfo)
        ));

        return data.data;
    } catch (error: any) {
        console.error('Error fetching token info:', error?.message || 'Unknown error');
        return [];
    } finally {
        if (shouldCloseBrowser && browserInstance) {
            await browserInstance.close();
        }
    }
}

/**
 * Example usage:
 * Single token:
 * const tokenInfo = await getTokenInfoWithScraper('sol', '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN');
 * 
 * Multiple tokens:
 * const tokenInfos = await getTokenInfoWithScraper('sol', [
 *   '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN',
 *   'anotherTokenAddress'
 * ]);
 */