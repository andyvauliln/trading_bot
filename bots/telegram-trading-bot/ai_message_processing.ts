import { ChatOpenAI } from "@langchain/openai";
import * as dotenv from 'dotenv';
import { config as configData } from "./config";
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
   * Perform initial analysis to identify tokens
   * @param message The message to analyze
   * @returns An array of token analysis results
   */
 async processMessage(telegram_message: string, processRunCounter: number): Promise<TokenAnalysisResult[]> {
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
      console.error(`[telegram-trading-bot]|[processMessage]| Error parsing initial model output: ${error}`, processRunCounter);
      return []; // Return an empty array if parsing fails
    }
  }
}