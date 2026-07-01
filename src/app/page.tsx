import Link from "next/link"
import { ArrowRight, ChartCandlestick, Landmark, Settings2 } from "lucide-react"
import { PageHeader, PageShell } from "@/components/app/page-shell"
import { SetupWizard } from "@/components/app/setup-wizard"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const quickLinks = [
  {
    href: "/dashboard",
    title: "Open dashboard",
    description: "See the unified holdings view, backend state, and the alert-focused dashboard experience.",
    icon: ChartCandlestick,
  },
  {
    href: "/integrations",
    title: "Review integrations",
    description: "Track how Trading 212, eToro, and future brokers plug into the app through API-first connections.",
    icon: Landmark,
  },
  {
    href: "/settings",
    title: "Check local setup",
    description: "Confirm whether the selected backend can support live monitoring and background notifications.",
    icon: Settings2,
  },
]

export default function Home() {
  return (
    <PageShell className="py-8 lg:py-10">
      <PageHeader
        eyebrow="Welcome"
        title="A cleaner shell for portfolio tracking"
        description="StockSync keeps Trading 212 and eToro inside one calmer workspace, with the dashboard, integrations, and environment state all sharing the same product frame."
        badges={(
          <>
            <Badge variant="outline">Unified dashboard</Badge>
            <Badge variant="outline">Trading 212 live sync</Badge>
            <Badge variant="outline">eToro live sync</Badge>
          </>
        )}
      />

      <SetupWizard />

      <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="border-white/10 bg-[linear-gradient(145deg,rgba(16,185,129,0.08),rgba(59,130,246,0.06),transparent_72%)]">
          <CardHeader>
            <CardTitle>What’s in the shell</CardTitle>
            <CardDescription>
              Move from portfolio overview to broker connections without the app feeling like a set of disconnected pages.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Overview</p>
              <p className="mt-2 text-base font-semibold">Cleaner spacing and hierarchy</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">The dashboard now reads like a product surface, not just a data dump.</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Integrations</p>
              <p className="mt-2 text-base font-semibold">Trading 212 plus eToro</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Trading 212 stays first-class while eToro returns in a minimal, clean way.</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Setup</p>
              <p className="mt-2 text-base font-semibold">Environment visibility</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Quickly see whether the selected backend can support live sync and alerts.</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-white/10">
          <CardHeader>
            <CardTitle>Start here</CardTitle>
            <CardDescription>Open the routes that define the current product shell.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {quickLinks.map((link) => {
              const Icon = link.icon

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-start gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.05]"
                >
                  <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-2xl border border-white/8 bg-background/40">
                    <Icon className="size-5 text-muted-foreground" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground">{link.title}</span>
                    <span className="mt-1 block text-sm leading-6 text-muted-foreground">{link.description}</span>
                  </span>
                  <ArrowRight className="mt-1 size-4 text-muted-foreground" />
                </Link>
              )
            })}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {quickLinks.map((link) => (
          <Card key={link.href} className="border-white/10">
              <CardHeader>
                <CardTitle>{link.title}</CardTitle>
                <CardDescription>{link.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Link href={link.href} className="text-sm font-medium text-primary transition-colors hover:text-primary/80">
                  Open {link.href}
                </Link>
              </CardContent>
            </Card>
        ))}
      </section>
    </PageShell>
  )
}
