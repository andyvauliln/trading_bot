import { createBrowser } from './scraperClient';
import { getTokenHoldersWithScraper } from './get_top_holders';
import { getTokenSlippageWithScraper } from './get_slippage';
import { getTopTradersWithScraper } from './get_top_traders';
import { getTokenTradesWithScraper } from './get_token_trades';
import { getTokenInfoWithScraper } from './get_token_info';
import { getGasPriceWithScraper } from './get_gas_price';
import { getTokenSecurityWithScraper } from './get_token_sequrity_launchpad';
import { getTokenKlineDataWithScraper } from './get_token_kline_data';
import { getTokenTrendsByType } from './get_token_trades_by_type';

//****************************************************
async function run_test_get_top_holders() {
    let browser;
    
    try {
        console.log('Starting test...');
        browser = await createBrowser();
        console.log('Browser created successfully');

        
        const tokenAddress = '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN';
        console.log('\nTesting get top holders for token', tokenAddress);
        const holders = await getTokenHoldersWithScraper('sol', tokenAddress, browser);
        
        if (!holders) {
            console.error('No response received from API');
            return;
        }

        if (holders) {
            console.log('\nHolders Statistics:');
            console.log('------------------');
            console.log('Total Holders:', holders.holder_count);
            console.log('Chain:', holders.chain);
            
            const statusNow = holders.statusNow;
            console.log('\nCurrent Status:');
            console.log('--------------');
            console.log('Hold:', statusNow.hold);
            console.log('Bought More:', statusNow.bought_more);
            console.log('Sold Part:', statusNow.sold_part);
            console.log('Sold:', statusNow.sold);
            console.log('Transferred:', statusNow.transfered);
            console.log('Bought Rate:', statusNow.bought_rate);
            console.log('Holding Rate:', statusNow.holding_rate);
            console.log('Top 10 Holder Rate:', statusNow.top_10_holder_rate);
            
            if (holders.holderInfo?.length > 0) {
                console.log('\nFirst 3 Holders:');
                console.log('--------------');
                holders.holderInfo.slice(0, 3).forEach((holder, index) => {
                    console.log(`\nHolder ${index + 1}:`);
                    console.log('Status:', holder.status);
                    console.log('Wallet:', holder.wallet_address);
                    console.log('Tags:', holder.tags.join(', ') || 'No tags');
                    console.log('Maker Token Tags:', holder.maker_token_tags.join(', ') || 'No maker token tags');
                });
            } else {
                console.log('\nNo holder information available');
            }
        }

    } catch (error: any) {
        console.error('\nTest failed with error:', error?.message || 'Unknown error');
    } finally {
        if (browser) {
            console.log('\nClosing browser...');
            await browser.close();
            console.log('Browser closed successfully');
        }
        console.log('\nTest completed');
    }
}

async function run_test_get_slippage() {
    let browser;
    
    try {
        console.log('Starting test...');
        browser = await createBrowser();
        console.log('Browser created successfully');

        
        const tokenAddress = '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN';
        console.log('\nTesting get slippage for token', tokenAddress);
        const slippage = await getTokenSlippageWithScraper('sol', tokenAddress, browser);
        console.log('Slippage:', slippage);
    } catch (error: any) {
        console.error('\nTest failed with error:', error?.message || 'Unknown error');
    } finally {
        if (browser) {
            console.log('\nClosing browser...');
            await browser.close();
            console.log('Browser closed successfully');
        }
        console.log('\nTest completed');
    }
}
//****************************************************
async function run_test_get_token_trades() {
    let browser;
    
    try {
        console.log('Starting test...');
        browser = await createBrowser();
        console.log('Browser created successfully');

        const tokenAddress = '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN';
        console.log('\nTesting get token trades for token', tokenAddress);
        const trades = await getTokenTradesWithScraper('sol', tokenAddress, 100, undefined, undefined, browser);
        
        if (!trades) {
            console.error('No response received from API');
            return;
        }

        console.log('\nTrades Statistics:');
        console.log('------------------');
        console.log('Total Trades:', trades.length);

        if (trades.length > 0) {
            console.log('\nFirst 3 Trades:');
            console.log('--------------');
            trades.slice(0, 3).forEach((trade, index) => {
                console.log(`\nTrade ${index + 1}:`);
                console.log('Event:', trade.event);
                console.log('Maker:', trade.maker);
                console.log('Base Amount:', trade.base_amount);
                console.log('Quote Amount:', trade.quote_amount);
                console.log('Price USD:', trade.price_usd);
                console.log('Timestamp:', new Date(trade.timestamp * 1000).toISOString());
                console.log('Transaction:', trade.tx_hash);
                console.log('Realized Profit:', trade.realized_profit);
            });
        } else {
            console.log('\nNo trade information available');
        }

    } catch (error: any) {
        console.error('\nTest failed with error:', error?.message || 'Unknown error');
    } finally {
        if (browser) {
            console.log('\nClosing browser...');
            await browser.close();
            console.log('Browser closed successfully');
        }
        console.log('\nTest completed');
    }
}
//****************************************************
async function run_test_get_token_info() {
    let browser;
    
    try {
        console.log('Starting test...');
        browser = await createBrowser();
        console.log('Browser created successfully');

        // Test single token
        const tokenAddress = '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN';
        console.log('\nTesting get token info for single token', tokenAddress);
        const tokenInfos = await getTokenInfoWithScraper('sol', tokenAddress, browser);
        
        if (!tokenInfos || tokenInfos.length === 0) {
            console.error('No response received from API');
            return;
        }

        const tokenInfo = tokenInfos[0]; // Get first token info

        console.log('\nToken Information:');
        console.log('------------------');
        console.log('Symbol:', tokenInfo.symbol);
        console.log('Name:', tokenInfo.name);
        console.log('Decimals:', tokenInfo.decimals);
        console.log('Holder Count:', tokenInfo.holder_count);
        console.log('Circulating Supply:', tokenInfo.circulating_supply);
        console.log('Total Supply:', tokenInfo.total_supply);
        console.log('Max Supply:', tokenInfo.max_supply);
        console.log('Liquidity:', tokenInfo.liquidity);
        
        console.log('\nPrice Information:');
        console.log('-----------------');
        console.log('Current Price:', tokenInfo.price.price);
        console.log('24h Price:', tokenInfo.price.price_24h);
        console.log('24h Volume:', tokenInfo.price.volume_24h);
        console.log('24h Buys:', tokenInfo.price.buys_24h);
        console.log('24h Sells:', tokenInfo.price.sells_24h);
        
        console.log('\nPool Information:');
        console.log('----------------');
        console.log('Pool Address:', tokenInfo.pool.pool_address);
        console.log('Quote Symbol:', tokenInfo.pool.quote_symbol);
        console.log('Liquidity:', tokenInfo.pool.liquidity);
        console.log('Base Reserve:', tokenInfo.pool.base_reserve);
        console.log('Quote Reserve:', tokenInfo.pool.quote_reserve);

        // Test multiple tokens
        return;
        const multipleAddresses = [
            '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN',
            'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263' // Another token address for testing
        ];
        console.log('\nTesting get token info for multiple tokens', multipleAddresses);
        const multiTokenInfos = await getTokenInfoWithScraper('sol', multipleAddresses, browser);
        
        console.log('\nMultiple Tokens Information:');
        console.log('-------------------------');
        console.log('Number of tokens retrieved:', multiTokenInfos.length);
        multiTokenInfos.forEach((info, index) => {
            console.log(`\nToken ${index + 1}:`);
            console.log('Symbol:', info.symbol);
            console.log('Name:', info.name);
            console.log('Current Price:', info.price.price);
        });

    } catch (error: any) {
        console.error('\nTest failed with error:', error?.message || 'Unknown error');
    } finally {
        if (browser) {
            console.log('\nClosing browser...');
            await browser.close();
            console.log('Browser closed successfully');
        }
        console.log('\nTest completed');
    }
}

//****************************************************

async function run_test_get_gas_price() {
    let browser;
    
    try {
        console.log('Starting test...');
        browser = await createBrowser();
        console.log('Browser created successfully');

        console.log('\nTesting get gas price for Solana');
        const address = '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN';
        const gasPrice = await getGasPriceWithScraper('sol', address, browser);
        
        if (!gasPrice) {
            console.error('No response received from API');
            return;
        }

        console.log('\nGas Price Information:');
        console.log('--------------------');
        console.log('Last Block:', gasPrice.last_block);
        console.log('\nGas Prices:');
        console.log('High:', gasPrice.high);
        console.log('Average:', gasPrice.average);
        console.log('Low:', gasPrice.low);
        
        console.log('\nPriority Fees:');
        console.log('High:', gasPrice.high_prio_fee);
        console.log('Average:', gasPrice.average_prio_fee);
        console.log('Low:', gasPrice.low_prio_fee);
        
        console.log('\nMixed Priority Fees:');
        console.log('High:', gasPrice.high_prio_fee_mixed);
        console.log('Average:', gasPrice.average_prio_fee_mixed);
        console.log('Low:', gasPrice.low_prio_fee_mixed);
        
        console.log('\nEstimate Times (seconds):');
        console.log('High:', gasPrice.high_estimate_time);
        console.log('Average:', gasPrice.average_estimate_time);
        console.log('Low:', gasPrice.low_estimate_time);
        
        console.log('\nPrices:');
        console.log('Native Token USD Price:', gasPrice.native_token_usd_price);
        console.log('ETH USD Price:', gasPrice.eth_usd_price);

    } catch (error: any) {
        console.error('\nTest failed with error:', error?.message || 'Unknown error');
    } finally {
        if (browser) {
            console.log('\nClosing browser...');
            await browser.close();
            console.log('Browser closed successfully');
        }
        console.log('\nTest completed');
    }
}
//****************************************************

async function run_test_get_token_security() {
    let browser;
    
    try {
        console.log('Starting test...');
        browser = await createBrowser();
        console.log('Browser created successfully');

        const tokenAddress = '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN';
        console.log('\nTesting get token security for token', tokenAddress);
        const security = await getTokenSecurityWithScraper('sol', tokenAddress, browser);
        
        if (!security) {
            console.error('No response received from API');
            return;
        }

        console.log('\nSecurity Information:');
        console.log('--------------------');
        console.log('Address:', security.address);
        console.log('Show Alert:', security.is_show_alert);
        console.log('Top 10 Holder Rate:', security.top_10_holder_rate);
        console.log('Renounced Mint:', security.renounced_mint);
        console.log('Renounced Freeze Account:', security.renounced_freeze_account);
        
        console.log('\nBurn Information:');
        console.log('----------------');
        console.log('Burn Ratio:', security.burn_ratio);
        console.log('Burn Status:', security.burn_status);
        console.log('Dev Token Burn Amount:', security.dev_token_burn_amount);
        console.log('Dev Token Burn Ratio:', security.dev_token_burn_ratio);
        
        console.log('\nSecurity Checks:');
        console.log('---------------');
        console.log('Open Source:', security.is_open_source);
        console.log('Blacklist:', security.is_blacklist);
        console.log('Honeypot:', security.is_honeypot);
        console.log('Renounced:', security.is_renounced);
        
        console.log('\nTrading Information:');
        console.log('-------------------');
        console.log('Can Sell:', security.can_sell);
        console.log('Cannot Sell:', security.can_not_sell);
        console.log('Buy Tax:', security.buy_tax);
        console.log('Sell Tax:', security.sell_tax);
        console.log('Average Tax:', security.average_tax);
        console.log('High Tax:', security.high_tax);
        
        if (security.flags.length > 0) {
            console.log('\nFlags:', security.flags.join(', '));
        }
        
        console.log('\nLock Summary:');
        console.log('------------');
        console.log('Is Locked:', security.lock_summary.is_locked);
        console.log('Lock Percent:', security.lock_summary.lock_percent);
        console.log('Left Lock Percent:', security.lock_summary.left_lock_percent);

    } catch (error: any) {
        console.error('\nTest failed with error:', error?.message || 'Unknown error');
    } finally {
        if (browser) {
            console.log('\nClosing browser...');
            await browser.close();
            console.log('Browser closed successfully');
        }
        console.log('\nTest completed');
    }
}
//****************************************************

async function run_test_get_token_kline_data() {
    let browser;
    
    try {
        console.log('Starting test...');
        browser = await createBrowser();
        console.log('Browser created successfully');

        const tokenAddress = '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN';
        const from = 1740116640;
        const to = 1740116656;
        console.log('\nTesting get token kline data for token', tokenAddress);
        const klineData = await getTokenKlineDataWithScraper('sol', tokenAddress, '1m', from, to, browser);
        
        if (!klineData) {
            console.error('No response received from API');
            return;
        }

        console.log('\nKline Data Information:');
        console.log('---------------------');
        console.log('Number of candles:', klineData.length);

        if (klineData.length > 0) {
            console.log('\nFirst Candle:');
            console.log('------------');
            const firstCandle = klineData[0];
            console.log('Open:', firstCandle.open);
            console.log('Close:', firstCandle.close);
            console.log('High:', firstCandle.high);
            console.log('Low:', firstCandle.low);
            console.log('Time:', new Date(parseInt(firstCandle.time)).toISOString());
            console.log('Volume:', firstCandle.volume);
        } else {
            console.log('\nNo kline data available');
        }

    } catch (error: any) {
        console.error('\nTest failed with error:', error?.message || 'Unknown error');
    } finally {
        if (browser) {
            console.log('\nClosing browser...');
            await browser.close();
            console.log('Browser closed successfully');
        }
        console.log('\nTest completed');
    }
}
//****************************************************

async function run_test_get_top_traders() {
    let browser;
    
    try {
        console.log('Starting test...');
        browser = await createBrowser();
        console.log('Browser created successfully');

        const tokenAddress = '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN';
        console.log('\nTesting get top traders for token', tokenAddress);
        console.log('Fetching top traders ordered by realized profit (descending)');
        const traders = await getTopTradersWithScraper(
            'sol',
            tokenAddress,
            'realized_profit',
            'desc',
            'renowned',
            browser
        );
        
        if (!traders) {
            console.error('No response received from API');
            return;
        }

        console.log('\nTop Traders Information:');
        console.log('----------------------');
        console.log('Total Traders:', traders.length);

        if (traders.length > 0) {
            console.log('\nFirst 3 Traders:');
            console.log('---------------');
            traders.slice(0, 3).forEach((trader, index) => {
                console.log(`\nTrader ${index + 1}:`);
                console.log('Name:', trader.name);
                console.log('Address:', trader.address);
                console.log('Account Address:', trader.account_address);
                console.log('Realized Profit:', trader.realized_profit);
                console.log('Unrealized Profit:', trader.unrealized_profit);
                console.log('Buy Volume:', trader.buy_volume_cur);
                console.log('Sell Volume:', trader.sell_volume_cur);
                console.log('Buy Transactions:', trader.buy_tx_count_cur);
                console.log('Sell Transactions:', trader.sell_tx_count_cur);
                console.log('Tags:', trader.tags.join(', ') || 'No tags');
                console.log('Maker Token Tags:', trader.maker_token_tags.join(', ') || 'No maker token tags');
                if (trader.twitter_username) {
                    console.log('Twitter:', `@${trader.twitter_username}`);
                }
            });
        } else {
            console.log('\nNo trader information available');
        }

    } catch (error: any) {
        console.error('\nTest failed with error:', error?.message || 'Unknown error');
    } finally {
        if (browser) {
            console.log('\nClosing browser...');
            await browser.close();
            console.log('Browser closed successfully');
        }
        console.log('\nTest completed');
    }
}

//****************************************************

async function run_test_get_token_trends() {
    let browser;
    
    try {
        console.log('Starting test...');
        browser = await createBrowser();
        console.log('Browser created successfully');

        const tokenAddress = '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN';
        console.log('\nTesting get token trends for token', tokenAddress);
        const trends = await getTokenTrendsByType('sol', tokenAddress, browser);
        
        if (!trends) {
            console.error('No response received from API');
            return;
        }

        console.log('\nToken Trends Information:');
        console.log('----------------------');

        // Display average holding balance trend
        console.log('\nAverage Holding Balance Trend:');
        console.log('---------------------------');
        console.log('Latest Value:', trends.avg_holding_balance[trends.avg_holding_balance.length - 1].value);
        console.log('Number of Data Points:', trends.avg_holding_balance.length);

        // Display holder count trend
        console.log('\nHolder Count Trend:');
        console.log('------------------');
        console.log('Latest Value:', trends.holder_count[trends.holder_count.length - 1].value);
        console.log('Number of Data Points:', trends.holder_count.length);

        // Display top 10 holder percent trend
        console.log('\nTop 10 Holder Percent Trend:');
        console.log('--------------------------');
        console.log('Latest Value:', trends.top10_holder_percent[trends.top10_holder_percent.length - 1].value);
        console.log('Number of Data Points:', trends.top10_holder_percent.length);

        // Display blue chip owner percent trend
        console.log('\nBlue Chip Owner Percent Trend:');
        console.log('----------------------------');
        console.log('Latest Value:', trends.bluechip_owner_percent[trends.bluechip_owner_percent.length - 1].value);
        console.log('Number of Data Points:', trends.bluechip_owner_percent.length);

        // Display insider percent trend
        console.log('\nInsider Percent Trend:');
        console.log('--------------------');
        console.log('Latest Value:', trends.insider_percent[trends.insider_percent.length - 1].value);
        console.log('Number of Data Points:', trends.insider_percent.length);

    } catch (error: any) {
        console.error('\nTest failed with error:', error?.message || 'Unknown error');
    } finally {
        if (browser) {
            console.log('\nClosing browser...');
            await browser.close();
            console.log('Browser closed successfully');
        }
        console.log('\nTest completed');
    }
}

//****************************************************

// Run the test
// run_test_get_top_holders().catch(error => {
//     console.error('Unhandled error in test:', error);
//     process.exit(1);
// });

// run_test_get_slippage().catch(error => {
//     console.error('Unhandled error in test:', error);
//     process.exit(1);
// });

// run_test_get_token_trades().catch(error => {
//     console.error('Unhandled error in test:', error);
//     process.exit(1);
// });

// run_test_get_token_info().catch(error => {
//     console.error('Unhandled error in test:', error);
//     process.exit(1);
// });

// run_test_get_gas_price().catch(error => {
//     console.error('Unhandled error in test:', error);
//     process.exit(1);
// });

// run_test_get_token_security().catch(error => {
//     console.error('Unhandled error in test:', error);
//     process.exit(1);
// });

// run_test_get_token_kline_data().catch(error => {
//     console.error('Unhandled error in test:', error);
//     process.exit(1);
// });

// run_test_get_top_traders().catch(error => {
//     console.error('Unhandled error in test:', error);
//     process.exit(1);
// });

run_test_get_token_trends().catch(error => {
    console.error('Unhandled error in test:', error);
    process.exit(1);
});
