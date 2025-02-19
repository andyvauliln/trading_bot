import {
  Connection,
  PublicKey,
  VersionedTransactionResponse,
} from "@solana/web3.js";
import { fetchWithFlareSolverr } from "../proxy/flaresolverr";
import {
  ApiResponse,
  HolderInfo,
  RankInfo,
  TopBuyersHolders,
  TransactionInfo,
} from "./interface";
import { parseHolders } from "./address";
import { saveCsvFile } from "./tools";
import * as dotenv from "dotenv";
import {
  extractTransactionType,
  parseData,
  PumpFunProgramId,
  TokenProgramID,
} from "./solana_tools";
dotenv.config();

class SmartAddressAnalyzer {
  public connection: Connection;
  private cache: Map<string, any>;

  constructor(rpcEndpoint: string) {
    this.connection = new Connection(rpcEndpoint);
    this.cache = new Map(); // Simple cache mechanism
  }

  // Get and analyze addresses
  async analyzeAddresses(tokenAddress: string) {
    const gmgnData = await this.getGMGNData(tokenAddress);
    if (!gmgnData) {
      console.log("getGMGNData error: data is null");
      return [];
    }

    const enrichedAddresses = await this.enrichAddressData(gmgnData.address);
    const smartAddresses = await this.filterSmartAddresses(enrichedAddresses);
    return smartAddresses;
  }

  private async getGMGNData(tokenAddress: string) {
    const proxyUrl = `https://gmgn.ai/defi/quotation/v1/tokens/top_buyers/sol/${tokenAddress}`;

    // Cache results to avoid repeated requests
    if (this.cache.has(proxyUrl)) {
      return this.cache.get(proxyUrl);
    }
    try {
      const res: ApiResponse<{ holders: TopBuyersHolders }> =
        await fetchWithFlareSolverr(proxyUrl);
      const parsedHolders = parseHolders(res.data.holders);

      this.cache.set(proxyUrl, parsedHolders);
      return parsedHolders;
    } catch (error) {
      console.error(`error ${error}`);
      return null;
    }
  }

  private async enrichAddressData(addresses: string[]) {
    // Use Promise.all for parallel processing to improve performance
    const enrichedData = await Promise.all(
      addresses.map(async (address) => {
        try {
          const txHistory = await this.getTransactionHistory(address);
          const tradingPattern = await this.analyzeTradingPattern(txHistory);
          return {
            address,
            transactions: txHistory,
            pattern: tradingPattern,
            performance: await this.calculatePerformance(txHistory),
          };
        } catch (error) {
          console.error(`Error processing address ${address}:`, error);
          return null; // Ignore error addresses
        }
      })
    );

    return enrichedData.filter((data) => data !== null);
  }

  async getTransactionHistory(address: string, limit = 50) {
    const pubkey = new PublicKey(address);

    // Cache transaction history to avoid repeated requests
    // if (this.cache.has(address)) {
    //   return this.cache.get(address);
    // }

    const signatures = await this.connection.getSignaturesForAddress(pubkey, {
      limit,
    });
    console.log(`signatures length ${signatures.length}`);

    const transactions: TransactionInfo[] = [];
    for (const sig of signatures) {
      const tx = await this.connection.getTransaction(sig.signature, {
        maxSupportedTransactionVersion: 0,
      });
      if (tx) {
        transactions.push(this.parseTransaction(tx));
      }
    }

    // this.cache.set(address, transactions);
    return transactions;
  }

  parseTransaction(tx: VersionedTransactionResponse): TransactionInfo {
    const message = tx.transaction.message;
    let type = "unknown";
    let amount = 0;
    const instructions = message.compiledInstructions;
    const timestamp = tx.blockTime as number;
    const logs = tx.meta?.logMessages;
    if (logs) {
      type = extractTransactionType(logs);
      const gasPriceLog = logs.find((log) => log.includes("Program consumed"));
      const gasPrice = gasPriceLog ? parseFloat(gasPriceLog.split(" ")[2]) : 0;
    }
    let accountKeys = tx.transaction.message.staticAccountKeys;
    let tokenAddress = instructions.find((instruction) => {
      const programId =
        tx.transaction.message.staticAccountKeys[
          instruction.programIdIndex
        ].toBase58();
      if (programId === PumpFunProgramId) {
        const tokenAddressIndex =
          instruction.accountKeyIndexes[1] || instruction.accountKeyIndexes[0];
        const tokenAddress = accountKeys[tokenAddressIndex]?.toBase58();
        return tokenAddress;
      } else {
        return null;
      }
    });
    console.log({ tokenAddress, type, logs });

    return {
      timestamp,
      tokenAddress: "", // Parse token address
      type: type,
      amount: amount,
      profit: 0, // Profit situation (needs more information to calculate)
      gasPrice: 0, // Gas settings
    };
  }

  async parseInnerInstructions(transaction: VersionedTransactionResponse) {
    const innerInstructions = transaction.meta?.innerInstructions || [];
  }

  private async analyzeTradingPattern(transactions: TransactionInfo[]) {
    return {
      avgHoldingTime: this.calculateAvgHoldingTime(transactions),
      successRate: this.calculateSuccessRate(transactions),
      avgProfit: this.calculateAvgProfit(transactions),
      preferredGasStrategy: this.analyzeGasStrategy(transactions),
      tradingFrequency: this.calculateTradingFrequency(transactions),
    };
  }

  private async filterSmartAddresses(enrichedData: any[]) {
    return enrichedData.filter((data) => {
      const { pattern, performance } = data;
      return (
        pattern.successRate > 0.6 && // Success rate above 60%
        pattern.avgProfit > 0.3 && // Average profit above 30%
        pattern.tradingFrequency > 2 && // Active trading frequency
        performance.totalTrades > 5 // At least 5 trade records
      );
    });
  }

  // Calculate average holding time
  private calculateAvgHoldingTime(txs: TransactionInfo[]) {
    const buySellPairs = txs.filter(
      (tx) => tx.type === "buy" || tx.type === "sell"
    );
    if (buySellPairs.length < 2) return 0;

    let totalHoldTime = 0;
    for (let i = 0; i < buySellPairs.length - 1; i += 2) {
      const buyTime = new Date(buySellPairs[i].timestamp).getTime(); // Convert to millisecond timestamp
      const sellTime = new Date(buySellPairs[i + 1].timestamp).getTime();
      totalHoldTime += sellTime - buyTime;
    }

    return totalHoldTime / (buySellPairs.length / 2);
  }

  // Calculate success rate
  private calculateSuccessRate(txs: TransactionInfo[]) {
    const profitableTrades = txs.filter((tx) => tx.profit > 0).length;
    return profitableTrades / txs.length;
  }

  // Calculate average profit
  private calculateAvgProfit(txs: TransactionInfo[]) {
    const totalProfit = txs.reduce((sum, tx) => sum + tx.profit, 0);
    return totalProfit / txs.length;
  }

  // Analyze Gas strategy
  private analyzeGasStrategy(txs: TransactionInfo[]) {
    const gasPrices = txs.map((tx) => tx.gasPrice);
    const avgGasPrice =
      gasPrices.reduce((sum, gas) => sum + gas, 0) / gasPrices.length;
    return avgGasPrice;
  }

  // Calculate trading frequency
  private calculateTradingFrequency(txs: TransactionInfo[]) {
    if (txs.length < 2) return 0;

    const firstTx = new Date(txs[0].timestamp).getTime();
    const lastTx = new Date(txs[txs.length - 1].timestamp).getTime();

    // Calculate total time interval in seconds
    const totalDurationInSeconds = (lastTx - firstTx) / 1000;

    // Transactions per second
    const frequencyPerSecond = txs.length / totalDurationInSeconds;

    // Return transactions per hour
    return frequencyPerSecond * 3600; // 3600 seconds in an hour
  }

  // Calculate overall performance
  private calculatePerformance(txs: TransactionInfo[]) {
    const totalTrades = txs.length;
    const profitableTrades = txs.filter((tx) => tx.profit > 0).length;
    const totalProfit = txs.reduce((sum, tx) => sum + tx.profit, 0);
    const avgReturnPerTrade = totalProfit / totalTrades;

    return {
      totalTrades,
      profitableTrades,
      totalProfit,
      avgReturnPerTrade,
    };
  }
}

const rpc = process.env.SOL_PRC_URL as string;
const analyzer = new SmartAddressAnalyzer(rpc);

let address = "8TyCE2H2RW3VTGRGqpXaJkSyN4tXZ1yzrQAQVQU7bz7e";
let signature =
  "2DMq9pEZ1DjK4f9VHR41ES6q4baFSKorEBjfy6tEn7CMoo6ChvLRDBd2bCD1441tTTWbAmZN6rebMt138VpEbwwz";

const test = async () => {
  const tx = await analyzer.connection.getTransaction(signature, {
    maxSupportedTransactionVersion: 0,
  });
  if (tx) {
    analyzer.parseInnerInstructions(tx);
  }
};

test().catch(console.error);
