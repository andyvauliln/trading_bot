import * as dotenv from "dotenv";
import { Client, Events, GatewayIntentBits } from "discord.js";

// Load environment variables
dotenv.config();

// Discord client setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Discord Parameters
const discordChannel = process.env.DISCORD_CT_TRACKER_CHANNEL || "";
const discordBotToken = "qY7vJYFszxyz6zkrCjLRvl17Si3Td5lT4-NN7Dy8akYHy90FEqlWddxTHJajBFlxsN6x";

if (!discordBotToken || !discordChannel) {
  console.log("🚫 Missing Discord bot token or channel ID");
  process.exit(1);
}

// When bot is ready
client.on(Events.ClientReady, async () => {
  console.log("✅ Discord bot connected");
  
  // Get the channel
  const channel = client.channels.cache.get(discordChannel);
  
  if (!channel) {
    console.log("🚫 Channel not found");
    process.exit(1);
  }

  try {
    // Send a test message
    if ('send' in channel) {
      await channel.send("🤖 Test message from Discord bot!");
      console.log("✅ Test message sent successfully!");
    }
  } catch (error) {
    console.error("🚫 Error sending message:", error);
  }

  // Optional: Close the bot after sending the message
  // client.destroy();
  // process.exit(0);
});

// Handle errors
client.on('error', (error) => {
  console.error('Discord client error:', error);
});

// Login
client.login(discordBotToken).catch((error) => {
  console.error("🚫 Failed to login:", error);
  process.exit(1);
});
