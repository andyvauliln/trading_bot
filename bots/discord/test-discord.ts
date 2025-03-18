import dotenv from "dotenv";
import { initializeDiscordClient, getDiscordChannel, sendMessageOnDiscord, shutdownDiscordClient } from "./discordSend";

// Load environment variables
dotenv.config();

// Discord Parameters
const discordChannel = process.env.DISCORD_CT_TRACKER_CHANNEL || "";
const discordBotToken = process.env.DISCORD_BOT_TOKEN || "";

if (!discordBotToken || !discordChannel) {
  console.log("🚫 Missing Discord bot token or channel ID");
  process.exit(1);
}

// Run a test to send a message via Discord
async function runDiscordTest() {
  try {
    // Initialize the client
    console.log("Initializing Discord client...");
    const client = await initializeDiscordClient(discordBotToken);
    
    if (!client) {
      console.log("🚫 Failed to initialize Discord client");
      process.exit(1);
    }
    
    console.log("✅ Discord client initialized");
    
    // Get the channel
    console.log(`Getting channel ${discordChannel}...`);
    const channel = await getDiscordChannel(discordChannel, client);
    
    if (!channel) {
      console.log(`🚫 Channel with ID ${discordChannel} not found`);
      await shutdownDiscordClient();
      process.exit(1);
    }
    
    console.log(`✅ Found channel ${channel.id}`);
    
    // Send a test message
    console.log("Sending test message...");
    const success = await sendMessageOnDiscord(channel, ["🤖 Test message from Discord bot!"]);
    
    if (success) {
      console.log("✅ Test message sent successfully!");
    } else {
      console.log("🚫 Failed to send test message");
      await shutdownDiscordClient();
      process.exit(1);
    }
    
    // Optional: Close the Discord client
    // await shutdownDiscordClient();
    // process.exit(0);
  } catch (error) {
    console.error("🚫 Error during Discord test:", error);
    await shutdownDiscordClient();
    process.exit(1);
  }
}

// Start the test
runDiscordTest().catch(async (error) => {
  console.error("🚫 Unhandled error:", error);
  await shutdownDiscordClient();
  process.exit(1);
});
