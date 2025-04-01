import * as dotenv from "dotenv";
import puppeteer, { ConsoleMessage } from "puppeteer"; // Puppeteer is a JavaScript library which provides a high-level API to control Chrome or Firefox
import { config } from "./config"; // Configuration parameters for our bot
import { insertNewPost, selectPostExistsByPostId } from "./db";
import { initializeDiscordClient, getDiscordChannel, sendMessageOnDiscord, shutdownDiscordClient } from "../../services/discord/discordSend";
import { InsertNewPostDetails } from "./types";

// Load environment variables from the .env file
dotenv.config();

// Create a new browser
let browser: any;
async function initBrowser() {
  try {
    if (browser) {
      try {
        await browser.disconnect();
      } catch (e) {
        console.log('Browser was already disconnected');
      }
      browser = null;
    }
    
    console.log('Attempting to connect to Chrome debugging port...');
    
    // Try multiple endpoints to verify connection
    const endpoints = ['http://127.0.0.1:9223', 'http://localhost:9223'];
    let connected = false;
    let debugData;
    
    for (const endpoint of endpoints) {
      try {
        console.log(`Trying to connect to ${endpoint}/json/version...`);
        const response = await fetch(`${endpoint}/json/version`);
        debugData = await response.json();
        console.log('Debug connection available at', endpoint, debugData);
        connected = true;
        
        // Connect to the existing Chrome instance
        browser = await puppeteer.connect({
          browserURL: endpoint,
          defaultViewport: {
            width: 1920,
            height: 1080
          }
        });
        
        console.log('Successfully connected to Chrome!');
        break;
      } catch (e: any) {
        console.log(`Failed to connect to ${endpoint}:`, e?.message || 'Unknown error');
      }
    }
    
    if (!connected) {
      console.error('Could not connect to Chrome on any endpoint');
      console.log('Please make sure Chrome is running with --remote-debugging-port=9223');
      console.log('And try accessing http://127.0.0.1:9223/json/version in your browser');
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Failed to connect to browser:', error);
    browser = null;
    return false;
  }
}

// Function to get the posts
async function getXAccountLatestPosts(name: string, handle: string): Promise<string[]> {
  if (!name || !handle) return [];

  try {
    // Create new browser if not available
    const initialized = await initBrowser();
    if (!initialized || !browser) {
      console.error('Failed to initialize browser');
      return [];
    }

    // Open a new page in the browser
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Set viewport
    await page.setViewport({
      width: 1920,
      height: 1080
    });
    
    console.log(`Navigating to https://x.com/${handle}`);
    
    // Navigate to the Twitter profile
    await page.goto(`https://x.com/${handle}`, { 
      waitUntil: "networkidle0",
      timeout: 60000 
    });

    // Check for sensitive content warning and handle it
    try {
      // Look for the button using data-testid
      const buttonSelector = await page.waitForSelector('button[data-testid="empty_state_button_text"]', { timeout: 5000 });
      if (buttonSelector) {
        console.log("Found sensitive content warning button, clicking to view profile...");
        await buttonSelector.evaluate((button: HTMLButtonElement) => button.click());
        // Wait for the page to load after clicking
        await page.waitForTimeout(5000);
      }
    } catch (e) {
      // No sensitive content warning found, continue normally
      console.log("No sensitive content warning detected");
    }

    // Wait for the timeline to load
    await page.waitForSelector('div[data-testid="cellInnerDiv"]', { timeout: 10000 });
    console.log("Found timeline posts");

    // Wait a bit more for dynamic content
    await new Promise((resolve) => setTimeout(resolve, 5000));
    console.log("Waiting for content to load...");

    // Extract links with "/handle/status/{id}"
    // Enable console log from browser to node
    page.on('console', (msg: ConsoleMessage) => console.log('Browser Console:', msg.text()));
    
    const filteredLinks = await page.evaluate(
      (name: string, handle: string) => {
        console.log('Looking for posts...');
        
        // Find all post containers
        const postContainers = Array.from(document.querySelectorAll('div[data-testid="cellInnerDiv"]'));
        console.log('Number of post containers found:', postContainers.length);
        
        if (postContainers.length === 0) {
          // Try to find the timeline container
          const timeline = document.querySelector('div[data-testid="primaryColumn"]');
          console.log('Timeline container found:', timeline ? 'yes' : 'no');
          return [];
        }

        // Get all article elements within the containers (these are the actual posts)
        const articles = postContainers.map(container => 
          container.querySelector('article[data-testid="tweet"]')
        ).filter(article => article !== null);
        
        console.log('Number of articles found:', articles.length);

        // Find all <a> tags within the articles
        const anchorTags = articles.flatMap(article => 
          Array.from(article?.querySelectorAll('a') || [])
        );
        console.log("Number of anchor tags found:", anchorTags.length);
        
        // Log the first few anchors for debugging
        const firstThreeUrls = anchorTags.slice(0, 3).map(anchor => anchor.href);
        console.log('First three URLs:', JSON.stringify(firstThreeUrls));
        
        // Filter links containing "/handle/status/" but not "/analytics"
        const links = anchorTags
          .map((anchor) => anchor.href)
          .filter((href) => href.includes(`/status/`) && !href.includes("/analytics") && !href.includes("/photo"));

        console.log("Filtered links count:", links.length);
        return links;
      },
      name,
      handle
    );

    console.log(`Found ${filteredLinks.length} posts for ${name}`);
    
    // // Take a screenshot for debugging
    // await page.screenshot({ path: 'debug-screenshot.png' });
    // console.log("Saved debug screenshot to debug-screenshot.png");
    
    await page.close();
    
    return filteredLinks;
  } catch (error) {
    console.error('Error in getXAccountLatestPosts:', error);
    return [];
  } finally {
  }
}

// Main to fetch tweets
async function main(): Promise<void> {
  try {
    // Initialize Discord client
    const discordChannel = process.env.DISCORD_CT_TRACKER_CHANNEL || "";
    const discordClient = await initializeDiscordClient();
    
    // Get the Discord channel if client was initialized
    const botChannel = discordClient ? await getDiscordChannel(discordChannel) : null;
    if (botChannel) {
      console.log("✅ Discord bot ready for use.");
    } else {
      console.warn("🚫 Discord bot not ready for use.");
    }

    // Accounts
    const xAccounts = config.bot_twitter.accounts;
    const discordMessages: string[] = [];

    // Get all the accounts
    for (const xAccount of xAccounts) {
      // Get account details
      const xName = xAccount.name;
      const xhandle = xAccount.handle;
      if (!xName || !xhandle) continue;

      //Output Logs
      console.log("🔍 Checking posts for " + xName);

      const latestPosts = await getXAccountLatestPosts(xName, xhandle);
      console.log(latestPosts);
      if (!latestPosts) continue;

      for (const post of latestPosts) {
        const match = post.match(/^https:\/\/x\.com\/([\w_]+)\/status\/(\d+)$/);
        if (match) {
          const urlHandle = match[1];
          const id = match[2];
          const retweet = urlHandle !== xhandle ? 1 : 0;
          let newPost: InsertNewPostDetails;

          // Check if proper formats
          if (typeof urlHandle === "string" && !isNaN(Number(id))) {
            // Check if exists in db already
            const exists = await selectPostExistsByPostId(Number(id));
            if (exists.length !== 0) continue;

            if (retweet === 1) {
              discordMessages.push(`📢 ${xName} retweeted ${urlHandle}: https://x.com/${urlHandle}/status/${id}`);
            } else {
              discordMessages.push(`📢 ${xName} tweeted: https://x.com/${xhandle}/status/${id}`);
            }

            // Add to db
            const unixTimestampMs = Date.now();
            newPost = {
              post_id: Number(id),
              post_content: "",
              post_pinned: 0,
              handle: xhandle,
              retweet: retweet,
              retweet_handle: urlHandle,
              crypto_related: 1,
              created: unixTimestampMs,
              posted_in_discord: 1,
            };
            const added = await insertNewPost(newPost);
            if (added) console.log("✅ Twitter post stored in database");
          }
        }
      }

      // Wait for 3 more second before moving to the other account
      const randomWaitTime = Math.floor(Math.random() * (10000 - 3000 + 1)) + 3000;
      await new Promise((resolve) => setTimeout(resolve, randomWaitTime));
    }

    // Send to Discord
    if (botChannel && discordMessages.length !== 0) {
      // Output amount of posts
      console.log("✅ Collected " + discordMessages.length + " tweets.");

      const sentConfirmation = await sendMessageOnDiscord(botChannel, discordMessages);
      if (sentConfirmation) console.log("✅ Discord Messages Sent!");
    }

    setTimeout(main, config.bot_twitter.tracker_timeout);
  } catch (error) {
    console.error("Error:", error);
  }
}

// Handle cleanup on process exit
process.on('SIGINT', async () => {
  console.log('Gracefully shutting down...');
  await shutdownDiscordClient();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Gracefully shutting down...');
  await shutdownDiscordClient();
  process.exit(0);
});

main().catch((err) => {
  console.error("Initialization error:", err.message);
  process.exit(1); // Exit if initialization fails
});
