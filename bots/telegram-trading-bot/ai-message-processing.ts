import { z } from "zod";
import axios from 'axios';
import * as dotenv from 'dotenv';
import { config as configData } from "./config";
import { AIConfig } from "./types";
import { retryAxiosRequest } from "../utils/help-functions";

// Load environment variables
dotenv.config();

const tokenAnalysisResult = z.array(z.object({
  solana_token_address: z.string().describe("The Solana token address"),
  is_message_has_any_mentioned_token: z.boolean().describe("Whether the message has any mentioned token"),
  analysis: z.string().describe("Analysis of signal from the message and reasoning why to buy or not"),
  is_potential_to_buy_token: z.boolean().describe("Whether the token is potential to buy"),
  message_text: z.string().describe("The text of the message"),
}));

export interface TokenAnalysisResult {
  solana_token_address: string;
  is_message_has_any_mentioned_token: boolean;
  analysis: string;
  is_potential_to_buy_token: boolean;
  message_text: string;
}

export class AIMessageProcessor {
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private temperature: number;

  constructor(aiConfig?: AIConfig) {
    const aiConfigFromEnv = aiConfig || {
      openrouter_api_key: process.env.OPEN_ROUTER_API_KEY || configData.ai_config.openrouter_api_key,
      initial_model: configData.ai_config.initial_model,
      base_url: configData.ai_config.base_url,
      temperature: configData.ai_config.temperature
    };

    console.log(`[AIMessageProcessor] Initializing with model: ${aiConfigFromEnv.initial_model}`);
    console.log(`[AIMessageProcessor] Using base URL: ${aiConfigFromEnv.base_url}`);
    console.log(`[AIMessageProcessor] API Key present: ${!!aiConfigFromEnv.openrouter_api_key}`);

    if (!aiConfigFromEnv.openrouter_api_key) {
      throw new Error("OpenRouter API key not found in environment or config");
    }

    this.apiKey = aiConfigFromEnv.openrouter_api_key;
    this.model = aiConfigFromEnv.initial_model;
    this.baseUrl = aiConfigFromEnv.base_url;
    this.temperature = aiConfigFromEnv.temperature;
  }

  async processMessage(telegram_message: string, processRunCounter: number): Promise<TokenAnalysisResult[]> {
    try {
      const systemPrompt = `You are a trading bot that analyzes messages from a telegram channel.
      You need to analyze the message and return a JSON object with the following fields:
      - solana_token_address: token on solana blockchain
      - is_message_has_any_mentioned_token: whether the message has any mentioned token
      - analysis: analysis of signal from the message and reasoning why to buy or not
      - is_potential_to_buy_token: whether the token is potential to buy, false only if message specifically says not to buy
      - message_text: the text of the message
      If you are not sure about the token or if message contains no tokens, return an empty array.`;

      console.log(`[AIMessageProcessor] Making request to: ${this.baseUrl}`);
      console.log(`[AIMessageProcessor] Using model: ${this.model}`);
      console.log(`[AIMessageProcessor] Auth header: Bearer ${this.apiKey.substring(0, 10)}...`);

      const response = await retryAxiosRequest(
        () => axios.post(
          this.baseUrl,
          {
            model: this.model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: telegram_message }
            ],
            temperature: this.temperature,
            response_format: { type: "json_object" }
          },
          {
            headers: {
              'Authorization': `Bearer ${this.apiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://github.com/yourusername/your-repo',
              'X-Title': 'Telegram Trading Bot'
            }
          }
        ),
        3, // maxRetries
        1000, // initialDelay
        processRunCounter
      );

      const result = response.data.choices[0].message.content;
      console.log(`[AIMessageProcessor] Raw API Response:`, result);

      // Parse the response as JSON
      const parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
      
      // Validate against our schema
      if (Array.isArray(parsedResult)) {
        return tokenAnalysisResult.parse(parsedResult);
      } else if (parsedResult.results && Array.isArray(parsedResult.results)) {
        return tokenAnalysisResult.parse(parsedResult.results);
      }
      
      return [];
    } catch (error) {
      console.error(`[telegram-trading-bot]|[processMessage]| Error parsing initial model output: ${error}`);
      if (axios.isAxiosError(error)) {
        console.error('[telegram-trading-bot]|[processMessage]| API Response:', processRunCounter, error.response?.data);
      }
      return []; // Return an empty array if parsing fails
    }
  }
}