import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { Browser } from 'puppeteer';
import axios from 'axios';
import * as https from 'https';

puppeteer.use(StealthPlugin());

// Flag to track if browser initialization failed
let browserInitFailed = false;

/**
 * Creates and configures a new Puppeteer browser instance
 * @returns Promise containing the configured browser instance
 */
export async function createBrowser(): Promise<Browser> {
    // If we've already determined that browser initialization fails, fail fast
    if (browserInitFailed) {
        throw new Error('Browser initialization previously failed. Skipping browser creation.');
    }
    
    try {
        // Check if we're in a limited environment
        const envType = process.env.NODE_ENV || 'development';
        const debugMode = process.env.PUPPETEER_DEBUG === 'true';
        
        if (debugMode) {
            console.log(`[Puppeteer] Creating browser in ${envType} environment`);
        }
        
        const launchOptions: any = {
            headless: 'new', // Use the new headless mode for better compatibility
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--window-size=1920,1080",
                "--disable-features=site-per-process", // Helps with stability
                "--disable-web-security", // For accessing cross-origin content
            ],
            timeout: 120000,
            protocolTimeout: 120000,
            defaultViewport: {
                width: 1920,
                height: 1080
            },
            ignoreHTTPSErrors: true,
        };
        
        // Track if we should use bundled Chromium
        let useBundled = false;
        
        // Check if Chrome executable path is provided
        const executablePath = process.env.CHROME_EXECUTABLE_PATH;
        if (executablePath) {
            console.log(`[Puppeteer] Using custom Chrome path: ${executablePath}`);
            // Check if the provided path actually exists
            const fs = require('fs');
            if (fs.existsSync(executablePath)) {
                Object.assign(launchOptions, { executablePath });
            } else {
                console.warn(`[Puppeteer] Warning: Provided Chrome path doesn't exist: ${executablePath}`);
                console.warn('[Puppeteer] Falling back to bundled Chromium');
                useBundled = true;
            }
        } else {
            // If no explicit path is provided, check if Chrome is available on system
            const isLinux = process.platform === 'linux';
            if (isLinux) {
                console.log('[Puppeteer] Linux environment detected, checking for Chrome');
                
                // Try common Chrome binary locations on Linux
                const possiblePaths = [
                    '/usr/bin/google-chrome',
                    '/usr/bin/google-chrome-stable',
                    '/usr/bin/chromium',
                    '/usr/bin/chromium-browser'
                ];
                
                // Use fs to check file existence
                const fs = require('fs');
                let found = false;
                for (const path of possiblePaths) {
                    if (fs.existsSync(path)) {
                        console.log(`[Puppeteer] Found Chrome at: ${path}`);
                        Object.assign(launchOptions, { executablePath: path });
                        found = true;
                        break;
                    }
                }
                
                if (!found) {
                    console.log('[Puppeteer] No Chrome installation found, using bundled Chromium');
                    useBundled = true;
                }
            } else {
                // On non-Linux systems, we'll also check the default paths or use bundled
                const { execSync } = require('child_process');
                try {
                    // Try to find Chrome on the system
                    let chromePath;
                    if (process.platform === 'darwin') {
                        // macOS
                        try {
                            chromePath = execSync('which google-chrome').toString().trim();
                        } catch (e) {
                            try {
                                chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
                                const fs = require('fs');
                                if (!fs.existsSync(chromePath)) {
                                    chromePath = null;
                                }
                            } catch (e2) {
                                chromePath = null;
                            }
                        }
                    } else if (process.platform === 'win32') {
                        // Windows
                        try {
                            const programFiles = process.env['PROGRAMFILES'] || 'C:\\Program Files';
                            const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
                            
                            const possibleWindowsPaths = [
                                `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
                                `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
                            ];
                            
                            const fs = require('fs');
                            for (const path of possibleWindowsPaths) {
                                if (fs.existsSync(path)) {
                                    chromePath = path;
                                    break;
                                }
                            }
                        } catch (e) {
                            chromePath = null;
                        }
                    }
                    
                    if (chromePath) {
                        console.log(`[Puppeteer] Found Chrome at: ${chromePath}`);
                        Object.assign(launchOptions, { executablePath: chromePath });
                    } else {
                        console.log('[Puppeteer] No Chrome installation found, using bundled Chromium');
                        useBundled = true;
                    }
                } catch (e) {
                    console.log('[Puppeteer] Error finding Chrome, using bundled Chromium');
                    useBundled = true;
                }
            }
        }
        
        if (useBundled) {
            console.log('[Puppeteer] Using bundled Chromium');
            // Remove the executablePath if it was previously set
            if (launchOptions.executablePath) {
                delete launchOptions.executablePath;
            }
        }
        
        if (debugMode) {
            console.log('[Puppeteer] Launch options:', JSON.stringify(launchOptions, null, 2));
        }
        
        // Attempt to launch the browser
        try {
            return await puppeteer.launch(launchOptions);
        } catch (launchError) {
            console.error('[Puppeteer] Initial launch failed, trying fallback options...', launchError);
            
            // Try with different configurations if the initial launch fails
            // This can help in restricted environments
            launchOptions.args.push('--no-zygote', '--single-process');
            
            // If we're still trying to use a custom Chrome and it failed, fall back to bundled
            if (!useBundled && launchOptions.executablePath) {
                console.log('[Puppeteer] Fallback: Using bundled Chromium instead of custom path');
                delete launchOptions.executablePath;
            }
            
            return await puppeteer.launch(launchOptions);
        }
    } catch (error) {
        console.error('[Puppeteer] Error launching browser:', error);
        
        // Mark that browser initialization has failed for future attempts
        browserInitFailed = true;
        
        // Provide detailed error information for debugging
        console.error('[Puppeteer] This error typically occurs when the system cannot start Chrome.');
        console.error('[Puppeteer] Please check if Chrome is installed and dependencies are available.');
        console.error('[Puppeteer] Try installing Chrome dependencies or setting CHROME_EXECUTABLE_PATH.');
        
        // For Linux systems, suggest required dependencies
        if (process.platform === 'linux') {
            console.error('[Puppeteer] On Linux, you may need to install these dependencies:');
            console.error('apt-get install -y gconf-service libasound2 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 ca-certificates fonts-liberation libappindicator1 libnss3 lsb-release xdg-utils wget libgbm-dev');
        }
        
        throw new Error(`Failed to launch browser: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * Scrapes JSON data from a given URL using Puppeteer with GET method.
 * Falls back to axios if Puppeteer fails.
 * @param url - The URL to scrape data from.
 * @returns Promise containing the scraped JSON data.
 */
export async function scrapeJsonData(url: string, browser?: Browser): Promise<any> {
    try {
        // First attempt with Puppeteer if browser initialization hasn't failed before
        if (!browserInitFailed) {
            const shouldCloseBrowser = !browser;
            let browserInstance: Browser | null = null;
            
            try {
                browserInstance = browser || await createBrowser();
                
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
                            console.error("Max retries reached. Aborting Puppeteer method...");
                            break;
                        }
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                    }
                }
                
                // If we get here, all puppeteer attempts failed
                throw new Error('All Puppeteer attempts failed');
            } catch (puppeteerError) {
                // Close browser if we created it
                if (shouldCloseBrowser && browserInstance) {
                    try {
                        await browserInstance.close();
                    } catch (closeError) {
                        console.error("Error closing browser:", closeError);
                    }
                }
                
                // Re-throw to fallback method
                throw puppeteerError;
            }
        } else {
            throw new Error('Skipping Puppeteer method due to previous browser initialization failures');
        }
    } catch (error) {
        // Fallback to Axios if Puppeteer fails
        console.log("Puppeteer method failed, falling back to Axios:", error instanceof Error ? error.message : String(error));
        return await fetchWithAxios(url);
    }
}

/**
 * Scrapes JSON data using POST method. Tries Puppeteer first, then falls back to axios.
 * @param url - The URL to send POST request to.
 * @param payload - The data to send in the POST request body.
 * @param browser - Optional browser instance to reuse.
 * @returns Promise containing the scraped JSON data.
 */
export async function scrapeJsonDataWithPost(url: string, payload: any, browser?: Browser): Promise<any> {
    try {
        // First attempt with Puppeteer if browser initialization hasn't failed before
        if (!browserInitFailed) {
            const shouldCloseBrowser = !browser;
            let browserInstance: Browser | null = null;
            
            try {
                browserInstance = browser || await createBrowser();
                
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
                            console.error("Max retries reached. Aborting Puppeteer method...");
                            break;
                        }
                        await new Promise(resolve => setTimeout(resolve, retryDelay));
                    }
                }
                
                // If we get here, all puppeteer attempts failed
                throw new Error('All Puppeteer attempts failed');
            } catch (puppeteerError) {
                // Close browser if we created it
                if (shouldCloseBrowser && browserInstance) {
                    try {
                        await browserInstance.close();
                    } catch (closeError) {
                        console.error("Error closing browser:", closeError);
                    }
                }
                
                // Re-throw to fallback method
                throw puppeteerError;
            }
        } else {
            throw new Error('Skipping Puppeteer method due to previous browser initialization failures');
        }
    } catch (error) {
        // Fallback to Axios if Puppeteer fails
        console.log("Puppeteer POST method failed, falling back to Axios:", error instanceof Error ? error.message : String(error));
        return await postWithAxios(url, payload);
    }
}

/**
 * Fetch JSON data using Axios as a fallback method
 * @param url - URL to fetch
 * @returns Promise with JSON data
 */
async function fetchWithAxios(url: string): Promise<any> {
    try {
        console.log("[Axios] Fetching URL:", url);
        
        // Create axios instance with appropriate headers and longer timeout
        const instance = axios.create({
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            },
            httpsAgent: new https.Agent({
                rejectUnauthorized: false // Allow self-signed certificates
            })
        });
        
        // Perform the request
        const response = await instance.get(url);
        
        if (response.status === 200 && response.data) {
            console.log("[Axios] Successfully fetched data");
            return response.data;
        } else {
            throw new Error(`Invalid response: ${response.status}`);
        }
    } catch (error: any) {
        console.error("[Axios] Error fetching data:", error.message);
        throw error;
    }
}

/**
 * POST JSON data using Axios as a fallback method
 * @param url - URL to send POST request to
 * @param payload - Data to send in request body
 * @returns Promise with JSON data
 */
async function postWithAxios(url: string, payload: any): Promise<any> {
    try {
        console.log("[Axios] Posting to URL:", url);
        console.log("[Axios] Payload:", payload);
        
        // Create axios instance with appropriate headers and longer timeout
        const instance = axios.create({
            timeout: 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            },
            httpsAgent: new https.Agent({
                rejectUnauthorized: false // Allow self-signed certificates
            })
        });
        
        // Perform the request
        const response = await instance.post(url, payload);
        
        if (response.status === 200 && response.data) {
            console.log("[Axios] Successfully posted data");
            return response.data;
        } else {
            throw new Error(`Invalid response: ${response.status}`);
        }
    } catch (error: any) {
        console.error("[Axios] Error posting data:", error.message);
        throw error;
    }
}