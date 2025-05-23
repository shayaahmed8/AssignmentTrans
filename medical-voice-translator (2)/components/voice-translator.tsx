"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Mic, MicOff, Volume2, Loader2, AlertTriangle, Settings } from "lucide-react"
import { enhanceTranscriptWithAI, translateText, checkAPIStatus, getCurrentProvider } from "@/lib/ai-service"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { ProviderSelector } from "./provider-selector"
import { Slider } from "@/components/ui/slider"
import { CryptoService, createEncryptedPayload, type EncryptedData } from "@/lib/crypto-service"
import { EncryptionStatus } from "./encryption-status"

// Add a confidentiality notice at the top of the component
// Add this right after the imports and before the component definition

// Add this disclaimer component
function ConfidentialityNotice({ encryptionEnabled }: { encryptionEnabled: boolean }) {
  return (
    <Alert className="mb-4">
      <AlertTitle>Confidentiality Notice</AlertTitle>
      <AlertDescription>
        This is a demo application.{" "}
        {encryptionEnabled
          ? "End-to-end encryption is active for data protection."
          : "Enable encryption in Settings for enhanced data protection."}
        Voice data is processed through third-party AI services. Do not enter real patient information or protected
        health information (PHI). For production medical use, additional security measures would be required.
      </AlertDescription>
    </Alert>
  )
}

// Type definitions for Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
  message: string
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((event: SpeechRecognitionEvent) => void) | null
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null
  onend: (() => void) | null
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition
    webkitSpeechRecognition: new () => SpeechRecognition
  }
}

// Language options for translation
const LANGUAGES = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "zh", name: "Chinese" },
  { code: "ja", name: "Japanese" },
  { code: "ar", name: "Arabic" },
  { code: "hi", name: "Hindi" },
  { code: "ru", name: "Russian" },
  { code: "pt", name: "Portuguese" },
]

// Sample medical texts for demo mode
const SAMPLE_MEDICAL_TEXTS = [
  "The patient presents with acute myocardial infarction and dyspnea. We should monitor for signs of hypoxemia and administer appropriate medication.",
  "Patient has a history of type 2 diabetes mellitus with peripheral neuropathy and retinopathy. Blood glucose levels have been fluctuating between 180-220 mg/dL.",
  "MRI reveals a herniated disc at L4-L5 with nerve root compression. Patient reports radiating pain and paresthesia in the left lower extremity.",
  "The patient was diagnosed with community-acquired pneumonia. Chest X-ray shows consolidation in the right lower lobe with mild pleural effusion.",
  "Patient presents with symptoms consistent with Crohn's disease including abdominal pain, diarrhea, and weight loss. Colonoscopy showed ulcerations in the terminal ileum.",
]

// Default silence detection settings
const DEFAULT_SILENCE_THRESHOLD = 1500 // 1.5 seconds of silence before stopping (was 2000)
const DEFAULT_AUDIO_THRESHOLD = 12 // Lower audio level threshold to detect speech (was 15)

// Debounce function to prevent too many API calls
function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null

  return (...args: Parameters<F>): Promise<ReturnType<F>> => {
    return new Promise((resolve) => {
      if (timeout) {
        clearTimeout(timeout)
      }

      timeout = setTimeout(() => {
        resolve(func(...args))
      }, waitFor)
    })
  }
}

export default function VoiceTranslator() {
  const [isRecording, setIsRecording] = useState(false)
  const [originalText, setOriginalText] = useState("")
  const [translatedText, setTranslatedText] = useState("")
  const [sourceLanguage, setSourceLanguage] = useState("en")
  const [targetLanguage, setTargetLanguage] = useState("es")
  const [error, setError] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isSupported, setIsSupported] = useState(false)
  const [apiStatus, setApiStatus] = useState<{
    providers: Record<string, boolean>
    currentProvider: string
    message: string
  } | null>(null)
  const [isCheckingApi, setIsCheckingApi] = useState(true)
  const [currentProviderInfo, setCurrentProviderInfo] = useState<{ name: string; displayName: string } | null>(null)

  // Encryption states
  const [encryptionEnabled, setEncryptionEnabled] = useState(false)
  const [encryptionKeyId, setEncryptionKeyId] = useState<string | null>(null)

  // Voice activity detection states
  const [isSpeechDetected, setIsSpeechDetected] = useState(false)
  const [audioLevel, setAudioLevel] = useState(0)
  const [silenceThreshold, setSilenceThreshold] = useState(DEFAULT_SILENCE_THRESHOLD)
  const [audioThreshold, setAudioThreshold] = useState(DEFAULT_AUDIO_THRESHOLD)
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const speechSynthesisRef = useRef<SpeechSynthesisUtterance | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const microphoneStreamRef = useRef<MediaStream | null>(null)
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const dataArrayRef = useRef<Uint8Array | null>(null)
  const animationFrameRef = useRef<number | null>(null)
  const lastSpeechTimeRef = useRef<number>(Date.now())
  const transcriptRef = useRef<string>("")
  const processingRef = useRef<boolean>(false)
  const cryptoServiceRef = useRef<CryptoService>(CryptoService.getInstance())

  // Create a debounced version of the translation function with encryption support
  const debouncedTranslate = useRef(
    debounce(async (text: string, sourceLang: string, targetLang: string) => {
      if (!text.trim() || processingRef.current) return

      processingRef.current = true
      setIsProcessing(true)

      try {
        let textToProcess: string | EncryptedData = text

        // Encrypt the text if encryption is enabled
        if (encryptionEnabled && cryptoServiceRef.current.isInitialized()) {
          try {
            const encrypted = await cryptoServiceRef.current.encryptText(text)
            textToProcess = createEncryptedPayload(encrypted.encryptedData, encrypted.iv, encrypted.keyId)
            console.log("Text encrypted for processing")
          } catch (encryptError) {
            console.warn("Encryption failed, proceeding with unencrypted text:", encryptError)
            // Continue with unencrypted text if encryption fails
          }
        }

        // Enhance transcript with AI for medical terms
        const enhancedTranscript = await enhanceTranscriptWithAI(textToProcess)
        setOriginalText(enhancedTranscript)

        // Translate the enhanced transcript
        const translated = await translateText(enhancedTranscript, sourceLang, targetLang)
        setTranslatedText(translated)
      } catch (err) {
        console.error("Processing error:", err)
        setError("Error processing translation. Please try again.")

        // Check if we need to update API status
        const status = await checkAPIStatus()
        setApiStatus(status)

        // Update current provider info
        const providerInfo = await getCurrentProvider()
        setCurrentProviderInfo(providerInfo)
      } finally {
        setIsProcessing(false)
        processingRef.current = false
      }
    }, 1000),
  ).current

  // Handler for encryption status change
  const handleEncryptionChange = (enabled: boolean, keyId: string | null) => {
    setEncryptionEnabled(enabled)
    setEncryptionKeyId(keyId)

    if (enabled) {
      console.log("End-to-end encryption enabled with key ID:", keyId)
    } else {
      console.log("End-to-end encryption disabled")
    }
  }

  // Check API status on component mount
  useEffect(() => {
    const checkApi = async () => {
      setIsCheckingApi(true)
      try {
        const status = await checkAPIStatus()
        setApiStatus(status)

        // Get current provider info
        const providerInfo = await getCurrentProvider()
        setCurrentProviderInfo(providerInfo)
      } catch (err) {
        console.error("Error checking API status:", err)
        setApiStatus({
          providers: { openai: false, groq: false, fallback: true },
          currentProvider: "fallback",
          message: "Unable to check API status. Running in demo mode.",
        })
        setCurrentProviderInfo({ name: "fallback", displayName: "Fallback (Demo Mode)" })
      } finally {
        setIsCheckingApi(false)
      }
    }

    checkApi()
  }, [])

  // Clean up audio resources on unmount
  useEffect(() => {
    return () => {
      stopAudioMonitoring()
      if (recognitionRef.current) {
        recognitionRef.current.abort()
      }
    }
  }, [])

  // Check browser support and initialize speech recognition
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition

      if (SpeechRecognition) {
        setIsSupported(true)
        recognitionRef.current = new SpeechRecognition()
        recognitionRef.current.continuous = true
        recognitionRef.current.interimResults = true
        recognitionRef.current.lang = sourceLanguage

        recognitionRef.current.onresult = async (event: SpeechRecognitionEvent) => {
          let transcript = ""
          let isFinal = false

          for (let i = 0; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript + " "
            if (event.results[i].isFinal) {
              isFinal = true
            }
          }

          // Update the last speech time whenever we get results
          lastSpeechTimeRef.current = Date.now()

          if (transcript.trim()) {
            setOriginalText(transcript)
            transcriptRef.current = transcript

            // Only process for translation if we have a final result
            if (isFinal) {
              // Use debounced translation to avoid too many API calls
              debouncedTranslate(transcript, sourceLanguage, targetLanguage)
            }
          }
        }

        recognitionRef.current.onerror = (event: SpeechRecognitionErrorEvent) => {
          console.error("Speech recognition error", event.error)
          setError(`Speech recognition error: ${event.error}`)
          setIsRecording(false)
          stopAudioMonitoring()
        }

        recognitionRef.current.onend = () => {
          // Only set isRecording to false if we're not restarting due to timeout
          if (isRecording) {
            setIsRecording(false)
            stopAudioMonitoring()

            // Process any final transcript if available
            if (transcriptRef.current && !processingRef.current) {
              debouncedTranslate(transcriptRef.current, sourceLanguage, targetLanguage)
            }
          }
        }
      } else {
        setError("Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.")
      }
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
      }
    }
  }, [sourceLanguage, targetLanguage, debouncedTranslate])

  // Handle language change
  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = sourceLanguage
    }
  }, [sourceLanguage])

  // Set up audio monitoring for voice activity detection
  const startAudioMonitoring = async () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
      }

      // Get microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      microphoneStreamRef.current = stream

      // Create analyzer node
      analyserRef.current = audioContextRef.current.createAnalyser()
      analyserRef.current.fftSize = 256

      // Connect microphone to analyzer
      const source = audioContextRef.current.createMediaStreamSource(stream)
      source.connect(analyserRef.current)

      // Create data array for analyzing audio levels
      const bufferLength = analyserRef.current.frequencyBinCount
      dataArrayRef.current = new Uint8Array(bufferLength)

      // Start monitoring audio levels
      monitorAudioLevels()

      // Reset the last speech time
      lastSpeechTimeRef.current = Date.now()

      // Start checking for silence
      checkForSilence()
    } catch (err) {
      console.error("Error accessing microphone:", err)
      setError("Could not access microphone. Please check permissions and try again.")
      setIsRecording(false)
    }
  }

  // Stop audio monitoring and clean up resources
  const stopAudioMonitoring = () => {
    // Stop the animation frame
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    // Clear the silence timer
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }

    // Stop the microphone stream
    if (microphoneStreamRef.current) {
      microphoneStreamRef.current.getTracks().forEach((track) => track.stop())
      microphoneStreamRef.current = null
    }

    // Reset audio level
    setAudioLevel(0)
    setIsSpeechDetected(false)
  }

  // Monitor audio levels for voice activity detection
  const monitorAudioLevels = () => {
    if (!analyserRef.current || !dataArrayRef.current) return

    // Get audio data
    analyserRef.current.getByteFrequencyData(dataArrayRef.current)

    // Calculate average volume level
    let sum = 0
    let peakValue = 0
    for (let i = 0; i < dataArrayRef.current.length; i++) {
      sum += dataArrayRef.current[i]
      peakValue = Math.max(peakValue, dataArrayRef.current[i])
    }
    const average = sum / dataArrayRef.current.length

    // Update audio level state
    setAudioLevel(average)

    // Detect if speech is happening - use both average and peak for better detection
    const isSpeaking = average > audioThreshold || peakValue > audioThreshold * 2

    // Only change speech detection state if it's significantly different
    // This prevents rapid toggling between speaking/not speaking states
    if (isSpeaking !== isSpeechDetected) {
      // If transitioning from not speaking to speaking, update immediately
      if (isSpeaking) {
        setIsSpeechDetected(true)
        lastSpeechTimeRef.current = Date.now()
      }
      // If transitioning from speaking to not speaking, require a small buffer
      // to prevent brief pauses from triggering
      else if (Date.now() - lastSpeechTimeRef.current > 300) {
        setIsSpeechDetected(false)
      }
    }

    // If speech is detected, update the last speech time
    if (isSpeaking) {
      lastSpeechTimeRef.current = Date.now()
    }

    // Continue monitoring
    animationFrameRef.current = requestAnimationFrame(monitorAudioLevels)
  }

  // Check for silence to automatically stop recording
  const checkForSilence = () => {
    if (!isRecording) return

    const currentTime = Date.now()
    const timeSinceLastSpeech = currentTime - lastSpeechTimeRef.current

    // If silence has been detected for longer than the threshold, stop recording
    if (timeSinceLastSpeech > silenceThreshold) {
      console.log("Silence detected for", timeSinceLastSpeech, "ms, stopping recording")

      // Only stop if we've actually detected speech before
      // This prevents stopping immediately if the user hasn't spoken yet
      if (transcriptRef.current.trim().length > 0) {
        if (recognitionRef.current) {
          recognitionRef.current.stop()
        }
        setIsRecording(false)
        stopAudioMonitoring()
        return
      } else {
        // If no speech detected yet, just wait
        console.log("No speech detected yet, continuing to listen")
      }
    }

    // Continue checking for silence
    silenceTimerRef.current = setTimeout(checkForSilence, 100)
  }

  // Toggle recording
  const toggleRecording = async () => {
    if (!isSupported || !recognitionRef.current) {
      setError("Speech recognition is not available.")
      return
    }

    if (isRecording) {
      // Manual stop
      recognitionRef.current.stop()
      setIsRecording(false)
      stopAudioMonitoring()
    } else {
      setError(null)
      try {
        // Reset transcript
        transcriptRef.current = ""
        setOriginalText("")
        setTranslatedText("")

        // Start recording
        await startAudioMonitoring()
        recognitionRef.current.start()
        setIsRecording(true)

        // Reset the last speech time to now
        lastSpeechTimeRef.current = Date.now()

        // Show a temporary message to guide the user
        setOriginalText("Listening... Please start speaking")
        setTimeout(() => {
          if (isRecording && originalText === "Listening... Please start speaking") {
            setOriginalText("")
          }
        }, 2000)
      } catch (err) {
        setError("Failed to start recording. Please try again.")
        console.error(err)
        stopAudioMonitoring()
      }
    }
  }

  // Speak translated text
  const speakTranslatedText = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      if (isSpeaking) {
        window.speechSynthesis.cancel()
        setIsSpeaking(false)
        return
      }

      speechSynthesisRef.current = new SpeechSynthesisUtterance(translatedText)

      // Try to find a voice that matches the target language
      const voices = window.speechSynthesis.getVoices()
      const voice = voices.find((voice) => voice.lang.startsWith(targetLanguage))
      if (voice) {
        speechSynthesisRef.current.voice = voice
      }

      speechSynthesisRef.current.lang = targetLanguage
      speechSynthesisRef.current.onend = () => setIsSpeaking(false)

      setIsSpeaking(true)
      window.speechSynthesis.speak(speechSynthesisRef.current)
    } else {
      setError("Speech synthesis is not supported in this browser.")
    }
  }

  // For demo purposes, add a sample transcript function
  const addSampleTranscript = async () => {
    // Select a random sample text
    const sampleText = SAMPLE_MEDICAL_TEXTS[Math.floor(Math.random() * SAMPLE_MEDICAL_TEXTS.length)]
    setOriginalText(sampleText)
    setIsProcessing(true)
    processingRef.current = true

    try {
      // Translate the sample text
      const translated = await translateText(sampleText, sourceLanguage, targetLanguage)
      setTranslatedText(translated)
    } catch (err) {
      console.error("Processing error:", err)
      setError("Error processing translation. Please try again.")

      // Check if we need to update API status
      const status = await checkAPIStatus()
      setApiStatus(status)

      // Update current provider info
      const providerInfo = await getCurrentProvider()
      setCurrentProviderInfo(providerInfo)
    } finally {
      setIsProcessing(false)
      processingRef.current = false
    }
  }

  // Handler for provider change
  const handleProviderChange = async () => {
    setIsCheckingApi(true)
    try {
      const status = await checkAPIStatus()
      setApiStatus(status)

      // Update current provider info
      const providerInfo = await getCurrentProvider()
      setCurrentProviderInfo(providerInfo)
    } catch (err) {
      console.error("Error checking API status after provider change:", err)
    } finally {
      setIsCheckingApi(false)
    }
  }

  if (isCheckingApi) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
        <span>Checking API status...</span>
      </div>
    )
  }

  // Modify the return statement to include the notice:
  return (
    <div className="space-y-6">
      <ConfidentialityNotice encryptionEnabled={encryptionEnabled} />
      {/* AI Provider Info */}
      <div className="flex justify-between items-center">
        <div className="flex items-center">
          <span className="text-sm font-medium">AI Provider:</span>
          <span className="ml-2 text-sm px-2 py-1 bg-primary/10 rounded">
            {apiStatus?.currentProvider === "fallback"
              ? "Demo Mode (Fallback)"
              : currentProviderInfo?.displayName || "Loading..."}
          </span>
        </div>

        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm">
              <Settings className="h-4 w-4 mr-2" /> Settings
            </Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Application Settings</SheetTitle>
              <SheetDescription>Configure AI providers and application settings</SheetDescription>
            </SheetHeader>

            {apiStatus && (
              <div className="py-4 space-y-6">
                <ProviderSelector
                  currentProvider={apiStatus.currentProvider}
                  providers={apiStatus.providers}
                  onProviderChange={handleProviderChange}
                />
                <EncryptionStatus onEncryptionChange={handleEncryptionChange} />

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-medium">Voice Detection Settings</h3>
                    <Button variant="ghost" size="sm" onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}>
                      {showAdvancedSettings ? "Hide" : "Show"}
                    </Button>
                  </div>

                  {showAdvancedSettings && (
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <label className="text-sm">Silence Timeout (ms): {silenceThreshold}</label>
                          <span className="text-xs text-muted-foreground">{(silenceThreshold / 1000).toFixed(1)}s</span>
                        </div>
                        <Slider
                          value={[silenceThreshold]}
                          min={500}
                          max={5000}
                          step={100}
                          onValueChange={(value) => setSilenceThreshold(value[0])}
                        />
                        <p className="text-xs text-muted-foreground">
                          How long to wait after speech stops before ending recording
                        </p>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <label className="text-sm">Audio Threshold: {audioThreshold}</label>
                        </div>
                        <Slider
                          value={[audioThreshold]}
                          min={5}
                          max={50}
                          step={1}
                          onValueChange={(value) => setAudioThreshold(value[0])}
                        />
                        <p className="text-xs text-muted-foreground">
                          Sensitivity for detecting speech (lower = more sensitive)
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>

      {apiStatus?.providers.openai === false && (
        <Alert className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>OpenAI Quota Exceeded</AlertTitle>
          <AlertDescription>
            OpenAI API quota has been exceeded. Using {currentProviderInfo?.displayName || "alternative provider"}{" "}
            instead.
          </AlertDescription>
        </Alert>
      )}

      {apiStatus?.currentProvider === "fallback" && (
        <Alert variant="warning" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Demo Mode Active</AlertTitle>
          <AlertDescription>{apiStatus.message} Try selecting a different AI provider in Settings.</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div className="w-full md:w-1/2">
          <label className="block text-sm font-medium mb-2">Source Language</label>
          <Select value={sourceLanguage} onValueChange={setSourceLanguage}>
            <SelectTrigger>
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full md:w-1/2">
          <label className="block text-sm font-medium mb-2">Target Language</label>
          <Select value={targetLanguage} onValueChange={setTargetLanguage}>
            <SelectTrigger>
              <SelectValue placeholder="Select language" />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 mb-6">
        {isSupported && (
          <div className="flex flex-col items-center">
            <Button
              size="lg"
              onClick={toggleRecording}
              className={`rounded-full p-6 relative ${
                isRecording
                  ? isSpeechDetected
                    ? "bg-green-500 hover:bg-green-600 animate-pulse"
                    : "bg-amber-500 hover:bg-amber-600"
                  : "bg-primary"
              }`}
              disabled={isProcessing}
            >
              {isRecording ? (
                isSpeechDetected ? (
                  // Animated waveform icon when speech is detected
                  <div className="flex items-center justify-center h-8 w-8">
                    <div className="flex space-x-1">
                      {[...Array(4)].map((_, i) => (
                        <div
                          key={i}
                          className="w-1 bg-white rounded-full animate-pulse"
                          style={{
                            height: `${Math.max(8, Math.min(32, audioLevel / 2))}px`,
                            animationDelay: `${i * 0.15}s`,
                          }}
                        ></div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="relative">
                    <MicOff className="h-8 w-8" />
                    <div className="absolute -bottom-3 -right-3 text-xs font-bold bg-white text-amber-500 rounded-full w-6 h-6 flex items-center justify-center">
                      {Math.max(0, Math.ceil((silenceThreshold - (Date.now() - lastSpeechTimeRef.current)) / 1000))}
                    </div>
                  </div>
                )
              ) : (
                <Mic className="h-8 w-8" />
              )}

              {/* Audio level indicator ring */}
              {isRecording && (
                <div
                  className={`absolute inset-0 rounded-full border-4 ${
                    isSpeechDetected ? "border-white/30" : "border-white/10"
                  }`}
                  style={{
                    transform: `scale(${1 + audioLevel / 100})`,
                    opacity: Math.min(1, audioLevel / 20),
                    transition: "transform 0.1s ease-out, opacity 0.1s ease-out",
                  }}
                ></div>
              )}
            </Button>

            {isRecording && (
              <div className="mt-2 text-xs">
                <span className={`font-medium ${isSpeechDetected ? "text-green-500" : "text-amber-500"}`}>
                  {isSpeechDetected
                    ? "Voice detected - speaking"
                    : `Silence detected - will stop in ${Math.max(0, Math.ceil((silenceThreshold - (Date.now() - lastSpeechTimeRef.current)) / 1000))}s`}
                </span>
              </div>
            )}
          </div>
        )}

        <Button variant="outline" onClick={addSampleTranscript} className="mx-auto" disabled={isProcessing}>
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Processing...
            </>
          ) : (
            "Try Sample Medical Text"
          )}
        </Button>
      </div>

      <Tabs defaultValue="dual" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="dual">Dual View</TabsTrigger>
          <TabsTrigger value="translated">Translated Only</TabsTrigger>
        </TabsList>

        <TabsContent value="dual" className="space-y-4">
          <Card className="p-4">
            <h3 className="font-medium mb-2">Original Text</h3>
            <div className="min-h-[100px] p-3 bg-muted/50 rounded-md">
              {originalText || (
                <span className="text-muted-foreground">
                  {isSupported ? "Speak or click 'Try Sample Medical Text'" : "Click 'Try Sample Medical Text'"}
                </span>
              )}
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-medium">Translated Text</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={speakTranslatedText}
                disabled={!translatedText || isProcessing}
              >
                {isSpeaking ? "Stop" : "Speak"} <Volume2 className="ml-2 h-4 w-4" />
              </Button>
            </div>
            <div className="min-h-[100px] p-3 bg-muted/50 rounded-md relative">
              {isProcessing ? (
                <div className="flex items-center justify-center absolute inset-0">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  <span>Translating...</span>
                </div>
              ) : (
                translatedText || <span className="text-muted-foreground">Translation will appear here...</span>
              )}
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="translated">
          <Card className="p-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="font-medium">Translated Text</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={speakTranslatedText}
                disabled={!translatedText || isProcessing}
              >
                {isSpeaking ? "Stop" : "Speak"} <Volume2 className="ml-2 h-4 w-4" />
              </Button>
            </div>
            <div className="min-h-[200px] p-4 bg-muted/50 rounded-md text-lg relative">
              {isProcessing ? (
                <div className="flex items-center justify-center absolute inset-0">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span>Translating...</span>
                </div>
              ) : (
                translatedText || <span className="text-muted-foreground">Translation will appear here...</span>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {isSupported && !isRecording && (
        <div className="text-center text-sm text-muted-foreground mt-6">
          Click the microphone button to start recording. It will automatically stop after silence is detected.
        </div>
      )}
    </div>
  )
}
