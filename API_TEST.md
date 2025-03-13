Starting API tests...

Testing Historical Data API endpoints...

==================================================
Testing endpoint: /api/make-account-historical-data (current)
Status: SUCCESS ✅
Response data: {
  "status": "success",
  "message": "Historical data generation completed",
  "time": "2025-03-13T20:00:00.000+08:00",
  "results": {
    "success": [
      "ASScii (5BKaHC5BLqo8WqxKZK5n7meYGgW61ZWbMXrNUczhroyKKxQLBgEwjcGzBhcybqsiQXg34MvfZneQG5pBTsicTjua)",
      "TRUMP (5BKaHC5BLqo8WqxKZK5n7meYGgW61ZWbMXrNUczhroyKKxQLBgEwjcGzBhcybqsiQXg34MvfZneQG5pBTsicTjua)",
      "SOL (5BKaHC5BLqo8WqxKZK5n7meYGgW61ZWbMXrNUczhroyKKxQLBgEwjcGzBhcybqsiQXg34MvfZneQG5pBTsicTjua)"
    ],
    "errors": []
  }
}
==================================================


==================================================
Testing endpoint: /api/make-account-historical-data (specific date)
Status: SUCCESS ✅
Response data: {
  "status": "success",
  "message": "Historical data generation completed",
  "time": "2025-03-12T20:00:00.000+08:00",
  "results": {
    "success": [
      "ASScii (5BKaHC5BLqo8WqxKZK5n7meYGgW61ZWbMXrNUczhroyKKxQLBgEwjcGzBhcybqsiQXg34MvfZneQG5pBTsicTjua)",
      "TRUMP (5BKaHC5BLqo8WqxKZK5n7meYGgW61ZWbMXrNUczhroyKKxQLBgEwjcGzBhcybqsiQXg34MvfZneQG5pBTsicTjua)",
      "SOL (5BKaHC5BLqo8WqxKZK5n7meYGgW61ZWbMXrNUczhroyKKxQLBgEwjcGzBhcybqsiQXg34MvfZneQG5pBTsicTjua)"
    ],
    "errors": []
  }
}
==================================================

Testing Bots API endpoints...

==================================================
Testing endpoint: /api/active-holdings
Status: SUCCESS ✅
Response data: {
  "success": true,
  "holdings": [
    {
      "id": 2,
      "Time": 1741879413,
      "Token": "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN",
      "TokenName": "N/A",
      "Balance": 0.116934,
      "SolPaid": 0.01,
      "SolFeePaid": 1004999,
      "SolPaidUSDC": 1.244784425,
      "SolFeePaidUSDC": 0.1251007102340575,
      "PerTokenPaidUSDC": 10.645188097559307,
      "Slot": 326510769,
      "Program": "LIFINITY",
      "BotName": "telegram-trading-bot",
      "WalletPublicKey": "HvFVHQEU341DVCnzQcSQmDQLztz8Tkn2ZBQaHkz7B3on",
      "currentPrice": 10.62,
      "priceSource": "Dexscreener Tokens API",
      "unrealizedPnLUSDC": -0.12804605523405765,
      "unrealizedPnLPercentage": -10.286604866064069,
      "hasValidPrice": true,
      "priceError": null
    }
  ]
}
==================================================


==================================================
Testing endpoint: /api/active-holdings?module=tracker-bot
Status: SUCCESS ✅
Response data: {
  "success": true,
  "holdings": []
}
==================================================


==================================================
Testing endpoint: /api/get-total-profit-loss
Status: SUCCESS ✅
Response data: {
  "success": true,
  "totalProfitLossSOL": 2530192.46,
  "totalProfitLossUSDC": -0.2556216167892138
}
==================================================


==================================================
Testing endpoint: /api/get-total-profit-loss?module=tracker-bot
Status: SUCCESS ✅
Response data: {
  "success": true,
  "totalProfitLossSOL": 0,
  "totalProfitLossUSDC": 0
}
==================================================

Testing Logs API endpoints...

==================================================
Testing endpoint: /api/logs
Status: SUCCESS ✅
Response data: {
  "module": "tracker-bot",
  "date": null,
  "limit": 10,
  "count": 10,
  "logs": [
    {
      "id": 1197,
      "date": "2025-03-13",
      "time": "15:22:12",
      "run_prefix": "c7cce634-694d-4353-8d90-1c919e5e12b0",
      "full_message": "[tracker-bot]|[main]| ✅ Database tables initialized successfully",
      "message": "✅ Database tables initialized successfully",
      "module": "tracker-bot",
      "function": "main",
      "type": "info",
      "data": null,
      "cycle": 0,
      "tag": ""
    },
    {
      "id": 1198,
      "date": "2025-03-13",
      "time": "15:22:12",
      "run_prefix": "c7cce634-694d-4353-8d90-1c919e5e12b0",
      "full_message": "[tracker-bot]|[main]|CYCLE_START: 99",
      "message": "CYCLE_START: 99",
      "module": "tracker-bot",
      "function": "main",
      "type": "info",
      "data": null,
      "cycle": 99,
      "tag": ""
    },
    {
      "id": 1199,
      "date": "2025-03-13",
      "time": "15:22:12",
      "run_prefix": "c7cce634-694d-4353-8d90-1c919e5e12b0",
      "full_message": "Holdings table exists: true",
      "message": "Holdings table exists: true",
      "module": "tracker-bot",
      "function": "unknown",
      "type": "info",
      "data": null,
      "cycle": 0,
      "tag": ""
    },
    {
      "id": 1200,
      "date": "2025-03-13",
      "time": "15:22:12",
      "run_prefix": "c7cce634-694d-4353-8d90-1c919e5e12b0",
      "full_message": "Fetched holdings: 0",
      "message": "Fetched holdings: 0",
      "module": "tracker-bot",
      "function": "unknown",
      "type": "info",
      "data": null,
      "cycle": 0,
      "tag": ""
    },
    {
      "id": 1201,
      "date": "2025-03-13",
      "time": "15:22:12",
      "run_prefix": "c7cce634-694d-4353-8d90-1c919e5e12b0",
      "full_message": "[holding-db]|[getAllHoldings]| Fetched holdings: /Users/hallojohnnypitt/Projects/EVENT-CHI/CRYPTO_TRAIDING_AI/trading_bot/data/holdings.db",
      "message": "Fetched holdings: /Users/hallojohnnypitt/Projects/EVENT-CHI/CRYPTO_TRAIDING_AI/trading_bot/data/holdings.db",
      "module": "holding-db",
      "function": "getAllHoldings",
      "type": "info",
      "data": null,
      "cycle": 0,
      "tag": ""
    },
    {
      "id": 1202,
      "date": "2025-03-13",
      "time": "15:22:12",
      "run_prefix": "c7cce634-694d-4353-8d90-1c919e5e12b0",
      "full_message": "[tracker-bot]|[main]|Found Holdings: 0",
      "message": "Found Holdings: 0",
      "module": "tracker-bot",
      "function": "main",
      "type": "info",
      "data": [],
      "cycle": 99,
      "tag": ""
    },
    {
      "id": 1203,
      "date": "2025-03-13",
      "time": "15:22:12",
      "run_prefix": "c7cce634-694d-4353-8d90-1c919e5e12b0",
      "full_message": "[tracker-bot]|[main]| No token holdings yet as of 2025-03-13T15:22:12.179Z",
      "message": "No token holdings yet as of 2025-03-13T15:22:12.179Z",
      "module": "tracker-bot",
      "function": "main",
      "type": "info",
      "data": null,
      "cycle": 99,
      "tag": ""
    },
    {
      "id": 1204,
      "date": "2025-03-13",
      "time": "15:22:12",
      "run_prefix": "c7cce634-694d-4353-8d90-1c919e5e12b0",
      "full_message": "[tracker-bot]|[main]|CYCLE_END: 100 | WAITING 60 seconds before next check...",
      "message": "CYCLE_END: 100 | WAITING 60 seconds before next check...",
      "module": "tracker-bot",
      "function": "main",
      "type": "info",
      "data": null,
      "cycle": 100,
      "tag": ""
    },
    {
      "id": 1189,
      "date": "2025-03-13",
      "time": "15:21:12",
      "run_prefix": "c7cce634-694d-4353-8d90-1c919e5e12b0",
      "full_message": "[tracker-bot]|[main]| ✅ Database tables initialized successfully",
      "message": "✅ Database tables initialized successfully",
      "module": "tracker-bot",
      "function": "main",
      "type": "info",
      "data": null,
      "cycle": 0,
      "tag": ""
    },
    {
      "id": 1190,
      "date": "2025-03-13",
      "time": "15:21:12",
      "run_prefix": "c7cce634-694d-4353-8d90-1c919e5e12b0",
      "full_message": "[tracker-bot]|[main]|CYCLE_START: 98",
      "message": "CYCLE_START: 98",
      "module": "tracker-bot",
      "function": "main",
      "type": "info",
      "data": null,
      "cycle": 98,
      "tag": ""
    }
  ]
}
==================================================

Testing Profit Losses API endpoints...

==================================================
Testing endpoint: /api/get-profit-losses (default)
Status: SUCCESS ✅
Response data: {
  "success": true,
  "records": [
    {
      "id": 2,
      "Time": 1741871781801,
      "EntryTime": 1741871578,
      "Token": "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN",
      "TokenName": "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN",
      "EntryBalance": 0.117574,
      "ExitBalance": 117574,
      "EntrySolPaid": 0.01,
      "ExitSolReceived": 1265096.24,
      "TotalSolFees": 1004999,
      "ProfitLossSOL": 1265096.23,
      "ProfitLossUSDC": -0.1278108083946069,
      "ROIPercentage": -10.098002018102836,
      "EntryPriceUSDC": 10.765168574684878,
      "ExitPriceUSDC": 10.76,
      "HoldingTimeSeconds": 1740129910,
      "Slot": 326491009,
      "Program": "UNKNOWN",
      "BotName": "telegram-trading-bot",
      "IsTakeProfit": 0,
      "WalletPublicKey": "HvFVHQEU341DVCnzQcSQmDQLztz8Tkn2ZBQaHkz7B3on"
    },
    {
      "id": 1,
      "Time": 1741871778984,
      "EntryTime": 1741871578,
      "Token": "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN",
      "TokenName": "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN",
      "EntryBalance": 0.117574,
      "ExitBalance": 117574,
      "EntrySolPaid": 0.01,
      "ExitSolReceived": 1265096.24,
      "TotalSolFees": 1004999,
      "ProfitLossSOL": 1265096.23,
      "ProfitLossUSDC": -0.1278108083946069,
      "ROIPercentage": -10.098002018102836,
      "EntryPriceUSDC": 10.765168574684878,
      "ExitPriceUSDC": 10.76,
      "HoldingTimeSeconds": 1740129907,
      "Slot": 326491009,
      "Program": "UNKNOWN",
      "BotName": "telegram-trading-bot",
      "IsTakeProfit": 0,
      "WalletPublicKey": "HvFVHQEU341DVCnzQcSQmDQLztz8Tkn2ZBQaHkz7B3on"
    }
  ]
}
==================================================


==================================================
Testing endpoint: /api/get-profit-losses (with filters)
Status: SUCCESS ✅
Response data: {
  "success": true,
  "records": []
}
==================================================

Testing Performance Metrics API endpoints...

==================================================
Testing endpoint: /api/performance-metrics
Status: SUCCESS ✅
Response data: {
  "success": true,
  "metrics": {
    "winRate": {
      "value": "0.0",
      "change": 0
    },
    "totalTrades": {
      "value": 2,
      "change": 0
    },
    "volume": {
      "value": "2.53",
      "change": 0
    },
    "poolSize": {
      "value": "1.24",
      "change": -17.1
    }
  }
}
==================================================

Testing Agent Performance Chart API endpoints...

==================================================
Testing endpoint: /api/`agent-performance-chart`
Status: SUCCESS ✅
Response data: {
  "success": true,
  "chartData": {
    "datasets": [
      {
        "label": "Agent Performance (30 Days)",
        "data": [
          {
            "x": "Feb 11",
            "y": 100
          },
          {
            "x": "Feb 12",
            "y": 100
          },
          {
            "x": "Feb 13",
            "y": 100
          },
          {
            "x": "Feb 14",
            "y": 100
          },
          {
            "x": "Feb 15",
            "y": 100
          },
          {
            "x": "Feb 16",
            "y": 100
          },
          {
            "x": "Feb 17",
            "y": 100
          },
          {
            "x": "Feb 18",
            "y": 100
          },
          {
            "x": "Feb 19",
            "y": 100
          },
          {
            "x": "Feb 20",
            "y": 100
          },
          {
            "x": "Feb 21",
            "y": 100
          },
          {
            "x": "Feb 22",
            "y": 100
          },
          {
            "x": "Feb 23",
            "y": 100
          },
          {
            "x": "Feb 24",
            "y": 100
          },
          {
            "x": "Feb 25",
            "y": 100
          },
          {
            "x": "Feb 26",
            "y": 100
          },
          {
            "x": "Feb 27",
            "y": 100
          },
          {
            "x": "Feb 28",
            "y": 100
          },
          {
            "x": "Mar 1",
            "y": 100
          },
          {
            "x": "Mar 2",
            "y": 100
          },
          {
            "x": "Mar 3",
            "y": 100
          },
          {
            "x": "Mar 4",
            "y": 100
          },
          {
            "x": "Mar 5",
            "y": 100
          },
          {
            "x": "Mar 6",
            "y": 100
          },
          {
            "x": "Mar 7",
            "y": 100
          },
          {
            "x": "Mar 8",
            "y": 100
          },
          {
            "x": "Mar 9",
            "y": 100
          },
          {
            "x": "Mar 10",
            "y": 100
          },
          {
            "x": "Mar 11",
            "y": 100
          },
          {
            "x": "Mar 12",
            "y": 97.98039959637944
          }
        ],
        "borderColor": "rgba(255, 20, 147, 1)",
        "backgroundColor": "transparent",
        "borderWidth": 2,
        "fill": true,
        "tension": 0.4
      }
    ]
  }
}
==================================================

Testing Pool Data API endpoints...

==================================================
Testing endpoint: /api/get-pool-data (default)
Status: SUCCESS ✅
Response data: {
  "success": true,
  "poolData": {
    "poolSizeTotalValueUSDC": 93.41105634102776,
    "tokens": [
      {
        "tokenName": "ASScii",
        "tokenSymbol": "ASScii",
        "tokenMint": "6t7heUCjsgxa5ZwFQyfZwY9cEm9ACMxjgJrH1MELpump",
        "balance": 6750225.165547,
        "tokenValueUSDC": 81.54271999980776,
        "percentage": 87.2945058046547
      },
      {
        "tokenName": "OFFICIAL TRUMP",
        "tokenSymbol": "TRUMP",
        "tokenMint": "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN",
        "balance": 0.612176,
        "tokenValueUSDC": 6.50130912,
        "percentage": 6.959892516646889
      },
      {
        "tokenName": "Solana",
        "tokenSymbol": "SOL",
        "tokenMint": "So11111111111111111111111111111111111111112",
        "balance": 0.043122507,
        "tokenValueUSDC": 5.367027221219999,
        "percentage": 5.745601678698399
      }
    ]
  }
}
==================================================


==================================================
Testing endpoint: /api/get-pool-data (with wallets)
Status: SUCCESS ✅
Response data: {
  "success": true,
  "poolData": {
    "poolSizeTotalValueUSDC": 93.41105634102776,
    "tokens": [
      {
        "tokenName": "ASScii",
        "tokenSymbol": "ASScii",
        "tokenMint": "6t7heUCjsgxa5ZwFQyfZwY9cEm9ACMxjgJrH1MELpump",
        "balance": 6750225.165547,
        "tokenValueUSDC": 81.54271999980776,
        "percentage": 87.2945058046547
      },
      {
        "tokenName": "OFFICIAL TRUMP",
        "tokenSymbol": "TRUMP",
        "tokenMint": "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN",
        "balance": 0.612176,
        "tokenValueUSDC": 6.50130912,
        "percentage": 6.959892516646889
      },
      {
        "tokenName": "Solana",
        "tokenSymbol": "SOL",
        "tokenMint": "So11111111111111111111111111111111111111112",
        "balance": 0.043122507,
        "tokenValueUSDC": 5.367027221219999,
        "percentage": 5.745601678698399
      }
    ]
  }
}
==================================================

Testing Pool Historical Data API endpoints...

==================================================
Testing endpoint: /api/get-pool-historical-data
Status: SUCCESS ✅
Response data: {
  "success": true,
  "timeframe": "30d",
  "data": [
    {
      "x": "Mar 12",
      "y": 550431724.82
    },
    {
      "x": "Mar 13",
      "y": 550431724.82
    }
  ],
  "rawData": [
    {
      "timestamp": 1741780800000,
      "totalValueUSDC": 550431724.8211472,
      "tokens": [
        {
          "tokenName": "ASScii",
          "tokenSymbol": "ASScii",
          "tokenMint": "6t7heUCjsgxa5ZwFQyfZwY9cEm9ACMxjgJrH1MELpump",
          "balance": 6750225.165547,
          "tokenValueUSDC": 550431720.609855,
          "percentage": 99.99999923491107
        },
        {
          "tokenName": "OFFICIAL TRUMP",
          "tokenSymbol": "TRUMP",
          "tokenMint": "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN",
          "balance": 0.612176,
          "tokenValueUSDC": 3.9799454118451205,
          "percentage": 7.230588704054679e-7
        },
        {
          "tokenName": "Solana",
          "tokenSymbol": "SOL",
          "tokenMint": "So11111111111111111111111111111111111111112",
          "balance": 0.043122507,
          "tokenValueUSDC": 0.23134669138575173,
          "percentage": 4.203004313767046e-8
        }
      ]
    },
    {
      "timestamp": 1741867200000,
      "totalValueUSDC": 550431724.8212402,
      "tokens": [
        {
          "tokenName": "ASScii",
          "tokenSymbol": "ASScii",
          "tokenMint": "6t7heUCjsgxa5ZwFQyfZwY9cEm9ACMxjgJrH1MELpump",
          "balance": 6750225.165547,
          "tokenValueUSDC": 550431720.609855,
          "percentage": 99.99999923489419
        },
        {
          "tokenName": "OFFICIAL TRUMP",
          "tokenSymbol": "TRUMP",
          "tokenMint": "6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN",
          "balance": 0.612176,
          "tokenValueUSDC": 3.9799454118451205,
          "percentage": 7.230588704053458e-7
        },
        {
          "tokenName": "Solana",
          "tokenSymbol": "SOL",
          "tokenMint": "So11111111111111111111111111111111111111112",
          "balance": 0.043122507,
          "tokenValueUSDC": 0.23143966891624995,
          "percentage": 4.204693488396094e-8
        }
      ]
    }
  ]
}
==================================================

Testing Trading History API endpoints...

==================================================
Testing endpoint: /api/get-trading-history (default)
Status: SUCCESS ✅
Response data: {
  "success": true,
  "historyWithComments": {}
}
==================================================


==================================================
Testing endpoint: /api/get-trading-history (with filters)
Status: SUCCESS ✅
Response data: {
  "success": true,
  "historyWithComments": {}
}
==================================================