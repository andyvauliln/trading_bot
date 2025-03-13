import { DateTime } from "luxon";
import { TransactionRecord } from '../bots/tracker-bot/types';

export interface InsertHistoricalDataDetails {
    account: string;
    token: string;
    symbol: string;
    amount: number;
    tokenName: string;
    usdPrice: number;
    time: DateTime;
}

export interface WalletToken {
    tokenName: string;
    tokenSymbol: string;
    tokenMint: string;
    balance: number;
    tokenValueUSDC: number;
    percentage: number;
}

export interface DexscreenerToken {
    address: string;
    name: string;
    symbol: string;
}

export interface DexscreenerPair {
    chainId: string;
    dexId: string;
    pairAddress: string;
    baseToken: DexscreenerToken;
    quoteToken: DexscreenerToken;
    priceUsd: string;
    labels?: string[];
}

export interface DexscreenerResult {
    prices: { [address: string]: number | null };
    pairs: Record<string, DexscreenerPair[]>;
}

export interface TokenPrices {
    [address: string]: number | null;
}

export interface BirdeyePriceItem {
    unixTime: number;
    value: number;
}

export interface BirdeyeHistoricalPriceResponse {
    success: boolean;
    data: {
        items: BirdeyePriceItem[];
    };
}

export interface TokenHistoricalPrices {
    [tokenAddress: string]: BirdeyePriceItem[];
}

export interface HistoricalPoolData {
    timestamp: number;
    totalValueUSDC: number;
    tokens: WalletToken[];
}

export interface TransactionRecordWithComments extends TransactionRecord {
    comment: string | null;
}