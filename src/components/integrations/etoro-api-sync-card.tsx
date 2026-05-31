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

const isBrowserBackend = process.env.NEXT_PUBLIC_DATA_BACKEND === "browser"

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

        if (!isMounted) {
          return
        }

        setHasSavedCredentials(Boolean(connection?.apiKey && connection?.apiSecret))
        setSavedCredentialsUpdatedAt(connection?.updatedAt ?? null)
      } catch (error) {
        if (!isMounted) {
          return
        }

        setSyncState({
          kind: "error",
          message: error instanceof Error ? error.message : "Failed to load the locally stored eToro API credentials.",
        })
      }
    }

    if (isBrowserBackend) {
      void loadConnection()
    }

    return () => {
      isMounted = false
    }
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
      const apiKeyToUse = trimmedApiKey || savedConnection?.apiKey || ""
      const apiSecretToUse = trimmedApiSecret || savedConnection?.apiSecret || ""

      if (!apiKeyToUse || !apiSecretToUse) {
        setSyncState({ kind: "error", message: "Enter both the eToro API key and user key, or use credentials already stored in this browser." })
        return
      }

      const importedPositions = await syncBrokerPortfolioFromBrowserApiKey("etoro", {
        apiKey: apiKeyToUse,
        apiSecret: apiSecretToUse,
      })

      if (rememberKey) {
        await saveBrowserBrokerConnection("etoro", { apiKey: apiKeyToUse, apiSecret: apiSecretToUse })
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
            : `Fetched ${importedPositions.length} eToro holding${importedPositions.length === 1 ? "" : "s"} from the API and replaced only the eToro slice of the browser portfolio.`,
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
      setHasSavedCredentials(false)
      setSavedCredentialsUpdatedAt(null)
      setApiKey("")
      setApiSecret("")
      setSyncState({ kind: "success", message: "The locally stored eToro API key and user key were removed from this browser." })
    } catch (error) {
      setSyncState({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to remove the stored eToro API credentials.",
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
        message: "eToro holdings were removed from browser storage. Saved API credentials stay in this browser unless you remove them separately.",
      })
    } catch (error) {
      setSyncState({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to remove eToro holdings from browser storage.",
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
          Connect eToro with an API key and user key, then load current holdings into this browser.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <div className="space-y-2">
          <p>eToro requires both an API key and a user key.</p>
          <p>If you choose to remember them, the key pair is stored only in this browser so manual dashboard refreshes can re-sync while the app is open.</p>
        </div>

        {!isBrowserBackend ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-3">
            Switch `NEXT_PUBLIC_DATA_BACKEND` to `browser` to use the local eToro connection flow.
          </div>
        ) : (
          <>
            <label className="block space-y-2">
              <span className="font-medium text-foreground">eToro API key</span>
              <input
                type="password"
                value={apiKey}
                onChange={(event) => {
                  setApiKey(event.target.value)
                  setSyncState({ kind: "idle" })
                }}
                placeholder={hasSavedCredentials ? "Leave blank to use the saved API key in this browser" : "Paste your eToro API key"}
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
                placeholder={hasSavedCredentials ? "Leave blank to use the saved user key in this browser" : "Paste your eToro user key"}
                autoComplete="off"
                spellCheck={false}
                className="block w-full rounded-2xl border border-white/10 bg-background/45 px-3 py-3"
              />
            </label>

            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={rememberKey} onChange={(event) => setRememberKey(event.target.checked)} />
              Remember this eToro API key and user key only in this browser so manual dashboard refresh can re-sync it later.
            </label>

            {hasSavedCredentials ? (
              <p className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-2 text-xs">
                Saved in this browser{savedCredentialsUpdatedAt ? ` • Updated ${formatDateTime(savedCredentialsUpdatedAt)}` : ""}
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
                Remove saved API credentials
              </Button>
              <Button variant="outline" onClick={() => void handleRemoveHoldings()} disabled={isSyncing} className="gap-2 rounded-xl border-white/10 bg-white/[0.03]">
                <Trash2 className="size-4" />
                Remove eToro holdings
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

