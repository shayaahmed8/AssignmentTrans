"use server"

import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"
import { groq } from "@ai-sdk/groq"

// Define supported AI providers
type AIProvider = "openai" | "groq" | "fallback"

// Track available providers - start with Groq as available since we just added it
const providerStatus: Record<string, boolean> = {
  openai: false, // Start with OpenAI marked as unavailable due to quota issues
  groq: true, // Assume Groq is available since we just added it
  fallback: true, // Fallback is always available
}

// Current provider - start with Groq since OpenAI has quota issues
let currentProvider: AIProvider = "groq"

// Rate limiting configuration
interface RateLimitConfig {
  maxRequestsPerMinute: number
  requestTimestamps: number[]
  retryDelayMs: number
  maxRetries: number
}

const rateLimits: Record<string, RateLimitConfig> = {
  groq: {
    maxRequestsPerMinute: 25, // Set below Groq's limit of 30 to be safe
    requestTimestamps: [],
    retryDelayMs: 2000, // Start with 2 second delay
    maxRetries: 3,
  },
  openai: {
    maxRequestsPerMinute: 15, // Conservative limit for OpenAI
    requestTimestamps: [],
    retryDelayMs: 1000,
    maxRetries: 3,
  },
}

// Encrypted data interface for secure transmission
interface EncryptedPayload {
  encryptedData: string
  iv: string
  keyId: string
  timestamp: number
}

/**
 * Sleep function for implementing delays
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Check if we're within rate limits and update timestamps
 */
function checkRateLimit(provider: AIProvider): { allowed: boolean; retryAfter?: number } {
  if (provider === "fallback") return { allowed: true }

  const config = rateLimits[provider]
  if (!config) return { allowed: true }

  const now = Date.now()

  // Remove timestamps older than 1 minute
  config.requestTimestamps = config.requestTimestamps.filter((timestamp) => now - timestamp < 60000)

  // Check if we're at the limit
  if (config.requestTimestamps.length >= config.maxRequestsPerMinute) {
    // Calculate when we can retry (when the oldest timestamp expires)
    const oldestTimestamp = config.requestTimestamps[0]
    const retryAfter = Math.max(100, 60000 - (now - oldestTimestamp) + 500) // Add 500ms buffer

    return { allowed: false, retryAfter }
  }

  // Add current timestamp and allow the request
  config.requestTimestamps.push(now)
  return { allowed: true }
}

/**
 * Fallback function to simulate AI enhancement for medical terms
 */
function simulateEnhancement(text: string): string {
  // Simple dictionary of common medical term corrections
  const medicalTerms: Record<string, string> = {
    "hart attack": "heart attack",
    "high blood presher": "high blood pressure",
    dibeties: "diabetes",
    artheritis: "arthritis",
    "miocardial infarction": "myocardial infarction",
    hipoxia: "hypoxia",
    neumonia: "pneumonia",
    apendicitis: "appendicitis",
    colesteral: "cholesterol",
    anziety: "anxiety",
    "coronery artery": "coronary artery",
    rhumatoid: "rheumatoid",
    "gastrick reflux": "gastric reflux",
    hipertension: "hypertension",
    "cerebral hemrage": "cerebral hemorrhage",
    "siatic nerve": "sciatic nerve",
    parkinsons: "Parkinson's",
    "ulserative colitis": "ulcerative colitis",
    sirosis: "cirrhosis",
    demensha: "dementia",
  }

  // Replace common misheard medical terms
  let enhancedText = text
  Object.entries(medicalTerms).forEach(([incorrect, correct]) => {
    enhancedText = enhancedText.replace(new RegExp(incorrect, "gi"), correct)
  })

  return enhancedText
}

/**
 * Fallback function to simulate AI translation
 */
function simulateTranslation(text: string, targetLanguage: string): string {
  // For demo purposes only
  const demoTranslations: Record<string, Record<string, string>> = {
    en: {
      es: "[DEMO] Traducción simulada al español: " + text,
      fr: "[DEMO] Traduction simulée en français: " + text,
      de: "[DEMO] Simulierte Übersetzung auf Deutsch: " + text,
      zh: "[DEMO] 模拟中文翻译: " + text,
      ja: "[DEMO] 日本語の模擬翻訳: " + text,
      default: "[DEMO] Simulated translation to " + targetLanguage + ": " + text,
    },
    default: {
      default: "[DEMO] Simulated translation to " + targetLanguage + ": " + text,
    },
  }

  const sourceTranslations = demoTranslations["en"] || demoTranslations["default"]
  return sourceTranslations[targetLanguage] || sourceTranslations["default"]
}

/**
 * Get the model for the current provider
 */
function getModel(provider: AIProvider) {
  switch (provider) {
    case "openai":
      return openai("gpt-4o")
    case "groq":
      return groq("llama-3.1-8b-instant") // Using Llama 3.1 8B Instant for faster responses
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

/**
 * Try to use the next available provider
 */
function switchToNextProvider(): AIProvider {
  // Order of preference - prioritize Groq since we know it's available
  const providers: AIProvider[] = ["groq", "openai", "fallback"]

  // Find current provider index
  const currentIndex = providers.indexOf(currentProvider)

  // Try each provider in order
  for (let i = 0; i < providers.length; i++) {
    // Skip the current provider
    if (i === currentIndex) continue

    if (providerStatus[providers[i]]) {
      currentProvider = providers[i]
      console.log(`Switched to ${currentProvider} provider`)
      return currentProvider
    }
  }

  // If all else fails, use fallback
  currentProvider = "fallback"
  return currentProvider
}

/**
 * Make an API request with rate limiting and retries
 */
async function makeRateLimitedRequest<T>(
  provider: AIProvider,
  requestFn: () => Promise<T>,
  retryCount = 0,
): Promise<T> {
  // Check if we're within rate limits
  const rateLimit = checkRateLimit(provider)

  if (!rateLimit.allowed) {
    console.log(`Rate limit reached for ${provider}, waiting ${rateLimit.retryAfter}ms before retry`)

    // If we need to wait, sleep and then retry
    if (rateLimit.retryAfter) {
      await sleep(rateLimit.retryAfter)
      return makeRateLimitedRequest(provider, requestFn, retryCount)
    }
  }

  try {
    // Make the actual request
    return await requestFn()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)

    // Check for rate limit errors
    if (errorMessage.toLowerCase().includes("rate limit") || errorMessage.toLowerCase().includes("too many requests")) {
      // If we've exceeded max retries, throw the error
      const config = rateLimits[provider]
      if (retryCount >= (config?.maxRetries || 3)) {
        throw new Error(`Rate limit exceeded after ${retryCount} retries: ${errorMessage}`)
      }

      // Calculate backoff delay with exponential increase
      const backoffDelay = (config?.retryDelayMs || 1000) * Math.pow(2, retryCount)
      console.log(`Rate limit error, retrying in ${backoffDelay}ms (attempt ${retryCount + 1})`)

      // Wait and retry
      await sleep(backoffDelay)
      return makeRateLimitedRequest(provider, requestFn, retryCount + 1)
    }

    // For other errors, just rethrow
    throw error
  }
}

/**
 * Process encrypted data securely
 * Note: In a real implementation, this would handle the encrypted payload properly
 * For this demo, we'll work with the decrypted text but log that encryption was used
 */
function processEncryptedData(payload: EncryptedPayload | string): string {
  if (typeof payload === "string") {
    // Plain text - log security warning
    console.warn("Processing unencrypted data - security risk in production")
    return payload
  } else {
    // Encrypted payload - in production, this would be properly handled
    console.log(`Processing encrypted data with key ID: ${payload.keyId}`)
    // For demo purposes, we'll note that this should be decrypted server-side
    // In a real implementation, the server would decrypt this data
    return "[ENCRYPTED_DATA_PLACEHOLDER]"
  }
}

/**
 * Enhances a transcript with AI to improve medical terminology recognition
 * Now supports encrypted data transmission
 */
export async function enhanceTranscriptWithAI(transcript: string | EncryptedPayload): Promise<string> {
  // Process the input (encrypted or plain text)
  const processedText = typeof transcript === "string" ? transcript : processEncryptedData(transcript)

  // If using fallback provider, use simulated enhancement
  if (currentProvider === "fallback") {
    return simulateEnhancement(processedText)
  }

  // For encrypted data in demo mode, we'll use the original text
  // In production, the server would decrypt the data first
  const workingText = typeof transcript === "string" ? transcript : "[Demo: Processing encrypted medical data]"

  try {
    // Use rate-limited request
    const result = await makeRateLimitedRequest(currentProvider, async () => {
      return await generateText({
        model: getModel(currentProvider),
        prompt: workingText,
        system:
          "You are a medical transcription assistant. Your task is to correct and enhance medical terminology in transcripts. Only make changes to medical terms that may have been misrecognized by speech-to-text. Preserve the original meaning and structure of the text. Return only the corrected transcript without explanations.",
        temperature: 0.3,
        maxTokens: 1000,
      })
    })

    return result.text || workingText
  } catch (error) {
    console.error(`Error enhancing transcript with ${currentProvider}:`, error)

    // Check for quota errors
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage.includes("quota") || errorMessage.includes("billing")) {
      console.log(`${currentProvider} API quota exceeded`)
      providerStatus[currentProvider] = false
    }

    // Try next provider
    const nextProvider = switchToNextProvider()

    if (nextProvider === "fallback") {
      return simulateEnhancement(workingText)
    }

    // Retry with new provider
    return enhanceTranscriptWithAI(transcript)
  }
}

/**
 * Translates text from source language to target language
 * Now supports encrypted data transmission
 */
export async function translateText(
  text: string | EncryptedPayload,
  sourceLanguage: string,
  targetLanguage: string,
): Promise<string> {
  // Process the input (encrypted or plain text)
  const processedText = typeof text === "string" ? text : processEncryptedData(text)

  // If using fallback provider, use simulated translation
  if (currentProvider === "fallback") {
    return simulateTranslation(processedText, targetLanguage)
  }

  // For encrypted data in demo mode, we'll use the original text
  // In production, the server would decrypt the data first
  const workingText = typeof text === "string" ? text : "[Demo: Processing encrypted medical data]"

  try {
    // Use rate-limited request
    const result = await makeRateLimitedRequest(currentProvider, async () => {
      return await generateText({
        model: getModel(currentProvider),
        prompt: workingText,
        system: `You are a medical translator. Translate the following text from ${sourceLanguage} to ${targetLanguage}. Maintain medical accuracy and terminology. Return only the translated text without explanations.`,
        temperature: 0.3,
        maxTokens: 1000,
      })
    })

    return result.text || workingText
  } catch (error) {
    console.error(`Error translating text with ${currentProvider}:`, error)

    // Check for quota errors
    const errorMessage = error instanceof Error ? error.message : String(error)
    if (errorMessage.includes("quota") || errorMessage.includes("billing") || errorMessage.includes("rate limit")) {
      console.log(`${currentProvider} API issue: ${errorMessage}`)
      providerStatus[currentProvider] = false
    }

    // Try next provider
    const nextProvider = switchToNextProvider()

    if (nextProvider === "fallback") {
      return simulateTranslation(workingText, targetLanguage)
    }

    // Retry with new provider
    return translateText(text, sourceLanguage, targetLanguage)
  }
}

/**
 * Get current AI provider information
 */
export async function getCurrentProvider(): Promise<{ name: AIProvider; displayName: string }> {
  const displayNames: Record<AIProvider, string> = {
    openai: "OpenAI (GPT-4o)",
    groq: "Groq (Llama 3.1)",
    fallback: "Fallback (Demo Mode)",
  }

  return {
    name: currentProvider,
    displayName: displayNames[currentProvider],
  }
}

/**
 * Set the AI provider to use
 */
export async function setAIProvider(provider: AIProvider): Promise<boolean> {
  if (provider === currentProvider) return true

  // If trying to switch to a provider that's marked as unavailable,
  // first try to verify it's really unavailable (except for OpenAI which we know has quota issues)
  if (!providerStatus[provider] && provider !== "fallback" && provider !== "openai") {
    try {
      // Try a minimal API call to check if it's available
      await makeRateLimitedRequest(provider, async () => {
        return await generateText({
          model: getModel(provider),
          prompt: "test",
          maxTokens: 5,
        })
      })

      // If we get here, the provider is available
      providerStatus[provider] = true
    } catch (error) {
      console.error(`Provider ${provider} is unavailable:`, error)
      return false
    }
  }

  if (providerStatus[provider] || provider === "fallback") {
    currentProvider = provider
    return true
  }

  return false
}

/**
 * Check if all API providers are available
 */
export async function checkAPIStatus(): Promise<{
  providers: Record<string, boolean>
  currentProvider: string
  message: string
}> {
  // Skip checking OpenAI since we know it has quota issues
  // Only check Groq if it's currently marked as available
  if (providerStatus.groq) {
    try {
      // Try a minimal API call to Groq
      await makeRateLimitedRequest("groq", async () => {
        return await generateText({
          model: groq("llama-3.1-8b-instant"),
          prompt: "test",
          maxTokens: 5,
        })
      })
    } catch (error) {
      console.error(`Provider groq check failed:`, error)
      providerStatus.groq = false
    }
  }

  // If current provider is unavailable, switch
  if (!providerStatus[currentProvider]) {
    switchToNextProvider()
  }

  // Prepare status message
  const providerInfo = await getCurrentProvider()
  let message = `Using ${providerInfo.displayName} for AI services.`
  if (currentProvider === "fallback") {
    message = "All AI providers are unavailable. Running in demo mode with simulated responses."
  }

  return {
    providers: { ...providerStatus },
    currentProvider,
    message,
  }
}
