import Link from "next/link"
import { CheckCircle2, KeyRound, RefreshCw } from "lucide-react"
import { PageHeader, PageShell } from "@/components/app/page-shell"
import { Badge } from "@/components/ui/badge"
import { EtoroApiSyncCard } from "@/components/integrations/etoro-api-sync-card"
import { SyncStatusCard } from "@/components/integrations/sync-status-card"
import { Trading212ApiSyncCard } from "@/components/integrations/trading212-api-sync-card"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function IntegrationsPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Integrations"
        title="Broker connections"
        description="Manage how positions enter StockSync. Trading 212 and eToro now live in the same API-first broker connection flow."
        badges={(
          <>
            <Badge variant="outline">Trading 212 live sync</Badge>
            <Badge variant="outline">eToro live sync</Badge>
            <Badge variant="outline">API-first shell</Badge>
          </>
        )}
      />

      <section className="grid gap-4 xl:grid-cols-[1.55fr_0.9fr]">
        <div className="space-y-4">
          <Card className="border-white/10 bg-[linear-gradient(145deg,rgba(16,185,129,0.06),rgba(59,130,246,0.05),transparent_70%)]">
            <CardHeader>
              <CardTitle>Current broker flow</CardTitle>
              <CardDescription>
                Keep the broker surface simple: connect each broker through its API and let every sync replace only that broker’s slice of the local portfolio.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <RefreshCw className="size-5 text-primary" />
                <p className="mt-3 text-base font-semibold">Trading 212 live</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Use the API key plus secret flow for the fastest in-browser refresh.</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <KeyRound className="size-5 text-primary" />
                <p className="mt-3 text-base font-semibold">Browser-saved keys</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Optionally remember credentials locally so dashboard refresh can pull newer positions while the app stays open.</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                <CheckCircle2 className="size-5 text-primary" />
                <p className="mt-3 text-base font-semibold">Broker isolation</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Each sync updates one broker without overwriting the rest of the portfolio.</p>
              </div>
            </CardContent>
          </Card>

          <section className="space-y-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-semibold tracking-tight">Trading 212</h2>
                <Badge variant="outline">Primary flow</Badge>
              </div>
              <p className="text-sm text-muted-foreground">Connect via API for live refresh and keep Trading 212 inside the shared product shell.</p>
            </div>
            <div className="grid gap-4">
              <Trading212ApiSyncCard />
            </div>
          </section>

          <section className="space-y-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-semibold tracking-tight">eToro</h2>
                <Badge variant="outline">Now API-based</Badge>
              </div>
              <p className="text-sm text-muted-foreground">eToro is now connected through the same API-first pattern as Trading 212.</p>
            </div>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_320px]">
              <EtoroApiSyncCard />
              <Card className="border-white/10">
                <CardHeader>
                  <CardTitle>What’s included now</CardTitle>
                  <CardDescription>The eToro connection now follows the same clean broker model.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>• eToro sync replaces only the eToro slice in browser storage.</p>
                  <p>• The dashboard immediately folds synced eToro positions into the same table and charts.</p>
                  <p>• The same API key can also back the server-side flow where supported.</p>
                </CardContent>
              </Card>
            </div>
          </section>
        </div>

        <div className="space-y-4">
          <SyncStatusCard />
          <Card className="border-white/10">
            <CardHeader>
              <CardTitle>Quick links</CardTitle>
              <CardDescription>Move between integrations, the dashboard, and environment checks.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Link href="/dashboard" className="block font-medium text-primary transition-colors hover:text-primary/80">
                Return to dashboard
              </Link>
              <Link href="/settings" className="block font-medium text-primary transition-colors hover:text-primary/80">
                Open settings
              </Link>
            </CardContent>
          </Card>
        </div>
      </section>
    </PageShell>
  )
}

