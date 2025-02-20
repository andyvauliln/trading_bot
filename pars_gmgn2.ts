import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

//https://gmgn.ai/defi/quotation/v1/rank/sol/wallets/7d?orderby=winrate_7d&direction=desc
//https://gmgn.ai/defi/quotation/v1/rank/sol/wallets/7d?tag=pump_smart&orderby=winrate_7d&direction=desc
//https://gmgn.ai/defi/quotation/v1/rank/sol/wallets/7d?tag=snipe_bot&orderby=winrate_7d&direction=desc
//https://gmgn.ai/defi/quotation/v1/rank/sol/wallets/7d?tag=smart_degen&tag=pump_smart&orderby=winrate_7d&direction=desc
//https://gmgn.ai/defi/quotation/v1/rank/sol/wallets/7d?tag=fresh_wallet&orderby=winrate_7d&direction=desc
//https://gmgn.ai/defi/quotation/v1/rank/sol/wallets/7d?tag=renowned&orderby=winrate_7d&direction=desc
//https://gmgn.ai/defi/quotation/v1/rank/eth/wallets/7d?orderby=winrate_7d&direction=desc
//https://gmgn.ai/defi/quotation/v1/rank/eth/wallets/7d?tag=pump_smart&orderby=winrate_7d&direction=desc
//https://gmgn.ai/defi/quotation/v1/rank/eth/wallets/7d?tag=snipe_bot&orderby=winrate_7d&direction=desc
//https://gmgn.ai/defi/quotation/v1/rank/eth/wallets/7d?tag=smart_degen&tag=pump_smart&orderby=winrate_7d&direction=desc
//https://gmgn.ai/defi/quotation/v1/rank/eth/wallets/7d?tag=fresh_wallet&orderby=winrate_7d&direction=desc
//https://gmgn.ai/defi/quotation/v1/rank/eth/wallets/7d?tag=renowned&orderby=winrate_7d&direction=desc
// Use stealth plugin
puppeteer.use(StealthPlugin());

async function scrapeGMGN() {
    try {
        // Launch the browser
        const browser = await puppeteer.launch({
            headless: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ],
        });

        // Create a new page
        const page = await browser.newPage();

        // Set viewport
        await page.setViewport({
            width: 1920,
            height: 1080
        });

        // Navigate to the URL
        await page.goto('https://gmgn.ai/defi/quotation/v1/rank/sol/wallets/7d?orderby=winrate_7d&direction=desc', {
            waitUntil: 'networkidle0',
            timeout: 60000
        });

        // Wait for the JSON formatter container to appear
        await page.waitForSelector('.json-formatter-container', { timeout: 100000 });
        console.log('JSON formatter container found');

        const data = await getJsonData(page);

        console.log('Captured data:', data);

        await browser.close();
        return data;
    } catch (error) {
        console.error('Error:', error);
        if (error instanceof Error) {
            console.error('Error message:', error.message);
        }
    }
}

async function getJsonData(page: any): Promise<any> {
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
  

// Run the scraper
scrapeGMGN();
