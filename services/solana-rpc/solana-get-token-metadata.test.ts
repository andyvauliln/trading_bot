import { Connection } from "@solana/web3.js";
import { getTokenMetadata, getBasicTokenMetadata } from "./solana-get-token-metadata";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

/**
 * Test function to demonstrate token metadata retrieval
 */
async function testTokenMetadata() {
  const BOT_NAME = "MetadataTest";
  
  // Get RPC URL from environment or use a default
  const rpcUrl = process.env.HELIUS_HTTPS_URI || "https://api.mainnet-beta.solana.com";
  console.log(`[${BOT_NAME}]|[testTokenMetadata]|Using RPC URL: ${rpcUrl}`, 0);
  
  // Create Solana connection
  const connection = new Connection(rpcUrl);
  
  // Known token mints to test
  const tokens = {
    USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
    SOL: "So11111111111111111111111111111111111111112",   // Wrapped SOL
    BONK: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", // Bonk
    JUP: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"    // Jupiter
  };
  
  // Test full metadata retrieval for each token
  console.log(`[${BOT_NAME}]|[testTokenMetadata]|Testing full metadata retrieval`, 0);
  for (const [symbol, mint] of Object.entries(tokens)) {
    console.log(`\n[${BOT_NAME}]|[testTokenMetadata]|Getting metadata for ${symbol} (${mint})`, 0);
    const metadata = await getTokenMetadata(BOT_NAME, mint);
    console.log(`[${BOT_NAME}]|[testTokenMetadata]|Metadata result:`, 0, metadata);
  }
  
  // Test basic metadata retrieval for each token
  console.log(`\n[${BOT_NAME}]|[testTokenMetadata]|Testing basic metadata retrieval`, 0);
  for (const [symbol, mint] of Object.entries(tokens)) {
    console.log(`\n[${BOT_NAME}]|[testTokenMetadata]|Getting basic metadata for ${symbol} (${mint})`, 0);
    const metadata = await getBasicTokenMetadata(BOT_NAME, mint);
    console.log(`[${BOT_NAME}]|[testTokenMetadata]|Basic metadata result:`, 0, metadata);
  }
}

// Execute the test function
testTokenMetadata()
  .then(() => console.log("Test completed successfully"))
  .catch(error => console.error("Test failed:", error))
  .finally(() => process.exit()); 