"use client"

// Crypto service for end-to-end encryption of medical data
export class CryptoService {
  private static instance: CryptoService
  private encryptionKey: CryptoKey | null = null
  private keyId: string | null = null

  private constructor() {}

  static getInstance(): CryptoService {
    if (!CryptoService.instance) {
      CryptoService.instance = new CryptoService()
    }
    return CryptoService.instance
  }

  /**
   * Initialize encryption with a new key
   */
  async initialize(): Promise<string> {
    try {
      // Generate a new AES-GCM key
      this.encryptionKey = await window.crypto.subtle.generateKey(
        {
          name: "AES-GCM",
          length: 256,
        },
        true, // extractable
        ["encrypt", "decrypt"],
      )

      // Generate a unique key ID for this session
      this.keyId = this.generateKeyId()

      console.log("Encryption initialized with key ID:", this.keyId)
      return this.keyId
    } catch (error) {
      console.error("Failed to initialize encryption:", error)
      throw new Error("Encryption initialization failed")
    }
  }

  /**
   * Generate a unique key identifier
   */
  private generateKeyId(): string {
    const array = new Uint8Array(16)
    window.crypto.getRandomValues(array)
    return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("")
  }

  /**
   * Encrypt text data
   */
  async encryptText(plaintext: string): Promise<{
    encryptedData: string
    iv: string
    keyId: string
  }> {
    if (!this.encryptionKey || !this.keyId) {
      throw new Error("Encryption not initialized")
    }

    try {
      // Generate a random initialization vector
      const iv = window.crypto.getRandomValues(new Uint8Array(12))

      // Convert text to bytes
      const encoder = new TextEncoder()
      const data = encoder.encode(plaintext)

      // Encrypt the data
      const encryptedBuffer = await window.crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: iv,
        },
        this.encryptionKey,
        data,
      )

      // Convert to base64 for transmission
      const encryptedArray = new Uint8Array(encryptedBuffer)
      const encryptedData = btoa(String.fromCharCode(...encryptedArray))
      const ivString = btoa(String.fromCharCode(...iv))

      return {
        encryptedData,
        iv: ivString,
        keyId: this.keyId,
      }
    } catch (error) {
      console.error("Encryption failed:", error)
      // Return a more specific error to help with debugging
      throw new Error(`Failed to encrypt data: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Decrypt text data
   */
  async decryptText(encryptedData: string, iv: string, keyId: string): Promise<string> {
    if (!this.encryptionKey || !this.keyId) {
      throw new Error("Encryption not initialized")
    }

    if (keyId !== this.keyId) {
      throw new Error("Key ID mismatch - cannot decrypt data from different session")
    }

    try {
      // Convert from base64
      const encryptedArray = new Uint8Array(
        atob(encryptedData)
          .split("")
          .map((char) => char.charCodeAt(0)),
      )
      const ivArray = new Uint8Array(
        atob(iv)
          .split("")
          .map((char) => char.charCodeAt(0)),
      )

      // Decrypt the data
      const decryptedBuffer = await window.crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: ivArray,
        },
        this.encryptionKey,
        encryptedArray,
      )

      // Convert back to text
      const decoder = new TextDecoder()
      return decoder.decode(decryptedBuffer)
    } catch (error) {
      console.error("Decryption failed:", error)
      throw new Error("Failed to decrypt data")
    }
  }

  /**
   * Check if encryption is available and initialized
   */
  isInitialized(): boolean {
    return this.encryptionKey !== null && this.keyId !== null
  }

  /**
   * Get current key ID
   */
  getKeyId(): string | null {
    return this.keyId
  }

  /**
   * Clear encryption keys (for security)
   */
  clearKeys(): void {
    this.encryptionKey = null
    this.keyId = null
    console.log("Encryption keys cleared")
  }

  /**
   * Check if Web Crypto API is supported
   */
  static isSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      window.crypto &&
      window.crypto.subtle &&
      typeof window.crypto.subtle.generateKey === "function"
    )
  }
}

// Encrypted data structure for transmission
export interface EncryptedData {
  encryptedData: string
  iv: string
  keyId: string
  timestamp: number
}

// Create encrypted payload for API transmission
export function createEncryptedPayload(encryptedData: string, iv: string, keyId: string): EncryptedData {
  return {
    encryptedData,
    iv,
    keyId,
    timestamp: Date.now(),
  }
}
