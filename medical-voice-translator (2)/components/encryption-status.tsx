"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Shield, ShieldCheck, ShieldX, Key, AlertTriangle } from "lucide-react"
import { CryptoService } from "@/lib/crypto-service"

interface EncryptionStatusProps {
  onEncryptionChange: (enabled: boolean, keyId: string | null) => void
}

export function EncryptionStatus({ onEncryptionChange }: EncryptionStatusProps) {
  const [isSupported, setIsSupported] = useState(false)
  const [isEnabled, setIsEnabled] = useState(false)
  const [keyId, setKeyId] = useState<string | null>(null)
  const [isInitializing, setIsInitializing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cryptoService = CryptoService.getInstance()

  useEffect(() => {
    // Check if Web Crypto API is supported
    setIsSupported(CryptoService.isSupported())

    // Check if already initialized
    if (cryptoService.isInitialized()) {
      setIsEnabled(true)
      setKeyId(cryptoService.getKeyId())
    }
  }, [cryptoService])

  const enableEncryption = async () => {
    if (!isSupported) {
      setError("Encryption is not supported in this browser")
      return
    }

    setIsInitializing(true)
    setError(null)

    try {
      const newKeyId = await cryptoService.initialize()
      setIsEnabled(true)
      setKeyId(newKeyId)
      onEncryptionChange(true, newKeyId)
    } catch (err) {
      setError("Failed to initialize encryption")
      console.error("Encryption initialization error:", err)
    } finally {
      setIsInitializing(false)
    }
  }

  const disableEncryption = () => {
    cryptoService.clearKeys()
    setIsEnabled(false)
    setKeyId(null)
    onEncryptionChange(false, null)
  }

  const getStatusIcon = () => {
    if (!isSupported) return <ShieldX className="h-4 w-4 text-destructive" />
    if (isEnabled) return <ShieldCheck className="h-4 w-4 text-green-600" />
    return <Shield className="h-4 w-4 text-muted-foreground" />
  }

  const getStatusText = () => {
    if (!isSupported) return "Not Supported"
    if (isEnabled) return "Active"
    return "Disabled"
  }

  const getStatusVariant = (): "default" | "secondary" | "destructive" | "outline" => {
    if (!isSupported) return "destructive"
    if (isEnabled) return "default"
    return "secondary"
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {getStatusIcon()}
          End-to-End Encryption
        </CardTitle>
        <CardDescription>Protect sensitive medical data with client-side encryption</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Status:</span>
          <Badge variant={getStatusVariant()}>{getStatusText()}</Badge>
        </div>

        {keyId && (
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Key ID:</span>
            <div className="flex items-center gap-2">
              <Key className="h-3 w-3" />
              <code className="text-xs bg-muted px-2 py-1 rounded">{keyId.substring(0, 8)}...</code>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}

        {!isSupported && (
          <div className="text-sm text-muted-foreground">
            Your browser does not support the Web Crypto API required for encryption. Please use a modern browser like
            Chrome, Firefox, or Safari.
          </div>
        )}

        <div className="flex gap-2">
          {!isEnabled ? (
            <Button onClick={enableEncryption} disabled={!isSupported || isInitializing} className="flex-1">
              {isInitializing ? "Initializing..." : "Enable Encryption"}
            </Button>
          ) : (
            <Button onClick={disableEncryption} variant="outline" className="flex-1">
              Disable Encryption
            </Button>
          )}
        </div>

        <div className="text-xs text-muted-foreground">
          When enabled, all voice transcripts and translations are encrypted before processing. Encryption keys are
          generated locally and never leave your device.
        </div>
      </CardContent>
    </Card>
  )
}
