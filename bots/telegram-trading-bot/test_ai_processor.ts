import { AIMessageProcessor } from './ai_message_processing';
import * as dotenv from 'dotenv';
import { AIConfig } from './types';
import { config as configData } from './config';

// Load environment variables
dotenv.config();

async function testAIProcessor() {
    console.log("Loading AI configuration from config file...");
    
    try {
        if (!configData.ai_config) {
            throw new Error("AI configuration section is missing from config file");
        }

        // Get AI config
        const aiConfig: AIConfig = {
            openrouter_api_key: process.env.OPEN_ROUTER_API_KEY || configData.ai_config.openrouter_api_key,
            initial_model: configData.ai_config.initial_model,
            base_url: configData.ai_config.base_url,
            temperature: configData.ai_config.temperature
        };

        if (!aiConfig.openrouter_api_key) {
            throw new Error("OpenRouter API key not found in environment or config");
        }

        console.log(`Using initial model: ${aiConfig.initial_model}`);
        
        // Create an instance of the AI message processor with the config
        const processor = new AIMessageProcessor(aiConfig);
        
        // Test messages
        const testMessages = [
            "Just found a new Solana token to invest! $SOL token at address ELPrcU7qRV3DUz8AP6siTE7GkR3gkkBvGmgBRiLnC19Y",
            "Market is looking bearish today. Be careful with this tokens. ELPrcU7qRV3DUz8AP6siTE7GkR3gkkBvGmgBRiLnC19Y",
            "Two interesting tokens to watch: ELPrcU7qRV3DUz8AP6siTE7GkR3gkkBvGmgBRiLnC19Y and BONK (7BNwDrLsyiQmGN7PKMUPtVCRMetuG6b6xLRiAhdZpump). SOL has strong fundamentals but BONK is more speculative.",
            "I have someting interesting to share with you. 0x3FDA67f7583380E67ef93072294a7fAc882FD7E7"
        ];
        
        // Process each test message
        for (const [index, message] of testMessages.entries()) {
            console.log("\n===================================");
            console.log(`Test ${index + 1}: ${message.substring(0, 50)}...`);
            console.log("===================================");
            
            try {
                console.log("Processing message...");
                const startTime = Date.now();
                const results = await processor.processMessage(message);
                console.log(results);
                const endTime = Date.now();
                
                console.log(`Processing completed in ${(endTime - startTime) / 1000} seconds`);
                
                if (results.length === 0) {
                    console.log("No tokens found in the message.");
                } else {
                    console.log(`Found ${results.length} token(s):`);
                    console.log(JSON.stringify(results, null, 2));
                    
                    // Print buy recommendations
                    results.forEach(result => {
                        console.log(`Buy recommendation for ${result.solana_token_address}: ${result.is_potential_to_buy_token ? 'YES' : 'NO'}`);
                    });
                }
            } catch (error) {
                if (isError(error)) {
                    console.error(`Error processing message: ${error.message}\n${error.stack}`);
                } else {
                    console.error('Unknown error occurred:', error);
                }
            }
            
            console.log("===================================\n");
        }
    } catch (error) {
        if (isError(error)) {
            console.error(`Configuration error: ${error.message}\n${error.stack}`);
        } else {
            console.error('Unknown configuration error occurred:', error);
        }
        process.exit(1);
    }
}

type Error = {
    message: string;
    stack?: string;
};
  
function isError(error: unknown): error is Error {
return typeof error === 'object' && error !== null && 'message' in error && 'stack' in error;
}
  
// Run the test
console.log("Starting AI processor test...");
testAIProcessor()
    .then(() => console.log("Test completed successfully."))
    .catch(error => {
        if (isError(error)) {
            console.error(`Test failed: ${error.message}\n${error.stack}`);
        } else {
            console.error('Unknown test failure occurred:', error);
        }
        process.exit(1);
    });