import { PageShell } from "@/components/app/page-shell"
import { EtoroApiSyncCard } from "@/components/integrations/etoro-api-sync-card"
import { Trading212ApiSyncCard } from "@/components/integrations/trading212-api-sync-card"

export default function IntegrationsPage() {
  return (
    <PageShell>
      <div className="space-y-2 px-1">
        <h1 className="text-2xl font-bold tracking-tight">Broker connections</h1>
        <p className="text-sm text-muted-foreground">Add your API keys to sync positions from Trading 212 and eToro.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Trading212ApiSyncCard />
        <EtoroApiSyncCard />
      </div>
    </PageShell>
  )
}
