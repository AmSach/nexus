/**
 * Central Groq / LLM Configuration
 * Default engine: Qwen 3.8 (qwen/qwen3.8-27b) on Groq LPU
 */

export const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

// Primary requested model: Qwen 3.8 27B
export const PRIMARY_MODEL = 'qwen/qwen3.8-27b'

// Resilient fallback chain for chat / extraction
export const GROQ_MODELS = [
  'qwen/qwen3.8-27b',     // Primary: Qwen 3.8
  'openai/gpt-oss-120b',  // High-capacity reasoning
  'openai/gpt-oss-20b',   // Fast 20B
  'allam-2-7b',           // Lightweight 7B
  'llama-3.3-70b-versatile', // Fallback for other accounts
  'llama-3.1-8b-instant',
]

/**
 * Universal Groq / Grok key resolver.
 * Checks store keys, grok alias, and Vite environment variables.
 */
export function resolveGroqKey(storeKeys) {
  if (typeof storeKeys === 'string' && storeKeys.trim().length > 5) {
    return storeKeys.trim()
  }
  const key = storeKeys?.groq || storeKeys?.grok || import.meta.env?.VITE_GROQ_KEY || ''
  return typeof key === 'string' ? key.trim() : ''
}
