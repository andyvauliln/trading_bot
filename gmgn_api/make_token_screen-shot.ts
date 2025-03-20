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
    // Create browser instance
    browser = await createBrowser();
    
    // Create a new page
    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(60000);
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // Navigate to the token page (modify the URL according to your needs)
    const tokenUrl = `https://gmgn.ai/sol/token/${tokenAddress}`;
    console.log(`Navigating to: ${tokenUrl}`);
    
    await page.goto(tokenUrl, { 
      waitUntil: 'networkidle0',
      timeout: 60000 
    });

    // Wait for the page to fully load
    await page.waitForSelector('body', { timeout: 90000 });
    
    // Create screenshots directory if it doesn't exist
    const screenshotsDir = path.join(process.cwd(), 'data/screenshots');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
    
    // Take a screenshot
    const screenshotPath = path.join(screenshotsDir, `${tokenAddress}_${Date.now()}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Screenshot saved to: ${screenshotPath}`);
    
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
    return false;
  } finally {
    // Close the browser
    if (browser) {
      await browser.close();
      console.log('Browser closed');
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
