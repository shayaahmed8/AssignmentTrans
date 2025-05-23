import { Suspense } from "react"
import VoiceTranslator from "@/components/voice-translator"
import { Loader2 } from "lucide-react"

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center p-4 md:p-24">
      <div className="w-full max-w-3xl mx-auto">
        <h1 className="text-2xl md:text-4xl font-bold text-center mb-2">Medical Voice Translator</h1>
        <p className="text-center text-muted-foreground mb-8">
          Speak in any language and get accurate medical translations in real-time
        </p>

        <Suspense
          fallback={
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2">Loading translator...</span>
            </div>
          }
        >
          <VoiceTranslator />
        </Suspense>
      </div>
    </main>
  )
}
