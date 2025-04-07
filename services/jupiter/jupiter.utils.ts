import { RetryConfig } from './jupiter.types';

export const delay = async (ms: number): Promise<void> => {
  await new Promise(resolve => setTimeout(resolve, ms));
};

export const calculateBackoffDelay = (
  retryCount: number,
  config: RetryConfig
): number => {
  const backoffDelay = config.retryDelay * Math.pow(config.backoffFactor || 1.5, retryCount);
  return Math.min(backoffDelay, config.maxDelay || 15000);
}; 