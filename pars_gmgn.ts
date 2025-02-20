import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Use stealth plugin
puppeteer.use(StealthPlugin());

async function scrapeGMGN() {
    try {
        // Launch the browser
        const browser = await puppeteer.launch({
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--single-process',
                '--no-zygote',
            ],
            timeout: 60000,
        });

        // Create a new page
        const page = await browser.newPage();

        // Set viewport
        await page.setViewport({
            width: 1920,
            height: 1080
        });

        // Navigate to the URL
        await page.goto('https://gmgn.ai/sol/token/CUS7ptHdMkbF3hRdv7UUW2AjYuQKVSuSyerZeycESaTN', {
            waitUntil: 'networkidle0',
            timeout: 60000
        });

        // Add a small delay
        await delay(5000);

        // Wait for the specific div to be loaded
        await page.waitForSelector('.css-12xlemk', { timeout: 60000 });

        // Extract the rug probability data
        const rugProbabilityData = await page.evaluate(() => {
            const container = document.querySelector('.css-12xlemk');
            if (!container) return null;

            const probabilityText = container.querySelector('.css-1wfvh31')?.textContent;
            if (!probabilityText) return null;

            // Format the output
            return `Rug probability : ${probabilityText.trim()}`;
        });

        console.log(rugProbabilityData);

        // Close the browser
        await browser.close();
    } catch (error) {
        console.error('Error:', error);
        if (error instanceof Error) {
            console.error('Error message:', error.message);
        }
    }
}

// Run the scraper
scrapeGMGN();
