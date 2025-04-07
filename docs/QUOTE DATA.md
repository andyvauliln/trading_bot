 QUOTE DATA
{
  inputMint: '3MadWqcN9cSrULn8ikDnan9mF3znoQmBPXtVy6BfSTDB',
  inAmount: '2586757446',
  outputMint: 'So11111111111111111111111111111111111111112',
  outAmount: '9816826',
  otherAmountThreshold: '9424153',
  swapMode: 'ExactIn',
  slippageBps: 400,
  platformFee: null,
  priceImpactPct: '0.005135620905978365453844648',
  routePlan: [
    {
      swapInfo: {
        ammKey: 'DsktL4KrnnsupVfjb1uW4aoudgN8ooz4DtepPSAbmdN3',
        label: 'Raydium',
        inputMint: '3MadWqcN9cSrULn8ikDnan9mF3znoQmBPXtVy6BfSTDB',
        outputMint: 'So11111111111111111111111111111111111111112',
        inAmount: '2586757446',
        outAmount: '9816826',
        feeAmount: '6466893',
        feeMint: '3MadWqcN9cSrULn8ikDnan9mF3znoQmBPXtVy6BfSTDB'
      },
      percent: 100
    }
  ],
  scoreReport: null,
  contextSlot: 331249067,
  timeTaken: 0.000300679,
  swapUsdValue: '1.1291395409672532342105232586',
  simplerRouteUsed: false,
  mostReliableAmmsQuoteReport: {
    info: {
      DsktL4KrnnsupVfjb1uW4aoudgN8ooz4DtepPSAbmdN3: '9816826',
      Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE: 'Not used'
    }
  }
}


HOLDING BUY DATA
{
    id: 37,
    Time: 1742979382,
    TimeDate: '2025-03-26T08:56:22.000Z',
    Token: '3MadWqcN9cSrULn8ikDnan9mF3znoQmBPXtVy6BfSTDB',
    TokenName: 'GrokCoin',
    Balance: 2586.757446,
    SolPaid: 0.01,
    SolFeePaid: 0.000058177,
    SolPaidUSDC: 1.44300709,
    SolFeePaidUSDC: 0.008394982347493002,
    PerTokenPaidUSDC: 0.0005578439881293764,
    Slot: 329266993,
    Program: 'RAYDIUM',
    BotName: 'telegram-trading-bot',
    WalletPublicKey: '3PM9ByJwxoX8LpKiSqoVvKsS6xEkakkQ9Civj3tBCK5c',
    TxId: '54UyBAZybWYLQBENnMBVJmAXomgZVCejrjh4HuKd73PrVXiCj3UjaMzYiUwEbgUmdPkmxD45wcYZTLCnP9o14JQq',
    SellAttempts: 0,
    IsSkipped: 0,
    LastAttemptTime: null,
    LastAttemptTimeDate: null,
    LamportsBalance: null,
    Decimals: 9
  }

REAL CURRENT PRICE: $0.00043246
PNL DATA CALCULATION
{
  "botName": "tracker-bot",
  "tokenName": "GrokCoin",
  "tokenAddress": "3MadWqcN9cSrULn8ikDnan9mF3znoQmBPXtVy6BfSTDB",
  "tokenBalance": 2586.757446,
  "tokenBalanceRaw": "2586757446",
  "initialPriceUSDC": 0.0005578439881293764,
  "currentPriceUSDC": 1.1502083677221673e-7,//WRONG, SHOULD BE 0.00043246. I think it's total value of all sold tokens
  "priceDiffUSD": -0.0005577289672926042,
  "priceDiffPercentUSDC": -99.97938118197564, // should be positive in our case if initial price is lower than current price
  "isIncludeFee": true,
  "totalInvestmentUSDC": 1.451402072347493,// is this diffrent because of the fee?
  "currentValueUSDC": 124.79056770384616,
  "pnlUSD": 123.33916563149867,
  "pnlPercent": 8497.932308447811,
  "solanaPrice": "115.123215000",
  "priceImpact": 0.005135620905978366,
  "slippageBps": 400,
  "slippagePercent": 4,
  "fees": {
    "entryFeeUSDC": 0.008394982347493002,
    "entryFeeSOL": 0.000058177,
    "exitFeeUSDC": -45205778.203695, //why so high, why negative?
    "exitFeeSOL": -392673, //why, so high, why negative?
    "routeFeesSOL": 6466893, //why so high?
    "platformFeeSOL": 0
  },
  "currentStopLossStrategy": {
    "type": "stop_loss",
    "threshold": 20,
    "threshold_unit": "percent",
    "sellAmount": 100,
    "sellAmount_unit": "percent",
    "order": 1,
    "executed": false
  },
  "currentTakeProfitStrategy": {
    "type": "take_profit",
    "threshold": 20,
    "threshold_unit": "percent",
    "sellAmount": 30,
    "sellAmount_unit": "percent",
    "order": 2,
    "executed": false
  },
  "botStrategy": {
    "stop_loss": [
      {
        "type": "stop_loss",
        "threshold": 20,
        "threshold_unit": "percent",
        "sellAmount": 100,
        "sellAmount_unit": "percent",
        "order": 1,
        "executed": false
      }
    ],
    "take_profit": [
      {
        "type": "take_profit",
        "threshold": 20,
        "threshold_unit": "percent",
        "sellAmount": 30,
        "sellAmount_unit": "percent",
        "order": 2,
        "executed": false
      },
      {
        "type": "take_profit",
        "threshold": 50,
        "threshold_unit": "percent",
        "sellAmount": 40,
        "sellAmount_unit": "percent",
        "order": 3,
        "executed": false
      },
      {
        "type": "take_profit",
        "threshold": 100,
        "threshold_unit": "percent",
        "sellAmount": 30,
        "sellAmount_unit": "percent",
        "order": 4,
        "executed": false
      }
    ]
  },
  "shouldStopLoss": false,
  "shouldTakeProfit": true,
  "amountToSell": 776.0272338,
  "rawLamportsAmountToSell": "776027233",
  "leftAmountOfToken": 1800.727446// add it to the data also
}


also need think about how to connect strategy to the bot
rethink strategy about how percents for pnl are calculated