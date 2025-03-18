
/**
 * Helper function to retry axios requests with exponential backoff
 * @param requestFn Function that returns an axios request promise
 * @param maxRetries Maximum number of retry attempts
 * @param initialDelay Initial delay in ms before first retry
 * @param processRunCounter Process run counter for logging
 * @returns The axios response or throws an error after all retries fail
 */
export async function retryAxiosRequest<T>(
    requestFn: () => Promise<T>, 
    maxRetries: number = 3, 
    initialDelay: number = 1000,
    processRunCounter: number
  ): Promise<T> {
    let lastError: any;
    let delay = initialDelay;
  
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error: any) {
        lastError = error;
        if (attempt >= maxRetries) {
          break;
        }
        
        // Wait before next retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }
    
    throw lastError;
  }
  