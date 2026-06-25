"use client"

import { useEffect, useMemo, useState } from "react"
import { KeyRound, RefreshCw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getBrokerProvider } from "@/lib/integrations/factory"
import {
  getBrowserBrokerConnection,
  removeBrowserBrokerConnection,
  resetBrokerPortfolioInIndexedDb,
  saveBrowserBrokerConnection,
  syncBrokerPortfolioFromBrowserApiKey,
} from "@/lib/portfolio/browser-indexeddb"

const isSupabaseBackend = process.env.NEXT_PUBLIC_DATA_BACKEND !== "browser"

type SyncState = { kind: "idle" } | { kind: "success"; message: string } | { kind: "error"; message: string }

function formatDateTime(value: string) {
  return new Date(value).toLocaleString()
}

export function Trading212ApiSyncCard() {
  const provider = useMemo(() => getBrokerProvider("t212"), [])
  const [apiKey, setApiKey] = useState("")
  const [apiSecret, setApiSecret] = useState("")
  const [rememberKey, setRememberKey] = useState(true)
  const [hasSavedCredentials, setHasSavedCredentials] = useState(false)
  const [savedCredentialsUpdatedAt, setSavedCredentialsUpdatedAt] = useState<string | null>(null)
  const [syncState, setSyncState] = useState<SyncState>({ kind: "idle" })
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    let isMounted = true

    async function loadConnection() {
      try {
        // Check browser-stored credentials
        const connection = await getBrowserBrokerConnection("t212")
        if (!isMounted) return

        if (connection?.apiKey && connection?.apiSecret) {
          setHasSavedCredentials(true)
          setSavedCredentialsUpdatedAt(connection.updatedAt ?? null)
          return
        }

        // If supabase mode, fetch from server and save locally
        if (isSupabaseBackend) {
          const res = await fetch("/api/credentials")
          if (!isMounted) return
          const data = await res.json()
          if (data?.credentials?.t212?.apiKey && data?.credentials?.t212?.apiSecret) {
            // Save to local IndexedDB so sync works on this device
            await saveBrowserBrokerConnection("t212", {
              apiKey: data.credentials.t212.apiKey,
              apiSecret: data.credentials.t212.apiSecret,
            })
            setHasSavedCredentials(true)
            setSavedCredentialsUpdatedAt(null)
          }
        }
      } catch (error) {
        if (!isMounted) return
        setSyncState({
          kind: "error",
          message: error instanceof Error ? error.message : "Failed to load Trading 212 credentials.",
        })
      }
    }

    void loadConnection()

    return () => { isMounted = false }
  }, [])

  async function handleSync() {
    if (!provider?.supportsLiveApi) {
      setSyncState({ kind: "error", message: "Trading 212 API sync is not available in this build." })
      return
    }

    try {
      setIsSyncing(true)

      const trimmedApiKey = apiKey.trim()
      const trimmedApiSecret = apiSecret.trim()
      const savedConnection = (!trimmedApiKey || !trimmedApiSecret) ? await getBrowserBrokerConnection("t212") : null
      const credentialsToUse = {
        apiKey: trimmedApiKey || savedConnection?.apiKey || "",
        apiSecret: trimmedApiSecret || savedConnection?.apiSecret || "",
      }

      if (!credentialsToUse.apiKey || !credentialsToUse.apiSecret) {
        setSyncState({ kind: "error", message: "Enter both the Trading 212 API key and API secret, or use credentials already stored." })
        return
      }

      const importedPositions = await syncBrokerPortfolioFromBrowserApiKey("t212", credentialsToUse)


      if (rememberKey) {
        await saveBrowserBrokerConnection("t212", credentialsToUse)
        // Also save to Supabase if in supabase mode (for cron/push)
        if (isSupabaseBackend) {
          const saveResponse = await fetch("/api/credentials", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ broker: "t212", apiKey: credentialsToUse.apiKey, apiSecret: credentialsToUse.apiSecret }),
          })
          const saveData = await saveResponse.json().catch(() => null) as { message?: string } | null
          if (!saveResponse.ok) {
            throw new Error(saveData?.message ?? "Failed to save Trading 212 credentials to the server.")
          }
        }
        setHasSavedCredentials(true)
        setSavedCredentialsUpdatedAt(new Date().toISOString())
      }

      setApiKey("")
      setApiSecret("")
      setSyncState({
        kind: "success",
        message:
          importedPositions.length === 0
            ? "Trading 212 API sync succeeded, but there are no open holdings right now."
            : `Fetched ${importedPositions.length} Trading 212 holding${importedPositions.length === 1 ? "" : "s"} from the API.`,
      })
    } catch (error) {
      setSyncState({
        kind: "error",
        message: error instanceof Error ? error.message : "Trading 212 API sync failed.",
      })
    } finally {
      setIsSyncing(false)
    }
  }

  async function handleRemoveSavedKey() {
    try {
      setIsSyncing(true)
      await removeBrowserBrokerConnection("t212")
      if (isSupabaseBackend) {
        await fetch("/api/credentials", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ broker: "t212" }),
        }).catch(() => {})
      }
      setHasSavedCredentials(false)
      setSavedCredentialsUpdatedAt(null)
      setApiKey("")
      setApiSecret("")
      setSyncState({ kind: "success", message: "Trading 212 API credentials removed." })
    } catch (error) {
      setSyncState({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to remove Trading 212 credentials.",
      })
    } finally {
      setIsSyncing(false)
    }
  }

  async function handleRemoveHoldings() {
    try {
      setIsSyncing(true)
      await resetBrokerPortfolioInIndexedDb("t212")
      setSyncState({
        kind: "success",
        message: "Trading 212 holdings removed from browser storage. Saved API credentials remain unless you remove them separately.",
      })
    } catch (error) {
      setSyncState({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to remove Trading 212 holdings.",
      })
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <Card className="border-white/10">
      <CardHeader>
        <CardTitle>Trading 212 live sync</CardTitle>
        <CardDescription>
          Connect Trading 212 and load current holdings. {isSupabaseBackend ? "Keys are also saved server-side for background alerts." : "Keys are stored only in this browser."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <div className="space-y-2">
          <p>Trading 212 requires both the API key and API secret.</p>
        </div>

        <label className="block space-y-2">
          <span className="font-medium text-foreground">Trading 212 API key</span>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => {
              setApiKey(event.target.value)
              setSyncState({ kind: "idle" })
            }}
            placeholder={hasSavedCredentials ? "Leave blank to use saved key" : "Paste your Trading 212 API key"}
            autoComplete="off"
            spellCheck={false}
            className="block w-full rounded-2xl border border-white/10 bg-background/45 px-3 py-3"
          />
        </label>

        <label className="block space-y-2">
          <span className="font-medium text-foreground">Trading 212 API secret</span>
          <input
            type="password"
            value={apiSecret}
            onChange={(event) => {
              setApiSecret(event.target.value)
              setSyncState({ kind: "idle" })
            }}
            placeholder={hasSavedCredentials ? "Leave blank to use saved secret" : "Paste your Trading 212 API secret"}
            autoComplete="off"
            spellCheck={false}
            className="block w-full rounded-2xl border border-white/10 bg-background/45 px-3 py-3"
          />
        </label>

        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={rememberKey} onChange={(event) => setRememberKey(event.target.checked)} />
          Remember credentials{isSupabaseBackend ? " (saved locally + server for push alerts)" : " in this browser"}
        </label>

        {hasSavedCredentials ? (
          <p className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-2 text-xs">
            ✓ Credentials saved{savedCredentialsUpdatedAt ? ` • Updated ${formatDateTime(savedCredentialsUpdatedAt)}` : ""}
          </p>
        ) : null}

        {syncState.kind !== "idle" ? (
          <p className={syncState.kind === "error" ? "text-sm text-destructive" : "text-sm text-emerald-400"}>{syncState.message}</p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void handleSync()} disabled={isSyncing || (!(apiKey.trim() && apiSecret.trim()) && !hasSavedCredentials)} className="gap-2 rounded-xl">
            <RefreshCw className={isSyncing ? "size-4 animate-spin" : "size-4"} />
            {isSyncing ? "Syncing..." : hasSavedCredentials && !apiKey.trim() && !apiSecret.trim() ? "Sync using saved credentials" : "Sync Trading 212 now"}
          </Button>
          <Button variant="outline" onClick={() => void handleRemoveSavedKey()} disabled={isSyncing || !hasSavedCredentials} className="gap-2 rounded-xl border-white/10 bg-white/[0.03]">
            <KeyRound className="size-4" />
            Remove credentials
          </Button>
          <Button variant="outline" onClick={() => void handleRemoveHoldings()} disabled={isSyncing} className="gap-2 rounded-xl border-white/10 bg-white/[0.03]">
            <Trash2 className="size-4" />
            Remove holdings
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
