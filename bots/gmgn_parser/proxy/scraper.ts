import { chromium, Page } from "playwright";
import { delay } from "../utils/tools";

export async function scrapePage(url: string) {
  const browser = await chromium.launch({
    headless: false, // Set to true for headless mode
  });
  console.log("URL:", url);
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url);

  console.log("Please complete Cloudflare verification manually...");
  await page.waitForTimeout(5000);

  console.log("Starting data scraping...");

  await page.waitForSelector(".json-formatter-container"); // Wait for specific selector

  const jsonData = await page.evaluate(() => {
    // Find element containing JSON (assuming it's in a <pre> tag)
    const preElement = document.querySelector("pre");
    if (preElement) {
      try {
        // Extract and parse JSON data
        const jsonText = preElement.textContent || "";
        return JSON.parse(jsonText); // Parse string to JSON object
      } catch (error) {
        console.error("Error parsing JSON:", error);
        return null;
      }
    } else {
      console.error("No <pre> element found.");
      return null;
    }
  });

  await browser.close();
  return jsonData;
}

async function getJsonData(page: Page): Promise<any> {
  try {
    await page.waitForSelector(".json-formatter-container");
  } catch (error) {
    await delay(5000);
    console.log(".json-formatter-container not found. Waiting 5s...");
    return getJsonData(page);
  }
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
}

// Test example
const url =
  "https://gmgn.ai/defi/quotation/v1/rank/sol/wallets/7d?tag=smart_degen&tag=pump_smart&orderby=pnl_7d&direction=desc&limit=1000";
scrapePage(url)
  .then((data) => console.log("Scraped data:", data))
  .catch(console.error);
