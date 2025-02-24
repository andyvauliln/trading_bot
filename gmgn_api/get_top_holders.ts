import { scrapeJsonData, createBrowser } from './scraperClient';
import { Browser } from 'puppeteer';
import * as path from 'path';
import * as fs from 'fs/promises';
/**
 * Represents the status of a wallet holder
 */
export type HolderStatus = 'hold' | 'bought_more' | 'sold_part' | 'sold' | 'transfered' | string;
export type WalletTag = 'sandwich_bot' | 'photon' | 'bullx' | 'trojan' | 'sniper' | 'smart_degen' | 'fresh_wallet' | 'renowned' | string;
/**
 * Represents information about a specific wallet holder
 */
export interface HolderInfo {
    /** Current status of the wallet (e.g., sold, hold, etc.) */
    status: HolderStatus;
    /** The wallet address of the holder */
    wallet_address: string;
    /** Array of tags associated with the wallet */
    tags: string[];
    /** Array of tags associated with maker tokens */
    maker_token_tags: string[];
}

/**
 * Represents the current status of token holders
 */
export interface StatusNow {
    /** Number of holders currently holding */
    hold: number;
    /** Number of holders who bought more */
    bought_more: number;
    /** Number of holders who sold part of their holdings */
    sold_part: number;
    /** Number of holders who sold all their holdings */
    sold: number;
    /** Number of holders who transferred their holdings */
    transfered: number;
    /** Rate of holders who bought more tokens */
    bought_rate: string;
    /** Rate of holders currently holding tokens */
    holding_rate: string;
    /** Array of smart positions */
    smart_pos: any[];
    /** Count of smart holders currently holding */
    smart_count_hold: number | null;
    /** Count of smart holders who bought more */
    smart_count_bought_more: number | null;
    /** Count of smart holders who sold part */
    smart_count_sold_part: number | null;
    /** Count of smart holders who sold all */
    smart_count_sold: number | null;
    /** Count of smart holders who transferred */
    smart_count_transfered: number | null;
    /** Percentage of tokens held by top 10 holders */
    top_10_holder_rate: number;
}

/**
 * Represents holder statistics for a token
 */
export interface HoldersData {
    /** Blockchain chain identifier */
    chain: string;
    /** Total number of holders */
    holder_count: number;
    /** Current status information */
    statusNow: StatusNow;
    /** Change in number of holders who sold */
    sold_diff: number;
    /** Change in number of holders who sold part */
    sold_part_diff: number;
    /** Change in number of holders holding */
    hold_diff: number;
    /** Change in number of holders who bought more */
    bought_more: number;
    /** Array of individual holder information */
    holderInfo: HolderInfo[];
}

/**
 * Represents the API response structure
 */
export interface GMGNResponse {
    /** Response code (0 indicates success) */
    code: number;
    /** Response message */
    msg: string;
    /** Response data containing holders information */
    data: {
        holders: HoldersData;
    };
}

/**
 * Represents a record in the holders history file
 */
interface HolderRecord {
    timestamp: string;
    chain: string;
    token_address: string;
    holders_data: HoldersData;
}

/**
 * Saves holder data to a JSON file, appending to existing records
 * @param chain - The blockchain chain identifier
 * @param tokenAddress - The token contract address
 * @param holders - The holder data to save
 */
export async function save(chain: string, tokenAddress: string, holders: HoldersData): Promise<void> {
    try {
        const timestamp = new Date().toISOString();
        const holderRecord: HolderRecord = {
            timestamp,
            chain,
            token_address: tokenAddress,
            holders_data: holders
        };

        const filePath = path.join(process.cwd(), 'gmgn_api', 'get_top_holders.json');
        
        // Read existing data or initialize empty array
        let existingData: HolderRecord[] = [];
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
        existingData.push(holderRecord);

        // Write back to file
        await fs.writeFile(
            filePath,
            JSON.stringify(existingData, null, 2),
            'utf8'
        );

        console.log(`Successfully saved holder data for ${chain}:${tokenAddress} at ${timestamp}`);
    } catch (error: any) {
        console.error('Error saving holder data:', error?.message || 'Unknown error');
        throw error;
    }
}

/**
 * Fetches token holder information from GMGN API using scraper
 * @param chain - The blockchain chain (e.g., 'sol' for Solana)
 * @param tokenAddress - The token contract address
 * @param browser - Optional browser instance to reuse
 * @returns Promise containing holder information
 */
export async function getTokenHoldersWithScraper(chain: string = 'sol', tokenAddress: string, browser?: Browser): Promise<HoldersData | null> {
    try {
        const baseUrl = 'https://gmgn.ai/defi/quotation/v1/tokens/top_buyers';
        const url = `${baseUrl}/${chain}/${tokenAddress}`;
        const data = await scrapeJsonData(url, browser) as GMGNResponse;
       
        if (!data || typeof data !== 'object') {
            console.error('Failed to fetch data or invalid response format');
            return null;
        }

        var holders = data.data.holders;

        // Save the holder data
        await save(chain, tokenAddress, holders);

        return holders;
    } catch (error: any) {
        console.error('Error fetching token holders:', error?.message || 'Unknown error');
        return null;
    }
}

/**
 * Example usage:
 * const holders = await getTokenHolders('sol', '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN');
 */

// "https://gmgn.aihttps://gmgn.ai/defi/quotation/v1/tokens/top_buyers/sol/6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN": {
//         "url": "https://gmgn.aihttps://gmgn.ai/defi/quotation/v1/tokens/top_buyers/sol/6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN",
//         "response": {
//             "code": 0,
//             "msg": "success",
//             "data": {
//                 "holders": {
//                     "chain": "sol",
//                     "holder_count": 70,
//                     "statusNow": {
//                         "hold": 0,
//                         "bought_more": 0,
//                         "sold_part": 8,
//                         "sold": 62,
//                         "transfered": 0,
//                         "bought_rate": "0.0119486",
//                         "holding_rate": "0.00000203645",
//                         "smart_pos": [],
//                         "smart_count_hold": null,
//                         "smart_count_bought_more": null,
//                         "smart_count_sold_part": null,
//                         "smart_count_sold": null,
//                         "smart_count_transfered": null,
//                         "top_10_holder_rate": 0.100253
//                     },
//                     "sold_diff": 0,
//                     "sold_part_diff": 0,
//                     "hold_diff": 0,
//                     "bought_more": 0,
//                     "holderInfo": [
//                         {
//                             "status": "sold",
//                             "wallet_address": "7NEL682SBJhKLwEQKUSpEQcM1wnNniFsVgVPKGAVcb3A",
//                             "tags": [],
//                             "maker_token_tags": [
//                                 "sniper"
//                             ]
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "6QSc2CxSdkUQSXttkceR9yMuxMf36L75fS8624wJ9tXv",
//                             "tags": [],
//                             "maker_token_tags": [
//                                 "sniper"
//                             ]
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "8QxqUZgVf3r63sfkvgmNAwwaUjieS2B5wXkKixDHYfPG",
//                             "tags": [],
//                             "maker_token_tags": [
//                                 "sniper"
//                             ]
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "AoHXEkE8mr1HAKj3XyjXHjjVBexkoBPNQVWCFXZBRfEV",
//                             "tags": [],
//                             "maker_token_tags": [
//                                 "sniper"
//                             ]
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "FaoqbZtEnpfSpbSm86VLcwSKiqgWAPfnkPeaEWvFJ5ec",
//                             "tags": [
//                                 "sandwich_bot"
//                             ],
//                             "maker_token_tags": [
//                                 "sniper"
//                             ]
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "HJLqkCFiNMUsXvqA9btLXFwKpWgCAXXXmNBFnSELvXSC",
//                             "tags": [
//                                 "sandwich_bot"
//                             ],
//                             "maker_token_tags": [
//                                 "sniper"
//                             ]
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "54EiavhVatcFbcRHKm2swd6eB8reyib3kTkDGScoGjGK",
//                             "tags": [
//                                 "sandwich_bot"
//                             ],
//                             "maker_token_tags": [
//                                 "sniper"
//                             ]
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "HzuK5PCN6gi8gaKHZwRMhXS4sJiHyUFM3dtBHXLykVQU",
//                             "tags": [
//                                 "sandwich_bot"
//                             ],
//                             "maker_token_tags": [
//                                 "sniper"
//                             ]
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "8pY1AukbuPgUE3EetyLa59rFLMimJGT94ZzbMEZcQF4w",
//                             "tags": [
//                                 "sandwich_bot"
//                             ],
//                             "maker_token_tags": [
//                                 "sniper"
//                             ]
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "CVyXpJN1X3UQpgtV2YvmSkcSK4YLZHEY1ycRHcz7eiid",
//                             "tags": [
//                                 "sandwich_bot"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "A7FMMgue4aZmPLLoutVtbC7gJcyqkHybUieiaDg9aaVE",
//                             "tags": [
//                                 "sandwich_bot"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "HxfzwtH8oXW47YiZ4UoaXsiPgFdxbEsJorkdtKyBTgUJ",
//                             "tags": [
//                                 "photon"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold_part",
//                             "wallet_address": "4ywa3NKfWRX3jpMxWydiWzELuSbdDUhTV5QnoGexjV3e",
//                             "tags": [
//                                 "sandwich_bot"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold_part",
//                             "wallet_address": "9mKN5zoWJLDNNqGRnRKDmgJ8gDNFuZv3JKcTsnEN3uJJ",
//                             "tags": [
//                                 "sandwich_bot"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "BRcR9czUxiANsXLZpgvYCWK9MFMeruj26FnnJyQrWXEr",
//                             "tags": [
//                                 "bullx"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold_part",
//                             "wallet_address": "7dGrdJRYtsNR8UYxZ3TnifXGjGc9eRYLq9sELwYpuuUu",
//                             "tags": [
//                                 "sandwich_bot"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "44dLdsnzVy72HfLu84wZVtjUd4nEwvSjjWXzSFFVS4bp",
//                             "tags": [
//                                 "photon"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold_part",
//                             "wallet_address": "C6GA4fZDTrxzqRh16F1XbGvYqodmgWT1JHCKHvKVnv8j",
//                             "tags": [
//                                 "sandwich_bot"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "5VED2h4zgN3cjhJWVxQgS4pLmo53HCqQrrFBStG7i4uo",
//                             "tags": [
//                                 "photon"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold_part",
//                             "wallet_address": "benRLpbWCL8P8t51ufYt522419hGF5zif3CqgWGbEUm",
//                             "tags": [
//                                 "sandwich_bot"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "4y7QmR6ifAJfX2ZBKXgMBjDThPb48JySSsSxDDiMB9hF",
//                             "tags": [
//                                 "photon"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "HvFdDWS3RqymRAVx1ZdoL2RjiC38r5dtt19Z8op5jqDK",
//                             "tags": [
//                                 "sandwich_bot"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "12CHTi8P1ntd4KGBXV4Z5vk2yDevKHgT3VVpamuWK6yE",
//                             "tags": [
//                                 "photon",
//                                 "bullx"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "ANwWDBtanRCF895L5SgjY79AQKJXwG5LdKYfTmQC1pnf",
//                             "tags": [
//                                 "sandwich_bot"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold_part",
//                             "wallet_address": "616ttQ9BuFvWRZoTp3bmHWNr1p2sGRQKhG7azfVUTEZm",
//                             "tags": [],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "5db6XqdP6uRJY1tWenADKpaic5oHjsx4QwEVWrgPbuaD",
//                             "tags": [],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "7QSPT9qLYWQXqRTHf6wiWxekBdzrRiaZ8AGLinwswxnP",
//                             "tags": [],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "FVxeFYgyT4GC6D7gaLkMSu2qtSJfw2N4RVPZowi2A64Y",
//                             "tags": [
//                                 "photon",
//                                 "trojan"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold_part",
//                             "wallet_address": "G5nxEXuFMfV74DSnsrSatqCW32F34XUnBeq3PfDS7w5E",
//                             "tags": [
//                                 "sandwich_bot",
//                                 "photon",
//                                 "trojan"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "EWcXnyL9QXkyaS3AUx45xDDxXMPQHyDfgv4WsZi7zBq4",
//                             "tags": [],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "FgKquBoz2GmREWiGcJH8iMQbh9pFuDBp1zWxws5i8ouE",
//                             "tags": [
//                                 "trojan"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold_part",
//                             "wallet_address": "END4HCf93ifF73SVrCjpr9qdT3Nrg1wMciqQNA4SEGpE",
//                             "tags": [
//                                 "trojan"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "9T6UkAbaWDdG4cfrpYfbnCqeKcceMDTLGoQn7BbGLF5F",
//                             "tags": [
//                                 "trojan"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "CueDkwDYr8ZXRwMseprUpCqsz1Zj1VgLnZNRFyQHkfwZ",
//                             "tags": [
//                                 "photon"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "C7htiZCDTJV4LBi18BLBNydvPDrwCi1pDBhBMy1dEoYi",
//                             "tags": [
//                                 "photon"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "FZVdsFTRTWwZEy6XC5GCtHNWdcAwiQtAeJ2NSpH6cQNz",
//                             "tags": [
//                                 "sandwich_bot",
//                                 "photon",
//                                 "bullx"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "GkPtg9Lt38syNpdBGsNJu4YMkLi5wFXq3PM8PQhxT8ry",
//                             "tags": [],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "YcjUULpoURFD8TVwDZC8Wsk4RbAY5L62TH3rJoaFFTk",
//                             "tags": [
//                                 "sandwich_bot"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "BtjB8wsBUo2t6PL6ayqCxurxqL9U6o53gDtuEF5u9Ae",
//                             "tags": [
//                                 "photon"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "6obeVmM9SZUagyHTE7Soi7FhdZtd73m4MwHpkcL9Mu9Y",
//                             "tags": [
//                                 "photon"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "1v2xFQnJjCVy5rbLsBKYNE9U2fQMJhSSvVEKc4aTiv",
//                             "tags": [],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "3p4uu1ofsuX54z4yN3n97GPZZjqLkfEPLq1hhXCwon3f",
//                             "tags": [
//                                 "photon"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "3tc4BVAdzjr1JpeZu6NAjLHyp4kK3iic7TexMBYGJ4Xk",
//                             "tags": [
//                                 "photon",
//                                 "trojan"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "Gn96hdr1mboNUMuPEg2DBmJNvwxJf8Z51hGahVNdkSxT",
//                             "tags": [
//                                 "sandwich_bot"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "FnpXCzB3oT4LpsvsW3Pfz1FmTZgixZAf9WHGQxHbQCHi",
//                             "tags": [],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "F2fTFpyakXQM3ym9WYnDnoxwjWkEu8fazihQ7FinffZy",
//                             "tags": [
//                                 "photon"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "9VuAJYG9zVyu5eFWnRaTqBmjKfc7asG3gF189UxKvmQF",
//                             "tags": [],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "6PSJVsNTAPsvrMp3sw4vd4mDr3PDntdnFqyhzaYvycuT",
//                             "tags": [
//                                 "bullx"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "Awch9PiL7nwQqKNjXHzJd1KvTkFtauVqQDSjdUTqe28n",
//                             "tags": [
//                                 "sandwich_bot"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "6LLnmHNEe8P9if1NqtzJJxLwtkxJMcDxNcu9cYZNNUhi",
//                             "tags": [],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "GzoVb7LFL46aNkQkgGHrujv8XWdr4Gfr9iNUgQnVLkbu",
//                             "tags": [
//                                 "bullx"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "GySmVuPrzVziXzBXBscsxpgdbWfUTm8mPcKWXftwHLkZ",
//                             "tags": [
//                                 "bullx"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "GCrxYNvZXhY26QtxCryGoH8nfJaiE7qGGpvh61FAui8J",
//                             "tags": [
//                                 "photon",
//                                 "trojan"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "4mRYq9brr6S3YVMEoPShfodzsEQG8g7zMqXz9AfahoiP",
//                             "tags": [
//                                 "bullx"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "97oVMVpqmfreK73HjWvw132GHiyqgjxiXKCWNjyJ9cBF",
//                             "tags": [],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "CP38T6K3CsDbUAw6gEJQ4SmB49HrFmG463dvqNXowoBj",
//                             "tags": [
//                                 "sandwich_bot",
//                                 "photon"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "HGirxnHAsaQ4mKY3LAPPbociMvXXcRcodxT86BoLLMG",
//                             "tags": [
//                                 "bullx"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "71ekXSxUhcezQroiU7Kp5CmmSbS99ABtbkPS5VJqCc56",
//                             "tags": [
//                                 "trojan"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "AJKXLpGVhDTfB7x2oRG8FuNsryoGPmBUm9WyHd7PdNyb",
//                             "tags": [
//                                 "photon"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "ATmKENkRrL1JQQnoUNAQvkiwgjiHKUkzyncxTGxyzQL1",
//                             "tags": [
//                                 "photon"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "8HCjq45QQ3pjL7ZFdbPQ47LbBCHgbdTRs44YFZECJcLy",
//                             "tags": [],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "GwMR9r47sv3Cwfb7Mn8DzKJPENzYj9VECfVNz6BS9Dk2",
//                             "tags": [
//                                 "trojan"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "42DD9JnDDCzgZsXcdh6BMPo4QjCoXjhVesfHJ9qiANnp",
//                             "tags": [],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "4h4PEeAj9NyEhhfFG7ivK3dJh1uJytGEpHSA7XJoTSTv",
//                             "tags": [
//                                 "trojan"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "ECCKBDWX3MkEcf3bULbLBb9FvrEQLsmPMFTKFpvjzqgP",
//                             "tags": [
//                                 "photon",
//                                 "bullx"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "CJfbXUVayEfDdwuzHHQdWgWU7TJd8Si5pfVKoAScBfQG",
//                             "tags": [
//                                 "trojan"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "6G9T6ykMvz2LbAMgzv3Ess5AwVEqdNNccwZK178uyWJ8",
//                             "tags": [
//                                 "sandwich_bot"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "FXDdeUb2nhRVADqJRiYxdYPdqxmZLCT7shT9GQFh3DXv",
//                             "tags": [],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "Exa1WevqjEkwhNxwrw3tcyF9mMKDPk2gRN5BNNcUAout",
//                             "tags": [
//                                 "bullx"
//                             ],
//                             "maker_token_tags": []
//                         },
//                         {
//                             "status": "sold",
//                             "wallet_address": "Dhn556mKa1M33SqZTkbk1R8ueAMqY7ujHdYVKGfVVDDx",
//                             "tags": [
//                                 "sandwich_bot"
//                             ],
//                             "maker_token_tags": []
//                         }
//                     ]
//                 }
//             }
//         },
//         "type": "XHR",
//         "status": 200,
//         "timestamp": "2025-02-21T09:44:16.046Z"
//     }