import { Browser } from "puppeteer";
import { createBrowser, scrapePage } from "./proxy/puppeteer";
import { AdderssList } from "./utils/interface";
import {
  MeMeList,
  OKXApiResponse,
  SmartMoney,
  SmartMoneyList,
  TokenData,
} from "./utils/okx-interface";
import {
  formattedDate,
  readJsonFile,
  saveJsonFile,
  chainIdMap,
} from "./utils/tools";

const MAX_CONCURRENT_REQUESTS = 5; // Control concurrency

class OkxSmartAddressAnalyzer {
  okxTokenMap = new Map<number, TokenData[]>();
  okxTokenSmartMoneyMap = new Map<number, SmartMoney[]>();

  async analyzeAddresses(chain: string, tag?: string): Promise<AdderssList[]> {
    return [];
  }

  async fetchPaginatedData<T>(
    browser: Browser,
    url: URL,
    processResult: (res: OKXApiResponse<T>) => void,
    pageSize: number
  ): Promise<void> {
    let pageNo = 1;
    const requests: Promise<void>[] = []; // Collect all requests
    let total = 0;

    // Get first page data and total count
    try {
      url.searchParams.set("pageNo", pageNo.toString());
      url.searchParams.set("t", Date.now().toString());
      const res: OKXApiResponse<T> = await scrapePage(
        url.toString(),
        browser,
        10
      );
      processResult(res);
      total = (res.data as any).total;
      pageNo++;
    } catch (error) {
      console.error(`error ${error}`);
      return;
    }

    // Calculate remaining pages and control concurrent requests
    const totalPages = Math.ceil(total / pageSize);
    for (pageNo; pageNo <= totalPages; pageNo++) {
      url.searchParams.set("pageNo", pageNo.toString());
      url.searchParams.set("t", Date.now().toString());
      requests.push(
        scrapePage(url.toString(), browser, 10)
          .then((res: OKXApiResponse<T>) => {
            processResult(res);
          })
          .catch((error) => console.error(`Page ${pageNo} error: ${error}`))
      );

      // Control concurrency
      if (requests.length >= MAX_CONCURRENT_REQUESTS) {
        await Promise.allSettled(requests);
        requests.length = 0; // Clear completed requests
      }
    }
    await Promise.allSettled(requests); // Process remaining requests
  }

  async queryTokens(
    browser: Browser,
    chainId: number,
    txnSource = [1]
  ): Promise<void> {
    const url = new URL(
      "https://www.okx.com/priapi/v1/invest/activity/smart-money/token/page"
    );
    url.searchParams.set("chainId", chainId.toString());
    url.searchParams.set("txnSource", txnSource.join(","));
    url.searchParams.set("pageSize", "50");
    url.searchParams.set("duration", "3");
    url.searchParams.set("order", "tokenTradingTime");

    await this.fetchPaginatedData<MeMeList>(
      browser,
      url,
      (res) => {
        const existingList = this.okxTokenMap.get(chainId) || [];
        this.okxTokenMap.set(chainId, existingList.concat(res.data.result));
      },
      50
    );
  }

  async queryTokenSmartMoney(
    browser: Browser,
    chainId: number,
    tokenAddress: string,
    time: string
  ): Promise<void> {
    const url = new URL(
      "https://www.okx.com/priapi/v1/invest/activity/smart-money/token/holding/list"
    );
    url.searchParams.set("chainId", chainId.toString());
    url.searchParams.set("tokenAddress", tokenAddress);
    url.searchParams.set("pageSize", "50");

    await this.fetchPaginatedData<SmartMoneyList>(
      browser,
      url,
      (res) => {
        const updatedResults = res.data.result.map((result) => {
          if (!result.userWalletAddress) {
            console.log(result);
          }
          return {
            address: result.userWalletAddress as string,
            winRate: result.winRate,
            tags: ["Smart Money"],
            time,
          };
        });
        const existingList = this.okxTokenSmartMoneyMap.get(chainId) || [];
        this.okxTokenSmartMoneyMap.set(
          chainId,
          existingList.concat(updatedResults)
        );
      },
      50
    );
  }

  removeDuplicates(list: SmartMoney[]): SmartMoney[] {
    const seen = new Set<string>();
    list.sort((a, b) => parseFloat(b.winRate) - parseFloat(a.winRate));
    return list.filter(
      (item) => !seen.has(item.address) && seen.add(item.address)
    );
  }
}

export async function okxMain(browser?: Browser) {
  let close = false;
  let localBrowser: Browser | undefined = browser;
  
  try {
    if (!localBrowser) {
      localBrowser = await createBrowser(true, "./tmp/okx/session");
      close = true;
    }
    
    const time = formattedDate();
    const smartAddressAnalyzer = new OkxSmartAddressAnalyzer();
    const chainIds = [501, 1];
    const txnSource = [[1, 2], [1]];
    await Promise.all(
      chainIds.map((chainId, index) =>
        smartAddressAnalyzer.queryTokens(localBrowser!, chainId, txnSource[index])
      )
    );

    const batchSize = 50;
    for (const chainId of chainIds) {
      const list = smartAddressAnalyzer.okxTokenMap.get(chainId);
      if (!list) continue;

      for (let i = 0; i < list.length; i += batchSize) {
        const batch = list.slice(i, i + batchSize);
        console.log(`list.length: ${list.length} i: ${i}`);
        await Promise.allSettled(
          batch.map((token) =>
            smartAddressAnalyzer.queryTokenSmartMoney(
              localBrowser!,
              chainId,
              token.tokenAddress,
              time
            )
          )
        );
      }

      let smartMoney = smartAddressAnalyzer.okxTokenSmartMoneyMap.get(chainId);
      console.log(`smartMoney list.length: ${smartMoney?.length} `);

      if (smartMoney) {
        smartMoney = smartAddressAnalyzer.removeDuplicates(smartMoney);
        console.log(
          `smartMoney after removing duplicates list.length: ${smartMoney?.length} `
        );
        await compareCsv(smartMoney, chainIdMap[chainId]);
      }
    }
  } catch (error) {
    console.error('Error in okxMain:', error);
    throw error;
  } finally {
    if (close && localBrowser) {
      try {
        await localBrowser.close();
      } catch (closeError) {
        console.warn('Error closing browser:', closeError);
      }
    }
  }
}

const compareCsv = async (smartMoney: SmartMoney[], chainInfo: string) => {
  const path = `./json/OKX_${chainInfo}_Address.json`;
  try {
    const history = await readJsonFile<SmartMoney>(path);
    const oldAddresses = new Set<string>(history.map((item) => item.address));
    const uniqueNewItems = smartMoney.filter(
      (item) => !oldAddresses.has(item.address)
    );
    console.log("uniqueNewItems", uniqueNewItems.length);
    if (uniqueNewItems.length > 0) {
      await saveJsonFile(path, uniqueNewItems, true);
    }
  } catch (error) {
    await saveJsonFile(path, smartMoney);
  }
}; 

