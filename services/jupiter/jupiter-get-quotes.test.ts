import { getTokenQuotes, getExcludedDexes, getProgramIdToLabelHash } from './jupiter-get-quotes';
import { QuoteResult } from './types';

// Mock data
const MOCK_DATA = {
  botName: 'test-bot',
  token: '6nvEsU2MzMBRcj6amCXmuQ89H8PX1FHEu9Ztg1s94Rjz', // WSOL mint
  balance: 767.67,
  slippageBps: 100,
  processRunCounter: 0,
};


// Test runner
async function runTests() {
  console.log('Starting jupiter-get-quotes tests...\n');

  try {
    const result = await getTokenQuotes(
      MOCK_DATA.botName,
      MOCK_DATA.token,
      Math.round(Number(MOCK_DATA.balance) * 1e9).toString(),
      MOCK_DATA.slippageBps.toString(),
      MOCK_DATA.processRunCounter
    );
    console.log('Result:', result);

    if (!result.success || !result.data) {
      throw new Error('Expected quote result to be successful');
    }

    // Verify response structure
    const expectedFields = ['inputMint', 'outputMint', 'inAmount', 'outAmount', 'slippageBps'];
    for (const field of expectedFields) {
      if (!(field in result.data)) {
        throw new Error(`Expected field ${field} in response data`);
      }
    }
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run tests
console.log('Running jupiter-get-quotes tests...');
runTests().catch(console.error);
