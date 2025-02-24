import { scrapeJsonData } from './scraperClient';
import { Browser } from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs/promises';

/**
 * Represents a trade maker's information
 */
interface MakerInfo {
    maker_tags: string[];
    maker_token_tags: string[];
    maker_name: string;
    maker_twitter_username: string;
    maker_twitter_name: string;
    maker_avatar: string;
    maker_ens: string;
}

/**
 * Represents a single trade record
 */
export interface TradeData {
    maker: string;
    base_amount: string;
    quote_amount: string;
    quote_symbol: string;
    quote_address: string;
    amount_usd: string;
    timestamp: number;
    event: string;
    tx_hash: string;
    price_usd: string;
    total_trade: number;
    id: string;
    is_following: number;
    is_open_or_close: number;
    buy_cost_usd: string;
    balance: string;
    cost: string;
    history_bought_amount: string;
    history_sold_income: string;
    history_sold_amount: string;
    realized_profit: string;
    unrealized_profit: string;
    token_address: string;
    maker_info: MakerInfo;
}

/**
 * Represents the API response structure
 */
export interface GMGNTradesResponse {
    code: number;
    reason: string;
    message: string;
    data: {
        history: TradeData[];
    };
}

/**
 * Represents a record in the token trades history file
 */
interface TradesRecord {
    timestamp: string;
    chain: string;
    token_address: string;
    maker?: string;
    trades_data: TradeData[];
}

/**
 * Saves token trades data to a JSON file, appending to existing records
 * @param chain - The blockchain chain identifier
 * @param tokenAddress - The token contract address
 * @param trades - The trades data to save
 * @param maker - Optional maker address to filter trades
 */
export async function save(chain: string, tokenAddress: string, trades: TradeData[], maker?: string): Promise<void> {
    try {
        const timestamp = new Date().toISOString();
        const tradesRecord: TradesRecord = {
            timestamp,
            chain,
            token_address: tokenAddress,
            maker,
            trades_data: trades
        };

        const filePath = path.join(process.cwd(), 'gmgn_api', 'get_token_trades.json');
        
        // Read existing data or initialize empty array
        let existingData: TradesRecord[] = [];
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
        existingData.push(tradesRecord);

        // Write back to file
        await fs.writeFile(
            filePath,
            JSON.stringify(existingData, null, 2),
            'utf8'
        );

        console.log(`Successfully saved trades data for ${chain}:${tokenAddress} at ${timestamp}`);
    } catch (error: any) {
        console.error('Error saving trades data:', error?.message || 'Unknown error');
        throw error;
    }
}

/**
 * Fetches token trades information from GMGN API using scraper
 * @param chain - The blockchain chain (e.g., 'sol' for Solana)
 * @param tokenAddress - The token contract address
 * @param limit - Optional limit for number of trades to fetch (default 100)
 * @param maker - Optional maker address to filter trades
 * @param browser - Optional browser instance to reuse
 * @returns Promise containing trades information
 */
export async function getTokenTradesWithScraper(
    chain: string = 'sol',
    tokenAddress: string,
    limit: number = 100,
    maker?: string,
    tag?: string,
    browser?: Browser
): Promise<TradeData[] | null> {
    try {
        const baseUrl = 'https://gmgn.ai/api/v1/token_trades';
        let url = `${baseUrl}/${chain}/${tokenAddress}?limit=${limit}`;
        if (maker) {
            url += `&maker=${maker}`;
        }
        if (tag) {
            url += `&tag=${tag}`;
        }

        const data = await scrapeJsonData(url, browser) as GMGNTradesResponse;
        
        if (!data || typeof data !== 'object' || !data.data?.history) {
            console.error('Failed to fetch data or invalid response format');
            return null;
        }

        const trades = data.data.history;

        // Save the trades data
        await save(chain, tokenAddress, trades, maker);

        return trades;
    } catch (error: any) {
        console.error('Error fetching token trades:', error?.message || 'Unknown error');
        return null;
    }
}

/**
 * Example usage:
 * const trades = await getTokenTradesWithScraper('sol', '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN', 100);
 */

// "https://gmgn.ai/api/v1/token_trades/sol/6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN?&limit=100&maker=": {
//     "url": "https://gmgn.ai/api/v1/token_trades/sol/6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN?&limit=100&maker=",
//     "response": {
//         "code": 0,
//         "reason": "",
//         "message": "success",
//         "data": {
//             "history": [
//                 {
//                     "maker": "tRadEVu2Va7WsVHqmGSiRHspkBoDQ9Qnjp42TiJirYA",
//                     "base_amount": "0.02562400000000000000",
//                     "quote_amount": "0.43603000000000000000",
//                     "quote_symbol": "USDC",
//                     "quote_address": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
//                     "amount_usd": "0.43603000000000000000",
//                     "timestamp": 1740130980,
//                     "event": "sell",
//                     "tx_hash": "5uXR2hS7Ar8tYxrFPYyKRiq1eTZnDULNW4b8hwuTgYAbZ2HLmDWnAzdADL8siMdEaGQp3mM9bomE52RS6iAdmei5",
//                     "price_usd": "17.01646893537308770000",
//                     "total_trade": 13765,
//                     "id": "MDAzMjIwOTg3NjYxNDg3MDAwMQ==",
//                     "is_following": 0,
//                     "is_open_or_close": 0,
//                     "buy_cost_usd": "0.44102311020091554721",
//                     "balance": "0",
//                     "cost": "0",
//                     "history_bought_amount": "381.651694",
//                     "history_sold_income": "9878.51952991210065",
//                     "history_sold_amount": "376.792438",
//                     "realized_profit": "-47.40805372577152086588",
//                     "unrealized_profit": "0",
//                     "maker_tags": [
//                         "sandwich_bot"
//                     ],
//                     "maker_token_tags": [],
//                     "maker_name": "",
//                     "maker_twitter_username": "",
//                     "maker_twitter_name": "",
//                     "maker_avatar": "",
//                     "maker_ens": "",
//                     "token_address": "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN"
//                 }
//             ]
//         }
//     }
// }