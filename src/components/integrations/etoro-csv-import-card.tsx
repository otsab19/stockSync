"use client"

import { useMemo, useState } from "react"
import { RotateCcw, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getBrokerProvider } from "@/lib/integrations/factory"
import { replaceBrokerPortfolioInIndexedDb, resetBrokerPortfolioInIndexedDb } from "@/lib/portfolio/browser-indexeddb"

const isBrowserBackend = process.env.NEXT_PUBLIC_DATA_BACKEND === "browser"

type ImportState =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }

export function EtoroCsvImportCard() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [importState, setImportState] = useState<ImportState>({ kind: "idle" })
  const [isImporting, setIsImporting] = useState(false)

  const provider = useMemo(() => getBrokerProvider("etoro"), [])

  async function handleImport() {
    if (!selectedFile) {
      setImportState({ kind: "error", message: "Choose an eToro CSV file before importing." })
      return
    }

    if (!provider?.supportsCsvImport || !provider.importFromCsv) {
      setImportState({ kind: "error", message: "eToro CSV import is not available in this build." })
      return
    }

    try {
      setIsImporting(true)
      const csvText = await selectedFile.text()
      const importedPositions = await provider.importFromCsv(csvText)

      await replaceBrokerPortfolioInIndexedDb("etoro", importedPositions, [], {
        broker: "etoro",
        sourceKind: "csv_import",
        fileName: selectedFile.name,
        lastSyncedAt: new Date().toISOString(),
        syncMode: "manual",
      })

      setImportState({
        kind: "success",
        message:
          importedPositions.length === 0
            ? "The CSV was parsed, but there are no open holdings left after the imported eToro history."
            : `Imported ${importedPositions.length} open eToro holding${importedPositions.length === 1 ? "" : "s"}. Existing eToro holdings were replaced, while other brokers remain untouched.`,
      })
    } catch (error) {
      setImportState({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to import the selected eToro CSV file.",
      })
    } finally {
      setIsImporting(false)
    }
  }

  async function handleReset() {
    try {
      setIsImporting(true)
      await resetBrokerPortfolioInIndexedDb("etoro")
      setSelectedFile(null)
      setImportState({
        kind: "success",
        message: "eToro holdings were removed from browser storage. If no imported brokers remain, the app falls back to the bundled sample portfolio.",
      })
    } catch (error) {
      setImportState({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to reset browser portfolio storage.",
      })
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle>eToro CSV import</CardTitle>
        <CardDescription>
          Upload an eToro account statement or holdings-style CSV and replace only the eToro slice of the browser-local portfolio.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <div className="space-y-2">
          <p>Supported columns include common eToro export fields such as action/type, ticker or instrument, units/quantity, open rate, currency, and optional current market price.</p>
          <p>If the file includes a current market-price column, the imported holdings use it. Otherwise, live price falls back to average cost until a quote source is added.</p>
          <p>This is the minimal eToro path for now: manual in-app import first, direct API sync later.</p>
          <p>
            You can test the importer with the bundled example file at{" "}
            <a className="underline underline-offset-4 hover:text-foreground" href="/examples/etoro-account-statement.csv">
              `/examples/etoro-account-statement.csv`
            </a>
            .
          </p>
        </div>

        {!isBrowserBackend ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/40 px-4 py-3">
            CSV import currently writes to browser-local IndexedDB, so switch `NEXT_PUBLIC_DATA_BACKEND` to `browser` for this implementation slice.
          </div>
        ) : (
          <>
            <label className="block space-y-2">
              <span className="font-medium text-foreground">CSV file</span>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  setSelectedFile(event.target.files?.[0] ?? null)
                  setImportState({ kind: "idle" })
                }}
                className="block w-full rounded-xl border border-border bg-background/45 px-3 py-3"
              />
            </label>

            {selectedFile ? (
              <p className="rounded-xl border border-dashed border-border bg-muted/40 px-3 py-2 text-xs">
                Ready to import: <span className="font-medium text-foreground">{selectedFile.name}</span>
              </p>
            ) : null}

            {importState.kind !== "idle" ? (
              <p className={importState.kind === "error" ? "text-sm text-destructive" : "text-sm text-emerald-400"}>
                {importState.message}
              </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleImport} disabled={!selectedFile || isImporting} className="gap-2 rounded-xl">
                <Upload className="size-4" />
                {isImporting ? "Importing..." : "Import eToro CSV"}
              </Button>
              <Button variant="outline" onClick={handleReset} disabled={isImporting} className="gap-2 rounded-xl border-border bg-muted/40">
                <RotateCcw className="size-4" />
                Clear eToro holdings
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

