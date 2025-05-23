"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"
import { setAIProvider } from "@/lib/ai-service"

interface ProviderSelectorProps {
  currentProvider: string
  providers: Record<string, boolean>
  onProviderChange: (provider: string) => void
}

export function ProviderSelector({ currentProvider, providers, onProviderChange }: ProviderSelectorProps) {
  const [isChanging, setIsChanging] = useState(false)
  const [selected, setSelected] = useState(currentProvider)

  const handleChange = async () => {
    if (selected === currentProvider) return

    setIsChanging(true)
    try {
      const success = await setAIProvider(selected as any)
      if (success) {
        onProviderChange(selected)
      }
    } catch (error) {
      console.error("Error changing provider:", error)
    } finally {
      setIsChanging(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Provider Settings</CardTitle>
        <CardDescription>Select which AI provider to use for transcription enhancement and translation</CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup value={selected} onValueChange={setSelected}>
          <div className="flex items-center space-x-2 mb-3">
            <RadioGroupItem value="openai" id="openai" disabled={!providers.openai || isChanging} />
            <Label htmlFor="openai" className={!providers.openai ? "text-muted-foreground" : ""}>
              OpenAI (GPT-4o)
              {!providers.openai && <span className="ml-2 text-sm text-destructive">(quota exceeded)</span>}
            </Label>
          </div>

          <div className="flex items-center space-x-2 mb-3">
            <RadioGroupItem value="groq" id="groq" disabled={!providers.groq || isChanging} />
            <Label htmlFor="groq" className={!providers.groq ? "text-muted-foreground" : ""}>
              Groq (Llama 3.1)
              {!providers.groq && <span className="ml-2 text-sm text-destructive">(unavailable)</span>}
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <RadioGroupItem value="fallback" id="fallback" disabled={isChanging} />
            <Label htmlFor="fallback">
              Fallback (Demo Mode)
              <span className="ml-2 text-xs text-muted-foreground">(always available)</span>
            </Label>
          </div>
        </RadioGroup>
      </CardContent>
      <CardFooter>
        <Button onClick={handleChange} disabled={selected === currentProvider || isChanging}>
          {isChanging ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Changing...
            </>
          ) : (
            "Change Provider"
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}
