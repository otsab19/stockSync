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

export function EtoroApiSyncCard() {
  const provider = useMemo(() => getBrokerProvider("etoro"), [])
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
        const connection = await getBrowserBrokerConnection("etoro")
        if (!isMounted) return

        if (connection?.apiKey && connection?.apiSecret) {
          setHasSavedCredentials(true)
          setSavedCredentialsUpdatedAt(connection.updatedAt ?? null)
          return
        }

        if (isSupabaseBackend) {
          const res = await fetch("/api/credentials")
          if (!isMounted) return
          const data = await res.json()
          if (data?.credentials?.etoro?.hasKey) {
            setHasSavedCredentials(true)
            setSavedCredentialsUpdatedAt(null)
          }
        }
      } catch (error) {
        if (!isMounted) return
        setSyncState({
          kind: "error",
          message: error instanceof Error ? error.message : "Failed to load eToro credentials.",
        })
      }
    }

    void loadConnection()

    return () => { isMounted = false }
  }, [])

  async function handleSync() {
    if (!provider?.supportsLiveApi) {
      setSyncState({ kind: "error", message: "eToro API sync is not available in this build." })
      return
    }

    try {
      setIsSyncing(true)

      const trimmedApiKey = apiKey.trim()
      const trimmedApiSecret = apiSecret.trim()
      const savedConnection = (!trimmedApiKey || !trimmedApiSecret) ? await getBrowserBrokerConnection("etoro") : null
      const credentialsToUse = {
        apiKey: trimmedApiKey || savedConnection?.apiKey || "",
        apiSecret: trimmedApiSecret || savedConnection?.apiSecret || "",
      }

      if (!credentialsToUse.apiKey || !credentialsToUse.apiSecret) {
        setSyncState({ kind: "error", message: "Enter both the eToro API key and user key, or use credentials already stored." })
        return
      }

      const importedPositions = await syncBrokerPortfolioFromBrowserApiKey("etoro", credentialsToUse)

      if (rememberKey) {
        await saveBrowserBrokerConnection("etoro", credentialsToUse)
        if (isSupabaseBackend) {
          await fetch("/api/credentials", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ broker: "etoro", apiKey: credentialsToUse.apiKey, apiSecret: credentialsToUse.apiSecret }),
          }).catch(() => {})
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
            ? "eToro API sync succeeded, but there are no open holdings right now."
            : `Fetched ${importedPositions.length} eToro holding${importedPositions.length === 1 ? "" : "s"} from the API.`,
      })
    } catch (error) {
      setSyncState({
        kind: "error",
        message: error instanceof Error ? error.message : "eToro API sync failed.",
      })
    } finally {
      setIsSyncing(false)
    }
  }

  async function handleRemoveSavedKey() {
    try {
      setIsSyncing(true)
      await removeBrowserBrokerConnection("etoro")
      if (isSupabaseBackend) {
        await fetch("/api/credentials", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ broker: "etoro" }),
        }).catch(() => {})
      }
      setHasSavedCredentials(false)
      setSavedCredentialsUpdatedAt(null)
      setApiKey("")
      setApiSecret("")
      setSyncState({ kind: "success", message: "eToro API credentials removed." })
    } catch (error) {
      setSyncState({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to remove eToro credentials.",
      })
    } finally {
      setIsSyncing(false)
    }
  }

  async function handleRemoveHoldings() {
    try {
      setIsSyncing(true)
      await resetBrokerPortfolioInIndexedDb("etoro")
      setSyncState({
        kind: "success",
        message: "eToro holdings removed from browser storage. Saved API credentials remain unless you remove them separately.",
      })
    } catch (error) {
      setSyncState({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to remove eToro holdings.",
      })
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <Card className="border-white/10">
      <CardHeader>
        <CardTitle>eToro live sync</CardTitle>
        <CardDescription>
          Connect eToro with API key and user key. {isSupabaseBackend ? "Keys are also saved server-side for background alerts." : "Keys are stored only in this browser."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <div className="space-y-2">
          <p>eToro requires both an API key and a user key.</p>
        </div>

        <label className="block space-y-2">
          <span className="font-medium text-foreground">eToro API key</span>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => {
              setApiKey(event.target.value)
              setSyncState({ kind: "idle" })
            }}
            placeholder={hasSavedCredentials ? "Leave blank to use saved key" : "Paste your eToro API key"}
            autoComplete="off"
            spellCheck={false}
            className="block w-full rounded-2xl border border-white/10 bg-background/45 px-3 py-3"
          />
        </label>

        <label className="block space-y-2">
          <span className="font-medium text-foreground">eToro user key</span>
          <input
            type="password"
            value={apiSecret}
            onChange={(event) => {
              setApiSecret(event.target.value)
              setSyncState({ kind: "idle" })
            }}
            placeholder={hasSavedCredentials ? "Leave blank to use saved user key" : "Paste your eToro user key"}
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
            {isSyncing ? "Syncing..." : hasSavedCredentials && !apiKey.trim() && !apiSecret.trim() ? "Sync using saved credentials" : "Sync eToro now"}
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

