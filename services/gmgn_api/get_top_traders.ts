import { scrapeJsonData, createBrowser } from './scraperClient';
import { Browser } from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Represents a trader's tag rank information
 */
export interface TagRank {
    [key: string]: number | null;
}

/**
 * Represents native transfer information
 */
export interface NativeTransfer {
    name: string | null;
    from_address: string;
    timestamp: number;
}

/**
 * Represents detailed information about a top trader
 */
export interface TraderData {
    address: string;
    account_address: string;
    addr_type: number;
    amount_cur: number;
    usd_value: number;
    cost_cur: number;
    sell_amount_cur: number;
    sell_amount_percentage: number;
    sell_volume_cur: number;
    buy_volume_cur: number;
    buy_amount_cur: number;
    netflow_usd: number;
    netflow_amount: number;
    buy_tx_count_cur: number;
    sell_tx_count_cur: number;
    wallet_tag_v2: string;
    eth_balance: string;
    sol_balance: string;
    trx_balance: string;
    balance: string;
    profit: number;
    realized_profit: number;
    profit_change: number;
    amount_percentage: number;
    unrealized_profit: number;
    unrealized_pnl: number;
    avg_cost: number;
    avg_sold: number;
    tags: string[];
    maker_token_tags: string[];
    name: string;
    avatar: string;
    twitter_username: string;
    twitter_name: string;
    tag_rank: TagRank;
    last_active_timestamp: number;
    created_at: number;
    accu_amount: number;
    accu_cost: number;
    cost: number;
    total_cost: number;
    transfer_in: boolean;
    is_new: boolean;
    native_transfer: NativeTransfer;
    is_suspicious: boolean;
    start_holding_at: number;
    end_holding_at: number | null;
}

/**
 * Represents the API response structure
 */
export interface GMGNResponse {
    code: number;
    msg: string;
    data: TraderData[];
}

/**
 * Represents a record in the top traders history file
 */
interface TraderRecord {
    timestamp: string;
    chain: string;
    token_address: string;
    traders_data: TraderData[];
}

/**
 * Saves top traders data to a JSON file, appending to existing records
 * @param chain - The blockchain chain identifier
 * @param tokenAddress - The token contract address
 * @param traders - The traders data to save
 */
export async function save(chain: string, tokenAddress: string, traders: TraderData[]): Promise<void> {
    try {
        const timestamp = new Date().toISOString();
        const traderRecord: TraderRecord = {
            timestamp,
            chain,
            token_address: tokenAddress,
            traders_data: traders
        };

        const filePath = path.join(process.cwd(), 'gmgn_api', 'get_top_traders.json');
        
        // Read existing data or initialize empty array
        let existingData: TraderRecord[] = [];
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
        existingData.push(traderRecord);

        // Write back to file
        await fs.writeFile(
            filePath,
            JSON.stringify(existingData, null, 2),
            'utf8'
        );

        console.log(`Successfully saved top traders data for ${chain}:${tokenAddress} at ${timestamp}`);
    } catch (error: any) {
        console.error('Error saving top traders data:', error?.message || 'Unknown error');
        throw error;
    }
}


/**
 * Fetches top traders information from GMGN API using scraper
 * @param chain - The blockchain chain (e.g., 'sol' for Solana)
 * @param tokenAddress - The token contract address
 * @param orderBy - Field to order results by (e.g., 'realized_profit')
 * @param direction - Sort direction ('asc' or 'desc')
 * @param tag - Filter by trader tag (e.g., 'renowned')
 * @param browser - Optional browser instance to reuse
 * @returns Promise containing top traders information
 */
export async function getTopTradersWithScraper(
    chain: string = 'sol',
    tokenAddress: string,
    orderBy: string = 'realized_profit',
    direction: 'asc' | 'desc' = 'desc',
    tag: string = 'renowned',
    browser?: Browser
): Promise<TraderData[] | null> {
    try {
        const baseUrl = 'https://gmgn.ai/defi/quotation/v1/tokens/top_traders';
        const url = `${baseUrl}/${chain}/${tokenAddress}?&orderby=${orderBy}&direction=${direction}&tag=${tag}`;
        const data = await scrapeJsonData(url, browser) as GMGNResponse;
        
        if (!data || typeof data !== 'object' || !Array.isArray(data.data)) {
            console.error('Failed to fetch data or invalid response format');
            return null;
        }

        // Save the traders data
        await save(chain, tokenAddress, data.data);

        return data.data;
    } catch (error: any) {
        console.error('Error fetching top traders:', error?.message || 'Unknown error');
        return null;
    }
}