import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser, JsonOutputParser } from "@langchain/core/output_parsers";
import * as dotenv from 'dotenv';
import { config as configData } from "./telegram-trading-bot-config";
import { AIConfig } from "./types";
import { z } from "zod";

// Load environment variables
dotenv.config();

const tokenAnalysisResult = z.array(z.object({
  solana_token_address: z.string().describe("The Solana token address"),
  is_message_has_any_mentioned_token: z.boolean().describe("Whether the message has any mentioned token"),
  analysis: z.string().describe("Analysis of signal from the message and reasoning why to buy or not"),
  is_potential_to_buy_token: z.boolean().describe("Whether the token is potential to buy"),
}));

export interface TokenAnalysisResult {
  solana_token_address: string;
  is_message_has_any_mentioned_token: boolean;
  analysis: string;
  is_potential_to_buy_token: boolean;
}

export class AIMessageProcessor {
  private initialModel: ChatOpenAI;

  constructor(aiConfig?: AIConfig) {
    const aiConfigFromEnv = aiConfig || {
      openrouter_api_key: process.env.OPEN_ROUTER_API_KEY || configData.ai_config.openrouter_api_key,
      initial_model: configData.ai_config.initial_model,
      base_url: configData.ai_config.base_url,
      temperature: configData.ai_config.temperature
    };

    // Initialize the initial model (cheaper/free model)
    this.initialModel = new ChatOpenAI({
      modelName: aiConfigFromEnv.initial_model,
      temperature: aiConfigFromEnv.temperature,
      openAIApiKey: aiConfigFromEnv.openrouter_api_key,
      configuration: {
        baseURL: aiConfigFromEnv.base_url,
      },
    });  
  }

  /**
   * Process a message to identify and analyze Solana tokens
   * @param message The message to analyze
   * @returns An array of token analysis results or an empty array if no tokens are found
   */
  async processMessage(message: string): Promise<TokenAnalysisResult[]> {
    try {
      // Step 1: Initial analysis with the cheaper model
      console.log(`[AI] Performing initial token identification with ${this.initialModel.modelName}...`);
      const initialResults = await this.performInitialAnalysis(message);

      return initialResults;
      
      // If no tokens found or no detailed model available, return initial results
      // if (initialResults.length === 0 || !this.detailedModel) {
      //   return initialResults;
      // }

      
      // Step 2: Detailed analysis with the more powerful model if tokens were found
      // console.log(`[AI] Performing detailed analysis with ${this.detailedModel.modelName} for ${initialResults.length} token(s)...`);
      // const detailedResults: TokenAnalysisResult[] = [];
      
      // for (const result of initialResults) {
      //   const detailedResult = await this.performDetailedAnalysis(
      //     result.solana_token_address,
      //     message,
      //     result.analysis,
      //     result.is_message_has_any_mentioned_token,
      //     result.is_potential_to_buy_token
      //   );
      //   detailedResults.push(detailedResult);
      // }
      
      // return detailedResults;
    } catch (error) {
      console.error(`Error processing message with AI: ${error}`);
      // Return empty array on error
      return [];
    }
  }

  /**
   * Perform initial analysis to identify tokens
   * @param message The message to analyze
   * @returns An array of token analysis results
   */
  private async performInitialAnalysis(telegram_message: string): Promise<TokenAnalysisResult[]> {
    try {
      const ai_message = `
      you are a trading bot that is analyzing a message from a telegram channel.
      you are given a message from a telegram channel and you need to analyze the message and return a json object with the following fields:
      - solana_token_address: token on solana blockchain
      - is_message_has_any_mentioned_token: whether the message has any mentioned token
      - analysis: analysis of signal from the message and reasoning why to buy or not
      - is_potential_to_buy_token: whether the token is potential to buy, false only if message specifically says not to buy

      if you are not sure about the token or if message contains, return an empty array
      Message:
      ${telegram_message}
      `
      const result = await this.initialModel.withStructuredOutput(tokenAnalysisResult).invoke(ai_message);
      return result;

    } catch (error) {
      console.error(`Error parsing initial model output: ${error}`);
      return []; // Return an empty array if parsing fails
    }
  }

  /**
   * Perform detailed analysis on a specific token
   * @param tokenAddress The Solana token address
   * @param message The original message
   * @param initialAnalysis The initial analysis
   * @returns A detailed token analysis result
   */
  // private async performDetailedAnalysis(
  //   tokenAddress: string,
  //   message: string,
  //   initialAnalysis: string,
  //   is_message_has_any_mentioned_token: boolean,
  //   is_potential_to_buy_token: boolean
  // ): Promise<TokenAnalysisResult[]> {
    

  //   // Format the prompt with the token details
  //   const ai_message = `
  //   you are a trading bot that is analyzing a message from a telegram channel.
  //   you are given a message from a telegram channel and you need to analyze the message and return a json object with the following fields:
  //   - solana_token_address: token on solana blockchain
  //   - is_message_has_any_mentioned_token: whether the message has any mentioned token
  //   - analysis: analysis of signal from the message and reasoning why to buy or not
  //   - is_potential_to_buy_token: whether the token is potential to buy, false only if message specifically says not to buy

  //   if you are not sure about the token or if message contains, return an empty array
  //   Message:
  //   ${message}
  //   `
    
  //   try {
  //     // Call the model and parse the response
  //     const result = await this.detailedModel.withStructuredOutput(tokenAnalysisResult).invoke(ai_message);
  //     return result;  
  //   } catch (error) {
  //     console.error(`Error in detailed analysis: ${error}`);
  //     // Fallback to initial analysis if detailed analysis fails
  //     return {
  //       solana_token_address: tokenAddress,
  //       analysis: initialAnalysis,
  //       is_potential_to_buy_token: false,
  //       is_message_has_any_mentioned_token: is_message_has_any_mentioned_token
  //     };
  //   }
  //         .replace(/^```json\s*|\s*```$/g, '') // Remove markdown code blocks
  //         .replace(/^```\s*|\s*```$/g, '');    // Remove other code blocks
        
  //       // Log the result for debugging
  //       console.log(`Detailed analysis raw response (first 100 chars): ${result.substring(0, 100)}...`);
  //       console.log(`Detailed analysis cleaned response (first 100 chars): ${cleanedResult.substring(0, 100)}...`);
        
  //       // Parse the string result into JSON
  //       const parsedResult = JSON.parse(cleanedResult);
        
  //       // The result should be a single object, but we'll handle both cases
  //       if (Array.isArray(parsedResult) && parsedResult.length > 0) {
  //         return parsedResult[0] as TokenAnalysisResult;
  //       } else if (!Array.isArray(parsedResult)) {
  //         return parsedResult as TokenAnalysisResult;
  //       } else {
  //         // Fallback to initial analysis if detailed analysis fails
  //         return {
  //           solana_token_address: tokenAddress,
  //           analysis: initialAnalysis,
  //           is_potential_to_buy_token: false,
  //           is_message_has_any_mentioned_token: is_message_has_any_mentioned_token
  //         };
  //       }
  //     } catch (parseError) {
  //       console.error(`Error parsing JSON in detailed analysis: ${parseError}`);
  //       console.error(`Failed to parse detailed analysis (first 200 chars): ${result.substring(0, 200)}`);
  //       // Fallback to initial analysis if parsing fails
  //       return {
  //         solana_token_address: tokenAddress,
  //         analysis: initialAnalysis,
  //         is_potential_to_buy_token: false,
  //         is_message_has_any_mentioned_token: is_message_has_any_mentioned_token
  //       };
  //     }
  //   } catch (error) {
  //     console.error(`Error in detailed analysis: ${error}`);
  //     // Fallback to initial analysis if detailed analysis fails
  //     return {
  //       solana_token_address: tokenAddress,
  //       analysis: initialAnalysis,
  //       is_potential_to_buy_token: false,
  //       is_message_has_any_mentioned_token: is_message_has_any_mentioned_token
  //     };
  //   }
  // }
}