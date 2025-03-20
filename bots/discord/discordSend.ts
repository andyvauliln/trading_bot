import dotenv from "dotenv"; // zero-dependency module that loads environment variables from a .env
import { Client, Events, GatewayIntentBits, TextChannel, Channel } from "discord.js";

// Load environment variables from the .env file
dotenv.config();

// Singleton Discord client instance
let discordClient: Client | null = null;
let isInitializing: boolean = false;
let channelCache: Map<string, Channel> = new Map();

/**
 * Initialize the Discord client with the provided bot token
 * @param botToken Discord bot token
 * @returns Promise that resolves to the Discord client instance
 */
export async function initializeDiscordClient(botToken?: string): Promise<Client | null> {
  // If client already exists, return it
  if (discordClient?.isReady()) {
    return discordClient;
  }

  // If already initializing, wait until it's done
  if (isInitializing) {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (discordClient?.isReady()) {
          clearInterval(checkInterval);
          resolve(discordClient);
        }
      }, 100);
    });
  }

  isInitializing = true;
  
  try {
    // Use provided token or try to get from environment variables
    const discordBotToken = botToken || process.env.DISCORD_BOT_TOKEN || "";

    if (!discordBotToken) {
      console.log("🚫 Discord Bot not started. Missing Discord bot token.");
      isInitializing = false;
      return null;
    }

    // Initialize and log in the Discord client
    discordClient = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    });

    // Set up the ready event handler
    discordClient.once(Events.ClientReady, () => {
      console.log("✅ Discord client is ready and connected!");
    });

    // Login with the token
    await discordClient.login(discordBotToken);
    
    // Wait for the client to be ready
    if (!discordClient.isReady()) {
      await new Promise<void>((resolve) => {
        discordClient?.once(Events.ClientReady, () => resolve());
      });
    }

    isInitializing = false;
    return discordClient;
  } catch (error) {
    console.error("🚫 Error initializing Discord client:", error);
    discordClient = null;
    isInitializing = false;
    return null;
  }
}

/**
 * Get a Discord channel by its ID
 * @param channelId The Discord channel ID
 * @param client Optional client instance (will use singleton if not provided)
 * @returns The channel object or null if not found
 */
export async function getDiscordChannel(channelId: string, client?: Client): Promise<Channel | null> {
  // If channel is in cache, return it
  if (channelCache.has(channelId)) {
    return channelCache.get(channelId) || null;
  }

  // Use provided client or get singleton instance
  const discordClientInstance = client || await initializeDiscordClient();
  
  if (!discordClientInstance) {
    console.log("🚫 Cannot get channel. Discord client not initialized.");
    return null;
  }

  try {
    // Fetch the channel
    const channel = discordClientInstance.channels.cache.get(channelId);
    
    if (channel) {
      // Cache the channel for future use
      channelCache.set(channelId, channel);
      return channel;
    } else {
      console.log(`🚫 Channel with ID ${channelId} not found.`);
      return null;
    }
  } catch (error) {
    console.error(`🚫 Error fetching channel ${channelId}:`, error);
    return null;
  }
}

/**
 * Send messages to a Discord channel
 * @param channelOrId Channel object or channel ID
 * @param messages Array of messages to send
 * @returns Promise that resolves to true if all messages were sent successfully
 */
export async function sendMessageOnDiscord(
  channelOrId: Channel | string,
  messages: string[]
): Promise<boolean> {
  if (!messages.length) {
    return true;
  }

  let channel: Channel | null;
  
  // Determine if channelOrId is a string ID or a Channel object
  if (typeof channelOrId === 'string') {
    channel = await getDiscordChannel(channelOrId);
  } else {
    channel = channelOrId;
  }

  // Check if channel exists and is a text channel
  if (!channel || !(channel instanceof TextChannel)) {
    console.error("🚫 Invalid Discord channel or not a text channel");
    return false;
  }

  // Send each message to the channel
  const results = await Promise.all(
    messages.map((message) => 
      (channel as TextChannel)
        .send(message)
        .then(() => {
          return true;
        })
        .catch((error: Error) => {
          console.error(`🚫DISCORD| Failed to send: "${message}". Error:`, error);
          return false;
        })
    )
  );

  // Return true if all messages were sent successfully
  return results.every(result => result === true);
}

/**
 * Shutdown the Discord client
 */
export async function shutdownDiscordClient(): Promise<void> {
  if (discordClient) {
    console.log("Shutting down Discord client...");
    discordClient.destroy();
    discordClient = null;
    channelCache.clear();
  }
}
