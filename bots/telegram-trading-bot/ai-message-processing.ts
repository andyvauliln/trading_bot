import { z } from "zod";
import axios from 'axios';
import * as dotenv from 'dotenv';
import { config as configData } from "./config";
import { AIConfig } from "./types";
import { retryAxiosRequest } from "../utils/help-functions";

// Load environment variables
dotenv.config();

const tokenAnalysisResult = z.array(z.object({
  token_address: z.string().describe("The token address on Solana Blockchain"),
  is_message_has_any_mentioned_token: z.boolean().describe("Whether the message has any mentioned token"),
  analysis: z.string().describe("Analysis of signal from the message and reasoning why to buy or not"),
  is_potential_to_buy_token: z.boolean().describe("Whether the token is potential to buy"),
  message_text: z.string().describe("The text of the message"),
}));

export interface TokenAnalysisResult {
  token_address: string;
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

    console.log(`${configData.name}|[AIMessageProcessor]| Initializing with model: ${aiConfigFromEnv.initial_model}`);
    console.log(`${configData.name}|[AIMessageProcessor]| Using base URL: ${aiConfigFromEnv.base_url}`);
    console.log(`${configData.name}|[AIMessageProcessor]| API Key present: ${!!aiConfigFromEnv.openrouter_api_key}`);

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
      You need to analyze the message and return a JSON array containing objects with the following fields:
      - token_address: string - the token address on Solana blockchain, or empty string if no token address found
      - is_message_has_any_mentioned_token: boolean - whether the message has any mentioned token
      - analysis: string - analysis of signal from the message and reasoning why to buy or not
      - is_potential_to_buy_token: boolean - whether the token is potential to buy, false only if message specifically says not to buy
      - message_text: string - the exact text of the message where the token was mentioned
      
      IMPORTANT: Your response must be a valid JSON array (even if empty). Do not include backticks, markdown formatting, or any commentary outside the JSON just raw JSON array. 
      If you are not sure about the token or if the message contains no tokens, return an empty array like this: []
      
      Example of a valid response format:
      [
        {
          "token_address": "7KTvQMsGPnwsVRUUQAQQBkMBHJp5YA68yRnwZyq8Z6oa",
          "is_message_has_any_mentioned_token": true,
          "analysis": "This message indicates a strong buy signal because...",
          "is_potential_to_buy_token": true,
          "message_text": "Let's ape into this new token 7KTvQMsGPnwsVRUUQAQQBkMBHJp5YA68yRnwZyq8Z6oa",
          "message_id": 1234567890
        }
      ]`;

      let response;
      try {
        response = await retryAxiosRequest(
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
      } catch (apiError) {
        console.error(`${configData.name}|[AIMessageProcessor]|[processMessage]| API call error: ${apiError}`, processRunCounter);
        if (axios.isAxiosError(apiError)) {
          console.error(`${configData.name}|[AIMessageProcessor]|[processMessage]| API call failed with status: ${apiError.response?.status}`, processRunCounter);
          console.error(`${configData.name}|[AIMessageProcessor]|[processMessage]| API error details:`, apiError.response?.data, processRunCounter);
        }
        return [];
      }

      // Validate the response structure
      if (!response.data || !response.data.choices || !response.data.choices[0] || !response.data.choices[0].message) {
        console.error(`${configData.name}|[AIMessageProcessor]|[processMessage]| Invalid API response structure:`, response.data, processRunCounter);
        return [];
      }
      console.log(`${configData.name}|[AIMessageProcessor]|[processMessage]| Response:`, response.data, processRunCounter);
      const result = response.data.choices[0].message.content;
      console.log(`${configData.name}|[AIMessageProcessor]| Raw API Response:`, result, processRunCounter);
      if (!result) {
        console.error(`${configData.name}|[AIMessageProcessor]|[processMessage]| No result found in response`, processRunCounter);
        return [];
      }

      // Parse the response as JSON with improved error handling
      let parsedResult;
      try {
        // Check if the result is a string and if it's valid JSON
        if (typeof result === 'string') {
          // Trim whitespace and check if it's a properly formatted JSON
          const trimmedResult = result.trim();
          
          // If it starts with a backtick (common in code block responses), try to extract JSON from it
          if (trimmedResult.startsWith('`') && trimmedResult.endsWith('`')) {
            // Remove the backticks and try to parse
            const jsonContent = trimmedResult.substring(1, trimmedResult.length - 1).trim();
            parsedResult = JSON.parse(jsonContent);
          } 
          // If it starts with ```json and ends with ```, extract the JSON content
          else if (trimmedResult.startsWith('```json') && trimmedResult.endsWith('```')) {
            // Extract content between ```json and ```
            const jsonContent = trimmedResult.substring(7, trimmedResult.length - 3).trim();
            parsedResult = JSON.parse(jsonContent);
          }
          // If it's a regular JSON string
          else {
            parsedResult = JSON.parse(trimmedResult);
          }
        } else {
          // If result is already an object, use it directly
          parsedResult = result;
        }
      } catch (parseError) {
        console.error(`${configData.name}|[AIMessageProcessor]|[processMessage]| Error parsing JSON: ${parseError}`);
        console.error(`${configData.name}|[AIMessageProcessor]|[processMessage]| Raw content that failed to parse:`, result);
        return []; // Return empty array on parse failure
      }
      
      // Validate against our schema
      try {
        if (Array.isArray(parsedResult)) {
          return tokenAnalysisResult.parse(parsedResult);
        } else if (parsedResult && parsedResult.results && Array.isArray(parsedResult.results)) {
          return tokenAnalysisResult.parse(parsedResult.results);
        } else if (parsedResult) {
          // If it's a single object, wrap it in an array
          if (typeof parsedResult === 'object' && !Array.isArray(parsedResult) && parsedResult !== null) {
            // Check if it has token_address property
            if ('token_address' in parsedResult) {
              return tokenAnalysisResult.parse([parsedResult]);
            }
          }
        }
        
        console.log(`${configData.name}|[AIMessageProcessor]|[processMessage]| No valid token data found in response`);
        return [];
      } catch (validationError) {
        console.error(`${configData.name}|[AIMessageProcessor]|[processMessage]| Schema validation error: ${validationError}`);
        return [];
      }
    } catch (error) {
      console.error(`${configData.name}|[AIMessageProcessor]|[processMessage]| Error when getting response from AI: ${error}`);
      
      // More detailed error logging
      if (error instanceof SyntaxError) {
        console.error(`${configData.name}|[AIMessageProcessor]|[processMessage]| JSON parsing error: This is likely due to malformed JSON from the AI service.`);
      }
      
      if (axios.isAxiosError(error)) {
        console.error(`${configData.name}|[AIMessageProcessor]|[processMessage]| API Response Status:`, error.response?.status);
        console.error(`${configData.name}|[AIMessageProcessor]|[processMessage]| API Response Headers:`, error.response?.headers);
        console.error(`${configData.name}|[AIMessageProcessor]|[processMessage]| API Response Data:`, processRunCounter, error.response?.data);
      }
      
      return []; // Return an empty array if parsing fails
    }
  }
}