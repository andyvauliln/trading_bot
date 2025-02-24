import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { Browser } from 'puppeteer';

puppeteer.use(StealthPlugin());

/**
 * Creates and configures a new Puppeteer browser instance
 * @returns Promise containing the configured browser instance
 */
export async function createBrowser(): Promise<Browser> {
    return await puppeteer.launch({
        headless: true,
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
    });
}

/**
 * Scrapes JSON data from a given URL using Puppeteer with GET method.
 * @param url - The URL to scrape data from.
 * @returns Promise containing the scraped JSON data.
 */
export async function scrapeJsonData(url: string, browser?: Browser): Promise<any> {
    const shouldCloseBrowser = !browser;
    const browserInstance = browser || await createBrowser();

    let page = await browserInstance.newPage();
    await page.setDefaultNavigationTimeout(60000);
    await page.setDefaultTimeout(60000);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 2000;

    while (retryCount <= maxRetries) {
        try {
            console.log("HANDLING URL:", url);
            await Promise.race([
                page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Navigation timeout')), 60000))
            ]);

            await page.waitForSelector(".json-formatter-container", { timeout: 90000 });
            console.log("WAITING FOR SELECTOR");
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
            console.log("JSON DATA:", jsonData);
            if (jsonData) {
                if (shouldCloseBrowser) {
                    await browserInstance.close();
                }
                return jsonData;
            }
            throw new Error('Failed to get JSON data');
        } catch (error: any) {
            const errorMessage = error?.message || 'Unknown error occurred';
            console.log(`Retry ${retryCount + 1}/${maxRetries}: Error - ${errorMessage}`);
            retryCount++;
            if (retryCount > maxRetries) {
                console.error("Max retries reached. Aborting...");
                if (shouldCloseBrowser) {
                    await browserInstance.close();
                }
                return null;
            }
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
    }

    if (shouldCloseBrowser) {
        await browserInstance.close();
    }
    return null;
}

/**
 * Scrapes JSON data using POST method after bypassing Cloudflare protection.
 * First navigates to the main site to handle Cloudflare, then executes the POST request.
 * @param url - The URL to send POST request to.
 * @param payload - The data to send in the POST request body.
 * @param browser - Optional browser instance to reuse.
 * @returns Promise containing the scraped JSON data.
 */
export async function scrapeJsonDataWithPost(url: string, payload: any, browser?: Browser): Promise<any> {
    const shouldCloseBrowser = !browser;
    const browserInstance = browser || await createBrowser();

    let page = await browserInstance.newPage();
    await page.setDefaultNavigationTimeout(60000);
    await page.setDefaultTimeout(60000);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    let retryCount = 0;
    const maxRetries = 3;
    const retryDelay = 2000;

    while (retryCount <= maxRetries) {
        try {
            // First navigate to main site to handle Cloudflare protection
            console.log("Navigating to main site to handle Cloudflare...");
            await page.goto('https://gmgn.ai/', { 
                waitUntil: 'networkidle0',
                timeout: 60000 
            });

            // Wait for the page to be fully loaded and Cloudflare protection to clear
            await page.waitForSelector('body', { timeout: 90000 });
            
            console.log("Main site loaded, executing POST request...");
            console.log("POST URL:", url);
            console.log("Payload:", payload);

            // Execute the POST request in the context of the page
            const response = await page.evaluate(async (url, payload) => {
                try {
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            // Include any cookies that were set by Cloudflare
                            'Cookie': document.cookie
                        },
                        body: JSON.stringify(payload),
                        credentials: 'include' // Include cookies in the request
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const jsonData = await response.json();
                    return jsonData;
                } catch (error) {
                    console.error('Error in POST request:', error);
                    return null;
                }
            }, url, payload);

            console.log("POST Response:", response);

            if (response) {
                if (shouldCloseBrowser) {
                    await browserInstance.close();
                }
                return response;
            }
            throw new Error('Failed to get JSON data from POST request');
        } catch (error: any) {
            const errorMessage = error?.message || 'Unknown error occurred';
            console.log(`Retry ${retryCount + 1}/${maxRetries}: Error - ${errorMessage}`);
            retryCount++;
            if (retryCount > maxRetries) {
                console.error("Max retries reached. Aborting...");
                if (shouldCloseBrowser) {
                    await browserInstance.close();
                }
                return null;
            }
            await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
    }

    if (shouldCloseBrowser) {
        await browserInstance.close();
    }
    return null;
}