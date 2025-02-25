import { ChatOpenAI } from "@langchain/openai";
import { PromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser, JsonOutputParser } from "@langchain/core/output_parsers";
import * as dotenv from 'dotenv';
import { config as configData } from "./telegram-trading-bot-config";
import { AIConfig } from "./types";

// Load environment variables
dotenv.config();

export interface TokenAnalysisResult {
  solana_token_address: string;
  is_message_has_any_mentioned_token: boolean;
  analysis: string;
  is_potential_to_buy_token: boolean;
}

export class AIMessageProcessor {
  private initialModel: ChatOpenAI;
  private detailedModel: ChatOpenAI | null;
  private initialPromptTemplate: PromptTemplate;
  private detailedPromptTemplate: PromptTemplate;
  private outputParser: StringOutputParser;

  constructor(aiConfig?: AIConfig) {
    const aiConfigFromEnv = {
      openrouter_api_key: process.env.OPEN_ROUTER_API_KEY || configData.ai_config.openrouter_api_key,
      initial_model: configData.ai_config.initial_model,
      detailed_model: configData.ai_config.detailed_model,
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

    // Initialize the detailed model if provided (more powerful model)
    this.detailedModel = aiConfigFromEnv.detailed_model ? new ChatOpenAI({
      modelName: aiConfigFromEnv.detailed_model,
      temperature: aiConfigFromEnv.temperature,
      openAIApiKey: aiConfigFromEnv.openrouter_api_key,
      configuration: {
        baseURL: aiConfigFromEnv.base_url,
      },
    }) : null;

    // Initialize the output parser
    this.outputParser = new StringOutputParser();

    // Create the initial prompt template for token identification
    this.initialPromptTemplate = new PromptTemplate({
      template: 
      `You are a cryptocurrency trading assistant specializing in Solana meme tokens.
       Analyze the following message from a Telegram channel and identify any Solana tokens mentioned. If tokens are found, provide their Solana addresses.
       If no Solana tokens are mentioned or if the information is insufficient to make a decision, return an empty array.
        Your response should be a valid JSON array with objects having the following structure:
        [
          {{
            "solana_token_address": "token address in solana blockchain",
            "analysis": "Analysis of signal from the message and reasoning why to buy or not",
            "is_potential_to_buy_token": false // false only if message definitely not about buying token
            "is_message_has_any_mentioned_token": false
          }}
        ]
      
      Message:
      {message}
      
      return only valid json!`,
      inputVariables: ["message"]
    });
    

    // Create the detailed prompt template for deeper analysis
    this.detailedPromptTemplate = new PromptTemplate({
      template: 
      `You are a cryptocurrency trading assistant specializing in Solana meme tokens.
       Analyze the following message from a Telegram channel and identify any Solana tokens mentioned. If tokens are found, provide their Solana addresses.
       If no Solana tokens are mentioned or if the information is insufficient to make a decision, return an empty array.
        Your response should be a valid JSON array with objects having the following structure:
        [
          {{
            "solana_token_address": "token address in solana blockchain",
            "analysis": "Analysis of signal from the message and reasoning why to buy or not",
            "is_potential_to_buy_token": false
            "is_message_has_any_mentioned_token": false
          }}
        ]
      
      Message:
      {message}
      
      return only valid json!`,
      inputVariables: ["message"]
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
      
      // If no tokens found or no detailed model available, return initial results
      if (initialResults.length === 0 || !this.detailedModel) {
        return initialResults;
      }
      
      // Step 2: Detailed analysis with the more powerful model if tokens were found
      console.log(`[AI] Performing detailed analysis with ${this.detailedModel.modelName} for ${initialResults.length} token(s)...`);
      const detailedResults: TokenAnalysisResult[] = [];
      
      for (const result of initialResults) {
        const detailedResult = await this.performDetailedAnalysis(
          result.solana_token_address,
          message,
          result.analysis,
          result.is_message_has_any_mentioned_token,
          result.is_potential_to_buy_token
        );
        detailedResults.push(detailedResult);
      }
      
      return detailedResults;
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
  private async performInitialAnalysis(message: string): Promise<TokenAnalysisResult[]> {
    try {
      // Format the prompt with the message
      const prompt = await this.initialPromptTemplate.format({
        message: message,
      });

      // Create a chain
      const chain = this.initialModel.pipe(this.outputParser);
      
      // Call the model and parse the response
      const result = await chain.invoke(prompt);
      
      try {
        // Clean up the result string to handle potential formatting issues
        const cleanedResult = result.trim()
          .replace(/^```json\s*|\s*```$/g, '') // Remove markdown code blocks
          .replace(/^```\s*|\s*```$/g, '');    // Remove other code blocks
        
        // Log the result for debugging
        console.log(`Raw AI response (first 100 chars): ${result.substring(0, 100)}...`);
        console.log(`Cleaned response (first 100 chars): ${cleanedResult.substring(0, 100)}...`);
        
        // Parse the string result into JSON
        const parsedResult = JSON.parse(cleanedResult);
        return parsedResult as TokenAnalysisResult[];
      } catch (parseError) {
        console.error(`Error parsing JSON: ${parseError}`);
        console.error(`Failed to parse (first 200 chars): ${result.substring(0, 200)}`);
        return []; // Return empty array if parsing fails
      }
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
  private async performDetailedAnalysis(
    tokenAddress: string,
    message: string,
    initialAnalysis: string,
    is_message_has_any_mentioned_token: boolean,
    is_potential_to_buy_token: boolean
  ): Promise<TokenAnalysisResult> {
    if (!this.detailedModel) {
      return {
        solana_token_address: tokenAddress,
        analysis: initialAnalysis,
        is_potential_to_buy_token: is_potential_to_buy_token,
        is_message_has_any_mentioned_token: is_message_has_any_mentioned_token
      };
    }

    // Format the prompt with the token details
    const prompt = await this.detailedPromptTemplate.format({
      token_address: tokenAddress,
      message: message,
      initial_analysis: initialAnalysis
    });

    // Create a chain
    const chain = this.detailedModel.pipe(this.outputParser);
    
    try {
      // Call the model and parse the response
      const result = await chain.invoke(prompt);
      
      try {
        // Clean up the result string to handle potential formatting issues
        const cleanedResult = result.trim()
          .replace(/^```json\s*|\s*```$/g, '') // Remove markdown code blocks
          .replace(/^```\s*|\s*```$/g, '');    // Remove other code blocks
        
        // Log the result for debugging
        console.log(`Detailed analysis raw response (first 100 chars): ${result.substring(0, 100)}...`);
        console.log(`Detailed analysis cleaned response (first 100 chars): ${cleanedResult.substring(0, 100)}...`);
        
        // Parse the string result into JSON
        const parsedResult = JSON.parse(cleanedResult);
        
        // The result should be a single object, but we'll handle both cases
        if (Array.isArray(parsedResult) && parsedResult.length > 0) {
          return parsedResult[0] as TokenAnalysisResult;
        } else if (!Array.isArray(parsedResult)) {
          return parsedResult as TokenAnalysisResult;
        } else {
          // Fallback to initial analysis if detailed analysis fails
          return {
            solana_token_address: tokenAddress,
            analysis: initialAnalysis,
            is_potential_to_buy_token: false,
            is_message_has_any_mentioned_token: is_message_has_any_mentioned_token
          };
        }
      } catch (parseError) {
        console.error(`Error parsing JSON in detailed analysis: ${parseError}`);
        console.error(`Failed to parse detailed analysis (first 200 chars): ${result.substring(0, 200)}`);
        // Fallback to initial analysis if parsing fails
        return {
          solana_token_address: tokenAddress,
          analysis: initialAnalysis,
          is_potential_to_buy_token: false,
          is_message_has_any_mentioned_token: is_message_has_any_mentioned_token
        };
      }
    } catch (error) {
      console.error(`Error in detailed analysis: ${error}`);
      // Fallback to initial analysis if detailed analysis fails
      return {
        solana_token_address: tokenAddress,
        analysis: initialAnalysis,
        is_potential_to_buy_token: false,
        is_message_has_any_mentioned_token: is_message_has_any_mentioned_token
      };
    }
  }
}