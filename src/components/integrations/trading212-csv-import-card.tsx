"use client"

import { useMemo, useState } from "react"
import { Upload, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { getBrokerProvider } from "@/lib/integrations/factory"
import { replaceBrokerPortfolioInIndexedDb, resetBrokerPortfolioInIndexedDb } from "@/lib/portfolio/browser-indexeddb"

const isBrowserBackend = process.env.NEXT_PUBLIC_DATA_BACKEND === "browser"

type ImportState =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }

export function Trading212CsvImportCard() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [importState, setImportState] = useState<ImportState>({ kind: "idle" })
  const [isImporting, setIsImporting] = useState(false)

  const provider = useMemo(() => getBrokerProvider("t212"), [])

  async function handleImport() {
    if (!selectedFile) {
      setImportState({ kind: "error", message: "Choose a Trading 212 CSV file before importing." })
      return
    }

    if (!provider?.supportsCsvImport || !provider.importFromCsv) {
      setImportState({ kind: "error", message: "Trading 212 CSV import is not available in this build." })
      return
    }

    try {
      setIsImporting(true)
      const csvText = await selectedFile.text()
      const importedPositions = await provider.importFromCsv(csvText)

      await replaceBrokerPortfolioInIndexedDb("t212", importedPositions, [], {
        broker: "t212",
        sourceKind: "csv_import",
        fileName: selectedFile.name,
        lastSyncedAt: new Date().toISOString(),
        syncMode: "manual",
      })

      setImportState({
        kind: "success",
        message:
          importedPositions.length === 0
            ? "The CSV was parsed, but there are no open Trading 212 holdings left after the imported transaction history."
            : `Imported ${importedPositions.length} open Trading 212 holding${importedPositions.length === 1 ? "" : "s"}. Existing Trading 212 holdings were replaced, while other brokers remain untouched.`,
      })
    } catch (error) {
      setImportState({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to import the selected CSV file.",
      })
    } finally {
      setIsImporting(false)
    }
  }

  async function handleReset() {
    try {
      setIsImporting(true)
      await resetBrokerPortfolioInIndexedDb("t212")
      setSelectedFile(null)
      setImportState({
        kind: "success",
        message: "Trading 212 holdings were removed from browser storage. If no imported brokers remain, the app falls back to the bundled sample portfolio.",
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
    <Card className="border-white/10">
      <CardHeader>
        <CardTitle>Trading 212 CSV import</CardTitle>
        <CardDescription>
          Upload a Trading 212 CSV and replace only the Trading 212 holdings in this browser.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <div className="space-y-2">
          <p>Use this when you want to load holdings from an export instead of the API connection.</p>
          <p>
            Example file:{" "}
            <a className="underline underline-offset-4 hover:text-foreground" href="/examples/trading212-transactions.csv">
              `/examples/trading212-transactions.csv`
            </a>
            .
          </p>
        </div>

        {!isBrowserBackend ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-3">
            Switch `NEXT_PUBLIC_DATA_BACKEND` to `browser` to import Trading 212 CSV files locally.
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
                className="block w-full rounded-2xl border border-white/10 bg-background/45 px-3 py-3"
              />
            </label>

            {selectedFile ? (
              <p className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-2 text-xs">
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
                {isImporting ? "Importing..." : "Import Trading 212 CSV"}
              </Button>
              <Button variant="outline" onClick={handleReset} disabled={isImporting} className="gap-2 rounded-xl border-white/10 bg-white/[0.03]">
                <RotateCcw className="size-4" />
                Clear Trading 212 holdings
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

