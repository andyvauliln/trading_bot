import { DateTime } from "luxon";
import { InsertHistoricalDataDetails } from "../trades-monitoring/types";
import { insertHistoricalData } from "../trades-monitoring/db";

// Sample data for testing
const TEST_ACCOUNTS = [
    "wallet1",
    "wallet2",
    "wallet3"
];

const TEST_TOKENS = [
    {
        token: "SOL123",
        symbol: "SOL",
        tokenName: "Solana",
        basePrice: 100 // Base price in USD
    },
    {
        token: "BTC456",
        symbol: "BTC",
        tokenName: "Bitcoin",
        basePrice: 50000
    },
    {
        token: "ETH789",
        symbol: "ETH",
        tokenName: "Ethereum",
        basePrice: 3000
    }
];

// Function to generate random price fluctuation
function generatePriceFluctuation(basePrice: number): number {
    const fluctuationPercent = (Math.random() * 20) - 10; // Random fluctuation between -10% and +10%
    return basePrice * (1 + fluctuationPercent / 100);
}

// Function to generate random amount
function generateAmount(): number {
    return Math.random() * 10 + 0.1; // Random amount between 0.1 and 10.1
}

async function populateHistoricalData() {
    const startDate = DateTime.now().minus({ days: 30 });
    const endDate = DateTime.now();
    
    console.log("Starting to populate historical data...");
    
    // Generate data for each day in the range
    for (let currentDate = startDate; currentDate <= endDate; currentDate = currentDate.plus({ hours: 4 })) {
        for (const account of TEST_ACCOUNTS) {
            for (const token of TEST_TOKENS) {
                const historicalData: InsertHistoricalDataDetails = {
                    account,
                    token: token.token,
                    symbol: token.symbol,
                    tokenName: token.tokenName,
                    amount: generateAmount(),
                    usdPrice: generatePriceFluctuation(token.basePrice),
                    time: currentDate
                };

                try {
                    const success = await insertHistoricalData(historicalData);
                    if (success) {
                        console.log(`Successfully inserted data for ${token.symbol} at ${currentDate.toISO()}`);
                    } else {
                        console.error(`Failed to insert data for ${token.symbol} at ${currentDate.toISO()}`);
                    }
                } catch (error) {
                    console.error(`Error inserting historical data: ${error}`);
                }
            }
        }
    }
    
    console.log("Finished populating historical data.");
}

// Run the population script
populateHistoricalData().catch(console.error);

