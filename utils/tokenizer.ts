import { encoding_for_model } from 'tiktoken';
import type { TiktokenModel } from 'tiktoken';

// Dedicated simplified token counting function
export const countTokensSimplified = (text: string): number => {
  // Count characters and divide by 4 (assuming 4 chars per token on average)
  return Math.ceil(text.length / 4);
};

// A cache to store previously counted tokens
const tokenCountCache = new Map<string, number>();

export const countTokens = async (text: string, model: TiktokenModel = 'gpt-4', useSimplified: boolean = false) => {
  // Use the simplified method if requested or if text is very short
  if (useSimplified || text.length < 20) {
    return countTokensSimplified(text);
  }
  
  // Create a cache key based on text and model
  const cacheKey = `${model}:${text.length}:${text.substring(0, 100)}${text.substring(text.length - 100)}`;
  
  // Return cached result if available
  if (tokenCountCache.has(cacheKey)) {
    return tokenCountCache.get(cacheKey)!;
  }
  
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    // Wrap in a Promise with timeout to prevent hangs from WASM issues
    const result = await Promise.race([
      new Promise<number>(async (resolve) => {
        try {
          const encoder = encoding_for_model(model);
          const tokens = encoder.encode(text);
          const count = tokens.length;
          encoder.free(); // Free up the memory
          resolve(count);
        } catch (innerError) {
          console.warn('Error in tiktoken encoding:', innerError);
          resolve(countTokensSimplified(text));
        }
      }),
      new Promise<number>((resolve) => {
        // Timeout after 500ms to prevent hanging
        timeoutId = setTimeout(() => {
          console.warn('Tiktoken tokenization timed out, using simplified count');
          resolve(countTokensSimplified(text));
        }, 500);
      })
    ]);
    
    // Cache the result
    tokenCountCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.error('Unexpected error counting tokens:', error);
    const fallbackCount = countTokensSimplified(text);
    tokenCountCache.set(cacheKey, fallbackCount);
    return fallbackCount;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};
