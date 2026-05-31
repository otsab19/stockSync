import Link from "next/link"
import { PageHeader, PageShell } from "@/components/app/page-shell"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { NotificationToggle } from "@/components/notifications/notification-toggle"

const selectedBackend = process.env.NEXT_PUBLIC_DATA_BACKEND === "browser" ? "Browser local" : "Supabase"

const settingsItems = [
  {
    name: "Data backend",
    value: selectedBackend,
    description: "Choose where portfolio data is loaded from.",
  },
  {
    name: "Supabase",
    value:
      selectedBackend === "Browser local"
        ? "Not required in browser mode"
        : process.env.NEXT_PUBLIC_SUPABASE_URL
          ? "Configured"
          : "Missing env vars",
    description: "Used only for the server-backed mode.",
  },
  {
    name: "Cron secret",
    value:
      selectedBackend === "Browser local"
        ? "Not used in browser mode"
        : process.env.CRON_SECRET
          ? "Configured"
          : "Missing env var",
    description: "Used only for the server-backed alert job.",
  },
  {
    name: "Periodic sync scaffold",
    value: selectedBackend === "Browser local" ? "Disabled in browser mode" : "Available via /api/sync/status",
    description: "Reserved for server-backed scheduled sync.",
  },
  {
    name: "Web push",
    value:
      selectedBackend === "Browser local"
        ? "Background push unavailable in browser-only mode"
        : process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
          ? "Configured"
          : "Missing VAPID keys",
    description: "Needed only for background notifications in server-backed mode.",
  },
]

export default function SettingsPage() {
  return (
    <PageShell>
      <PageHeader
        eyebrow="Settings"
        title="Environment and delivery"
        description="See which backend is active, what infrastructure is configured, and whether this app shell can support live sync and background notifications."
        badges={(
          <>
            <Badge variant="outline">Backend: {selectedBackend}</Badge>
            <Badge variant="outline">Operations visibility</Badge>
          </>
        )}
      />

      <section className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card className="border-white/10 bg-[linear-gradient(145deg,rgba(16,185,129,0.06),rgba(59,130,246,0.05),transparent_72%)]">
          <CardHeader>
            <CardTitle>Current setup</CardTitle>
            <CardDescription>
              Browser mode keeps everything local and manual. Supabase mode unlocks the server-owned foundation for sync, alerts, and background delivery.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Selected backend</p>
              <p className="mt-2 text-lg font-semibold">{selectedBackend}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">The whole app shell reflects this data mode, including integrations and refresh behavior.</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Next stop</p>
              <p className="mt-2 text-lg font-semibold">Broker connections</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Use the integrations page to manage Trading 212 and the restored eToro import flow.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10">
          <CardHeader>
            <CardTitle>Quick links</CardTitle>
            <CardDescription>Jump back into the main product surfaces.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Link href="/dashboard" className="block font-medium text-primary transition-colors hover:text-primary/80">
              Open dashboard
            </Link>
            <Link href="/integrations" className="block font-medium text-primary transition-colors hover:text-primary/80">
              Open broker connections
            </Link>
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-white/10">
          <CardHeader>
            <CardTitle>Push notifications</CardTitle>
            <CardDescription>
              Get alerted when any position crosses ±£25 P&L. Requires Supabase backend and VAPID keys.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NotificationToggle />
          </CardContent>
        </Card>
        {settingsItems.map((item) => (
          <Card key={item.name} className="border-white/10">
            <CardHeader>
              <CardTitle>{item.name}</CardTitle>
              <CardDescription>{item.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm font-medium">{item.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </PageShell>
  )
}

