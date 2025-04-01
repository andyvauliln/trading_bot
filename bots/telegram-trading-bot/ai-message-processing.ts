import { z } from "zod";
import axios from 'axios';
import * as dotenv from 'dotenv';
import { config as configData } from "./config";
import { AIConfig } from "./types";
import { retryAxiosRequest } from "../../common/utils/help-functions";

// Load environment variables
dotenv.config();

const tokenAnalysisResult = z.array(z.object({
  token_address: z.string().describe("The token address on Solana Blockchain"),
  is_message_has_any_mentioned_token: z.boolean().describe("Whether the message has any mentioned token"),
  analysis: z.string().describe("Analysis of signal from the message and reasoning why to buy or not"),
  is_potential_to_buy_token: z.boolean().describe("Whether the token is potential to buy"),
  message_text: z.string().describe("The text of the message"),
  message_id: z.number().describe("The id of the message"),
  chain: z.string().describe("The chain of the token, available chains: solana, ethereum, binance, base and etc."),
  channel_name: z.string().describe("The name of the channel"),
}));

export interface TokenAnalysisResult {
  token_address: string;
  is_message_has_any_mentioned_token: boolean;
  analysis: string;
  is_potential_to_buy_token: boolean;
  message_text: string;
  message_id: number;
  chain: string;
  channel_name: string;
}

export class AIMessageProcessor {
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private temperature: number;
  private fallbackModels: string[] = [
    "anthropic/claude-3-sonnet-20240229",
    "mistralai/mistral-7b-instruct",
    "openai/gpt-3.5-turbo"
  ];

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

  /**
   * Create the system prompt for token analysis
   */
  private getSystemPrompt(): string {
    return `You are a trading bot that analyzes messages from a telegram channel.
    You need to analyze the list of messages and return a JSON array if you found any tokens information in a message. Result should be an array of objects with the following fields:
    - token_address: string - the token address on Solana blockchain, or empty string if no token address found
    - chain: solana, (chain of the token, available chains: solana, ethereum, binance, base)
    - is_message_has_any_mentioned_token: boolean - whether the message has any mentioned token
    - analysis: string - analysis of signal from the message and reasoning why to buy or not
    - is_potential_to_buy_token: boolean - whether the token is potential to buy, false only if message specifically says not to buy
    - message_text: string - the exact text of the message where the token was mentioned
    - message_id: number - the id of the message
    - channel_name: string - the name of the channel

    IMPORTANT: Your response must ONLY contain a valid JSON array (even if empty). 
    Do not include any text outside the JSON array.
    Do not include backticks or markdown formatting.
    Just return the raw JSON array and nothing else.
    Make sure the JSON is complete and valid with all closing brackets.

    If you are not sure about the token or if the message contains no tokens, return an empty array like this: []
    If message contains several tokens, add records to the final array for every token mentioned in the message:

    Example of a valid response format:
    [
      {
        "token_address": "7KTvQMsGPnwsVRUUQAQQBkMBHJp5YA68yRnwZyq8Z6oa",
        "is_message_has_any_mentioned_token": true,
        "analysis": "This message indicates a strong buy signal because...",
        "is_potential_to_buy_token": true,
        "message_text": "Let's ape into this new token 7KTvQMsGPnwsVRUUQAQQBkMBHJp5YA68yRnwZyq8Z6oa",
        "message_id": 1234567890,
        "chain": "solana",
        "channel_name": "channel_name"
      }
    ]`;
  }

  /**
   * Make API call to the AI service
   */
  private async callAIService(telegram_message: string, processRunCounter: number, attemptNumber: number = 0): Promise<any> {
    try {
      // Select model - use initial model on first attempt, otherwise cycle through fallback models
      const currentModel = attemptNumber === 0 ? 
        this.model : 
        this.fallbackModels[(attemptNumber - 1) % this.fallbackModels.length];
      
      if (attemptNumber > 0) {
        console.log(`${configData.name}|[AIMessageProcessor]|[callAIService]| Attempt ${attemptNumber}: Using fallback model ${currentModel}`, processRunCounter);
      }

      const response = await retryAxiosRequest(
        () => axios.post(
          this.baseUrl,
          {
            model: currentModel,
            messages: [
              { role: "system", content: this.getSystemPrompt() },
              { role: "user", content: telegram_message }
            ],
            temperature: this.temperature,
            response_format: { type: "json_object" },
            max_tokens: 4000
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
        5, // Increase maxRetries from 3 to 5
        1000, // initialDelay
        processRunCounter
      );

      return response;
    } catch (apiError) {
      console.error(`${configData.name}|[AIMessageProcessor]|[callAIService]| API call error: ${apiError}`, processRunCounter);
      if (axios.isAxiosError(apiError)) {
        const statusCode = apiError.response?.status;
        console.error(`${configData.name}|[AIMessageProcessor]|[callAIService]| API call failed with status: ${statusCode}`, processRunCounter);
        console.error(`${configData.name}|[AIMessageProcessor]|[callAIService]| API error details:`, apiError.response?.data, processRunCounter);
        
        // Check for rate limiting or provider errors
        if (statusCode === 429 || statusCode === 503) {
          console.log(`${configData.name}|[AIMessageProcessor]|[callAIService]| Rate limit or provider error detected, will try fallback model`, processRunCounter);
          
          // If we haven't tried all fallback options yet
          if (attemptNumber <= this.fallbackModels.length) {
            // Wait longer for rate limit errors before retrying
            await new Promise(resolve => setTimeout(resolve, 2000 * (attemptNumber + 1)));
            return this.callAIService(telegram_message, processRunCounter, attemptNumber + 1);
          }
        }
      }
      return null;
    }
  }

  /**
   * Validate API response structure
   */
  private validateResponseStructure(response: any, processRunCounter: number): string | null {
    // Check for provider errors in the response
    if (response?.data?.error) {
      const error = response.data.error;
      console.error(`${configData.name}|[AIMessageProcessor]|[validateResponseStructure]| Provider error:`, error, processRunCounter);
      
      // If it's a rate limit error or service unavailable, return null to trigger retry
      if (error.code === 429 || error.code === 503) {
        return null;
      }
    }

    if (!response || !response.data || !response.data.choices || !response.data.choices[0] || !response.data.choices[0].message) {
      console.error(`${configData.name}|[AIMessageProcessor]|[validateResponseStructure]| Invalid API response structure:`, response?.data, processRunCounter);
      return null;
    }

    console.log(`${configData.name}|[AIMessageProcessor]|[validateResponseStructure]| Response:`, response.data, processRunCounter);
    const result = response.data.choices[0].message.content;
    console.log(`${configData.name}|[AIMessageProcessor]| Raw API Response:`, result || "No result found in response", processRunCounter);
    
    if (!result) {
      console.error(`${configData.name}|[AIMessageProcessor]|[validateResponseStructure]| No result found in response`, processRunCounter);
      return null;
    }

    return result;
  }

  /**
   * Extract valid JSON from the content based on brackets
   */
  private extractJsonByBrackets(content: string): string {
    // Look for array or object brackets to find the actual JSON
    const arrayStartIndex = content.indexOf('[');
    const objectStartIndex = content.indexOf('{');
    
    // Find the earliest valid JSON start character
    let startIndex = -1;
    if (arrayStartIndex !== -1 && objectStartIndex !== -1) {
      startIndex = Math.min(arrayStartIndex, objectStartIndex);
    } else if (arrayStartIndex !== -1) {
      startIndex = arrayStartIndex;
    } else if (objectStartIndex !== -1) {
      startIndex = objectStartIndex;
    }
    
    if (startIndex === -1) {
      return content;
    }

    let trimmedContent = content.substring(startIndex);
    
    // For arrays, find the matching closing bracket
    if (trimmedContent.startsWith('[')) {
      let bracketCount = 0;
      let endIndex = -1;
      
      for (let i = 0; i < trimmedContent.length; i++) {
        if (trimmedContent[i] === '[') bracketCount++;
        else if (trimmedContent[i] === ']') bracketCount--;
        
        // If we found the matching closing bracket
        if (bracketCount === 0 && trimmedContent[i] === ']') {
          endIndex = i + 1; // Include the closing bracket
          break;
        }
      }
      
      if (endIndex !== -1) {
        return trimmedContent.substring(0, endIndex);
      }
    }
    
    // For objects, find the matching closing brace
    else if (trimmedContent.startsWith('{')) {
      let braceCount = 0;
      let endIndex = -1;
      
      for (let i = 0; i < trimmedContent.length; i++) {
        if (trimmedContent[i] === '{') braceCount++;
        else if (trimmedContent[i] === '}') braceCount--;
        
        // If we found the matching closing brace
        if (braceCount === 0 && trimmedContent[i] === '}') {
          endIndex = i + 1; // Include the closing brace
          break;
        }
      }
      
      if (endIndex !== -1) {
        return trimmedContent.substring(0, endIndex);
      }
    }
    
    return trimmedContent;
  }

  /**
   * Handle markdown formatted JSON responses
   */
  private extractJsonFromMarkdown(content: string): string | null {
    // If it starts with a backtick (common in code block responses), try to extract JSON from it
    if (content.startsWith('`') && content.endsWith('`')) {
      // Remove the backticks and try to parse
      return content.substring(1, content.length - 1).trim();
    } 
    // If it starts with ```json and ends with ```, extract the JSON content
    else if (content.startsWith('```json') && content.endsWith('```')) {
      // Extract content between ```json and ```
      return content.substring(7, content.length - 3).trim();
    }
    // For triple backticks without 'json' prefix
    else if (content.startsWith('```') && content.endsWith('```')) {
      return content.substring(3, content.length - 3).trim();
    }
    
    return null;
  }

  /**
   * Fix incomplete JSON responses
   */
  private fixIncompleteJson(content: string, processRunCounter: number): any {
    // Check for chunked JSON in the response (incomplete JSON)
    if (content.startsWith('[') && !content.endsWith(']')) {
      try {
        // Try to fix the incomplete JSON by adding a closing bracket
        const fixedJson = content + ']';
        const result = JSON.parse(fixedJson);
        console.log(`${configData.name}|[AIMessageProcessor]|[fixIncompleteJson]| Fixed incomplete JSON array by adding closing bracket`, processRunCounter);
        return result;
      } catch (fixError: any) {
        console.error(`${configData.name}|[AIMessageProcessor]|[fixIncompleteJson]| Could not fix incomplete JSON: ${fixError.message}`);
        return null;
      }
    }
    return null;
  }

  /**
   * Extract JSON using regex pattern matching
   */
  private extractJsonByPattern(content: string, processRunCounter: number): any {
    try {
      // Try to find any valid JSON array in the text
      const arrayMatch = content.match(/\[\s*{.*}\s*\]/s);
      if (arrayMatch) {
        const result = JSON.parse(arrayMatch[0]);
        console.log(`${configData.name}|[AIMessageProcessor]|[extractJsonByPattern]| Extracted valid JSON array from response`, processRunCounter);
        return result;
      }
    } catch (error) {
      console.error(`${configData.name}|[AIMessageProcessor]|[extractJsonByPattern]| Failed to extract JSON by pattern: ${error}`);
    }
    return null;
  }

  /**
   * Recover token data from malformed JSON using regex
   */
  private recoverTokensFromMalformedJson(content: string, processRunCounter: number): TokenAnalysisResult[] | null {
    try {
      // Try to extract token addresses using regex pattern matching
      const tokenAddressPattern = /"token_address":\s*"([^"]+)"/g;
      const matches = [...content.matchAll(tokenAddressPattern)];
      
      if (matches.length > 0) {
        console.log(`${configData.name}|[AIMessageProcessor]|[recoverTokensFromMalformedJson]| Found ${matches.length} token addresses in malformed JSON, attempting recovery`, processRunCounter);
        
        // Create a minimal valid array with the extracted token addresses
        const recoveredTokens = matches.map(match => ({
          token_address: match[1],
          is_message_has_any_mentioned_token: true,
          analysis: "Recovered from malformed JSON",
          is_potential_to_buy_token: true,
          message_text: "Content recovered from parsing error",
          message_id: 0,
          chain: "solana", // Default to solana as mentioned in your code
          channel_name: "recovered"
        }));
        
        console.log(`${configData.name}|[AIMessageProcessor]|[recoverTokensFromMalformedJson]| Successfully recovered ${recoveredTokens.length} token entries`, processRunCounter);
        return recoveredTokens;
      }
    } catch (recoveryError) {
      console.error(`${configData.name}|[AIMessageProcessor]|[recoverTokensFromMalformedJson]| Recovery attempt failed: ${recoveryError}`, processRunCounter);
    }
    
    return null;
  }

  /**
   * Parse and handle JSON response from AI service
   */
  private parseJsonResponse(result: string, processRunCounter: number): any {
    try {
      // If the result is a string, process it
      if (typeof result === 'string') {
        // Trim whitespace
        let trimmedResult = result.trim();
        
        // Remove any non-JSON content that might appear before or after the actual JSON
        trimmedResult = this.extractJsonByBrackets(trimmedResult);
        
        // Try to extract JSON from markdown formatting
        const markdownJson = this.extractJsonFromMarkdown(trimmedResult);
        if (markdownJson) {
          return JSON.parse(markdownJson);
        }
        
        // Try to fix incomplete JSON
        const fixedJson = this.fixIncompleteJson(trimmedResult, processRunCounter);
        if (fixedJson) {
          return fixedJson;
        }
        
        // Try direct parsing
        try {
          return JSON.parse(trimmedResult);
        } catch (initialParseError) {
          // If direct parsing fails, try to extract by pattern
          const patternJson = this.extractJsonByPattern(trimmedResult, processRunCounter);
          if (patternJson) {
            return patternJson;
          }
          
          // If all attempts fail, throw the original error
          throw initialParseError;
        }
      } else {
        // If result is already an object, use it directly
        return result;
      }
    } catch (parseError) {
      console.error(`${configData.name}|[AIMessageProcessor]|[parseJsonResponse]| Error parsing JSON: ${parseError}`);
      console.error(`${configData.name}|[AIMessageProcessor]|[parseJsonResponse]| Raw content that failed to parse:`, result);
      throw parseError;
    }
  }

  /**
   * Validate parsed result against schema
   */
  private validateWithSchema(parsedResult: any, processRunCounter: number): TokenAnalysisResult[] {
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
      
      console.log(`${configData.name}|[AIMessageProcessor]|[validateWithSchema]| No valid token data found in response`);
      return [];
    } catch (validationError) {
      console.error(`${configData.name}|[AIMessageProcessor]|[validateWithSchema]| Schema validation error: ${validationError}`);
      throw validationError;
    }
  }

  /**
   * Process telegram message and extract token information
   */
  async processMessage(telegram_message: string, processRunCounter: number): Promise<TokenAnalysisResult[]> {
    try {
      // First attempt with default model
      let response = await this.callAIService(telegram_message, processRunCounter);
      if (!response) {
        console.log(`${configData.name}|[AIMessageProcessor]|[processMessage]| Initial API request failed, continuing with empty result`, processRunCounter);
        return [];
      }

      // Validate response structure
      let result = this.validateResponseStructure(response, processRunCounter);
      if (!result) {
        console.log(`${configData.name}|[AIMessageProcessor]|[processMessage]| Invalid response structure, continuing with empty result`, processRunCounter);
        return [];
      }

      // Parse JSON response
      try {
        const parsedResult = this.parseJsonResponse(result, processRunCounter);
        
        // Validate parsed result with schema
        return this.validateWithSchema(parsedResult, processRunCounter);
      } catch (parseError) {
        console.error(`${configData.name}|[AIMessageProcessor]|[processMessage]| JSON parsing error: ${parseError}`, processRunCounter);
        
        // If parsing fails, try to recover tokens from malformed JSON
        const recoveredTokens = this.recoverTokensFromMalformedJson(result, processRunCounter);
        if (recoveredTokens) {
          return recoveredTokens;
        }
        
        // If all recovery attempts fail, return empty array
        return [];
      }
    } catch (error) {
      console.error(`${configData.name}|[AIMessageProcessor]|[processMessage]| Error when getting response from AI: ${error}`, processRunCounter);
      
      // More detailed error logging
      if (error instanceof SyntaxError) {
        console.error(`${configData.name}|[AIMessageProcessor]|[processMessage]| JSON parsing error: This is likely due to malformed JSON from the AI service.`, processRunCounter);
      }
      
      if (axios.isAxiosError(error)) {
        console.error(`${configData.name}|[AIMessageProcessor]|[processMessage]| API Response Status:`, error.response?.status, processRunCounter);
        console.error(`${configData.name}|[AIMessageProcessor]|[processMessage]| API Response Headers:`, error.response?.headers, processRunCounter);
        console.error(`${configData.name}|[AIMessageProcessor]|[processMessage]| API Response Data:`, error.response?.data, processRunCounter);
      }
      
      return []; // Return an empty array if parsing fails
    }
  }
}