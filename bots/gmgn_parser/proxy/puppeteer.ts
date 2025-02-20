import { Browser, Page } from "puppeteer";
import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { delay } from "../utils/tools";
import * as fs from "fs";
import * as path from "path";

puppeteer.use(StealthPlugin());

function cleanupUserDataDir(userDataDir: string) {
  const lockFile = path.join(userDataDir, 'SingletonLock');
  if (fs.existsSync(lockFile)) {
    try {
      fs.unlinkSync(lockFile);
      console.log('Removed stale lock file');
    } catch (error) {
      console.warn('Failed to remove lock file:', error);
    }
  }
}

export async function createBrowser(
  headless: boolean,
  userDataDir: string
): Promise<Browser> {
  // Clean up any stale lock files
  cleanupUserDataDir(userDataDir);
  
  // Ensure the directory exists
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  const commonOptions = {
    headless,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--single-process",
      "--no-zygote",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--disable-gpu",
      "--window-size=1920,1080",
      "--remote-debugging-port=9222"
    ],
    timeout: 120000,
    protocolTimeout: 60000,
    defaultViewport: {
      width: 1920,
      height: 1080
    },
    ignoreHTTPSErrors: true,
  };

  try {
    console.log('Launching browser with user data directory...');
    return await puppeteer.launch({
      ...commonOptions,
      userDataDir
    });
  } catch (error) {
    console.error('Failed to launch browser with user data directory:', error);
    console.log('Retrying without user data directory...');
    
    try {
      return await puppeteer.launch(commonOptions);
    } catch (retryError) {
      console.error('Failed to launch browser on retry:', retryError);
      
      // Final attempt with minimal options
      console.log('Final attempt with minimal options...');
      return await puppeteer.launch({
        headless,
        args: ["--no-sandbox"],
        timeout: 120000,
        protocolTimeout: 60000
      });
    }
  }
}

export async function scrapePage(
  url: string,
  browser: Browser,
  delay_time = 5000,
  maxRetries = 3,
  retryDelay = 2000
) {
  let retryCount = 0;
  let page: Page | null = null;

  while (retryCount <= maxRetries) {
    try {
      if (page) {
        await page.close().catch(console.error);
      }
      
      page = await browser.newPage();
      
      // Set longer timeouts for navigation
      await page.setDefaultNavigationTimeout(60000);
      await page.setDefaultTimeout(60000);
      
      // Set a user agent
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      console.log("URL:", url);
      
      // Navigate with timeout
      await Promise.race([
        page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Navigation timeout')), 60000))
      ]);

      await delay(delay_time); // Cloudflare verify time

      await page.waitForSelector(".json-formatter-container", {
        timeout: 60000,
      });

      const jsonData = await getJsonData(page);
      if (jsonData) {
        return jsonData;
      }
      throw new Error('Failed to get JSON data');
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.log(
        `Retry ${retryCount + 1}/${maxRetries}: Error - ${errorMessage}`
      );

      retryCount++;
      if (retryCount > maxRetries) {
        console.error("Max retries reached. Aborting...");
        return null;
      }

      await delay(retryDelay);
    } finally {
      if (page) {
        await page.close().catch(console.error);
      }
    }
  }
  return null;
}

async function getJsonData(page: Page): Promise<any> {
  try {
    const jsonData = await page.evaluate(() => {
      const preElement = document.querySelector("pre");
      if (preElement) {
        try {
          const jsonText = preElement.textContent || "";
          return JSON.parse(jsonText);
        } catch (error) {
          console.error("Error parsing JSON:", error);
          return null;
        }
      } else {
        console.error("No <pre> element found.");
        return null;
      }
    });

    return jsonData;
  } catch (error) {
    console.error("Error in getJsonData:", error);
    return null;
  }
}
