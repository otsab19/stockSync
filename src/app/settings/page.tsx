import Link from "next/link"
import { PageShell } from "@/components/app/page-shell"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { NotificationToggle } from "@/components/notifications/notification-toggle"
import { TestNotificationButton } from "@/components/notifications/test-notification-button"

export default function SettingsPage() {
  return (
    <PageShell>
      <div className="space-y-2 px-1">
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="border-white/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Push notifications</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <NotificationToggle />
            <TestNotificationButton />
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
