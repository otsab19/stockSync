import Link from "next/link"
import { PageShell } from "@/components/app/page-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { NotificationToggle } from "@/components/notifications/notification-toggle"

const selectedBackend = process.env.NEXT_PUBLIC_DATA_BACKEND === "browser" ? "Browser" : "Supabase"
const supabaseOk = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)
const vapidOk = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
const cronOk = Boolean(process.env.CRON_SECRET)

export default function SettingsPage() {
  return (
    <PageShell>
      <div className="space-y-2 px-1">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">App configuration and notifications.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Push notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <NotificationToggle />
          </CardContent>
        </Card>

        <Card className="border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Backend</span><span className="font-medium">{selectedBackend}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Supabase</span><span className={supabaseOk ? "text-emerald-400" : "text-red-400"}>{supabaseOk ? "✓" : "✗"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Push keys</span><span className={vapidOk ? "text-emerald-400" : "text-red-400"}>{vapidOk ? "✓" : "✗"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Cron</span><span className={cronOk ? "text-emerald-400" : "text-red-400"}>{cronOk ? "✓" : "✗"}</span></div>
          </CardContent>
        </Card>

        <Card className="border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Navigation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Link href="/dashboard" className="block text-primary hover:text-primary/80">Dashboard</Link>
            <Link href="/integrations" className="block text-primary hover:text-primary/80">Broker connections</Link>
            <Link href="/dashboard/history" className="block text-primary hover:text-primary/80">Trade history</Link>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  )
}
