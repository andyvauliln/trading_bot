import { createBrowser } from './scraperClient';
import { initializeDiscordClient, sendMessageOnDiscord } from '../bots/discord/discordSend';
import fs from 'fs';
import path from 'path';
import { Browser } from 'puppeteer';
import { TextChannel, DMChannel, NewsChannel } from 'discord.js';

/**
 * Takes a screenshot of a token page and sends it to Discord
 * @param tokenAddress The token symbol to screenshot (e.g., "ETH")
 * @param discordChannelId The Discord channel ID to send the screenshot to
 * @returns Promise that resolves to true if the screenshot was successfully sent
 */
export async function makeTokenScreenshotAndSendToDiscord(
  tokenAddress: string, 
  discordChannelId: string = ''
): Promise<boolean> {
  let browser: Browser | null = null;
  
  try {
    console.log(`📸 Taking screenshot of token: ${tokenAddress}`);
    if(!discordChannelId) {
     discordChannelId = process.env.DISCORD_CT_TRACKER_CHANNEL || '';
    }
    
    // Add browser environment checks
    const debugMode = process.env.PUPPETEER_DEBUG === 'true';
    const execPath = process.env.CHROME_EXECUTABLE_PATH;

    if (debugMode) {
      console.log(`Browser config - Chrome path: ${execPath || 'default'}`);
    }
    
    // Create browser instance with more detailed logging and retry logic
    try {
      console.log('Initializing browser...');
      
      // Try up to 3 times to initialize the browser
      let maxRetries = 3;
      let retryCount = 0;
      let lastError: any = null;
      
      while (retryCount < maxRetries) {
        try {
          browser = await createBrowser();
          console.log('Browser initialized successfully on attempt', retryCount + 1);
          break; // Success, exit the retry loop
        } catch (err) {
          lastError = err;
          retryCount++;
          console.error(`Browser initialization attempt ${retryCount} failed:`, err);
          
          if (retryCount < maxRetries) {
            console.log(`Waiting before retry ${retryCount + 1}...`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retrying
          }
        }
      }
      
      // If we've exhausted all retries and still don't have a browser
      if (!browser) {
        throw lastError || new Error('Failed to initialize browser after multiple attempts');
      }
    } catch (browserError) {
      console.error('All browser initialization attempts failed:', browserError);
      
      // Still send a message to Discord about the failure
      const errorMessage = `⚠️ Failed to take screenshot of token ${tokenAddress} due to browser initialization error. Please check server logs.`;
      await initializeDiscordClient().then(client => {
        if (client) {
          return sendMessageOnDiscord(discordChannelId, [errorMessage]);
        }
        return false;
      });
      
      throw new Error(`Browser initialization failed: ${browserError instanceof Error ? browserError.message : String(browserError)}`);
    }
    
    // Create a new page with timeout protection
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(60000);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Set better error handling for page load errors
    page.on('error', err => {
      console.error('Page error:', err);
    });

    // Navigate to the token page (modify the URL according to your needs)
    const tokenUrl = `https://gmgn.ai/sol/token/${tokenAddress}`;
    console.log(`Navigating to: ${tokenUrl}`);
    
    try {
      await page.goto(tokenUrl, { 
        waitUntil: 'networkidle0',
        timeout: 60000 
      });
    } catch (navigationError) {
      console.error(`Navigation error for ${tokenUrl}:`, navigationError);
      throw new Error(`Failed to navigate to token page: ${navigationError instanceof Error ? navigationError.message : String(navigationError)}`);
    }

    // Wait for the page to fully load
    try {
      await page.waitForSelector('body', { timeout: 90000 });
      console.log('Page loaded successfully');
    } catch (waitError) {
      console.error('Error waiting for page content:', waitError);
      throw new Error(`Timeout waiting for page content: ${waitError instanceof Error ? waitError.message : String(waitError)}`);
    }
    
    // Remove all elements with the class "chakra-portal" before taking the screenshot
    try {
      await page.evaluate(() => {
        const portalElements = document.querySelectorAll('.chakra-portal');
        portalElements.forEach(element => {
          if (element.parentNode) {
            element.parentNode.removeChild(element);
          }
        });
        console.log(`Removed ${portalElements.length} chakra-portal elements from the DOM`);
      });
      console.log('Removed chakra-portal elements before taking screenshot');
    } catch (removeError) {
      console.error('Error removing chakra-portal elements:', removeError);
      // Continue with the screenshot even if removal fails
    }
    
    // Create screenshots directory if it doesn't exist
    const screenshotsDir = path.join(process.cwd(), 'data/screenshots');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
    
    // Take a screenshot
    const screenshotPath = path.join(screenshotsDir, `${tokenAddress}_${Date.now()}.png`);
    try {
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`Screenshot saved to: ${screenshotPath}`);
    } catch (screenshotError) {
      console.error('Error taking screenshot:', screenshotError);
      throw new Error(`Failed to take screenshot: ${screenshotError instanceof Error ? screenshotError.message : String(screenshotError)}`);
    }
    
    // Initialize Discord client
    const discordClient = await initializeDiscordClient();
    if (!discordClient) {
      console.error('Failed to initialize Discord client');
      return false;
    }
    
    // Prepare message with the screenshot
    const message = `📊 Token Analysis: ${tokenAddress} - ${new Date().toLocaleString()}`;
    
    // Send text message first
    const textSent = await sendMessageOnDiscord(discordChannelId, [message]);
    if (!textSent) {
      console.error('Failed to send text message to Discord');
      return false;
    }
    
    // Get the channel and send the file
    const channel = await discordClient.channels.fetch(discordChannelId);
    if (!channel || !channel.isTextBased()) {
      console.error(`Channel with ID ${discordChannelId} not found or is not a text channel`);
      return false;
    }
    
    // Send the screenshot file
    if (channel instanceof TextChannel || channel instanceof DMChannel || channel instanceof NewsChannel) {
      await channel.send({ 
        files: [{
          attachment: screenshotPath,
          name: `${tokenAddress}_analysis.png`
        }]
      });
    } else {
      console.error(`Channel with ID ${discordChannelId} is not a supported channel type for sending files`);
      return false;
    }
    
    console.log(`✅ Screenshot of ${tokenAddress} sent to Discord channel ${discordChannelId}`);
    return true;
    
  } catch (error) {
    console.error(`🚫 Error taking screenshot of token ${tokenAddress}:`, error);
    
    // Try to send error notification to Discord
    try {
      const errorMessage = `❌ Failed to process token ${tokenAddress}: ${error instanceof Error ? error.message : String(error)}`;
      const discordClient = await initializeDiscordClient();
      if (discordClient) {
        await sendMessageOnDiscord(discordChannelId, [errorMessage]);
      }
    } catch (discordError) {
      console.error('Failed to send error notification to Discord:', discordError);
    }
    
    return false;
  } finally {
    // Close the browser
    if (browser) {
      try {
        await browser.close();
        console.log('Browser closed successfully');
      } catch (closeError) {
        console.error('Error closing browser:', closeError);
      }
    }
  }
}

/**
 * Takes screenshots of multiple tokens and sends them to Discord
 * @param tokens Array of token symbols to screenshot
 * @param discordChannelId The Discord channel ID to send the screenshots to
 * @returns Promise that resolves when all screenshots have been processed
 */
export async function batchTokenScreenshots(
  tokens: string[],
  discordChannelId: string
): Promise<void> {
  console.log(`Starting batch screenshot process for ${tokens.length} tokens`);
  
  for (const token of tokens) {
    await makeTokenScreenshotAndSendToDiscord(token, discordChannelId);
    
    // Add a delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log('Batch screenshot process completed');
}
