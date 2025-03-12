import { DateTime } from "luxon";

export interface InsertHistoricalDataDetails {
    account: string;
    token: string;
    symbol: string;
    amount: number;
    tokenName: string;
    usdPrice: number;
    time: DateTime;
}