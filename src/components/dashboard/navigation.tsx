"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { Activity, ChartCandlestick, LayoutDashboard, Landmark, Settings, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const workspaceModeLabel = process.env.NEXT_PUBLIC_DATA_BACKEND === "browser" ? "Browser-local sync" : "Supabase backend"

const navigationItems = [
  { href: "/dashboard", label: "Dashboard", shortLabel: "Home", icon: LayoutDashboard },
  { href: "/dashboard?view=analytics", label: "Analytics", shortLabel: "Analytics", icon: Activity },
  { href: "/dashboard/history", label: "History", shortLabel: "History", icon: ChartCandlestick },
  { href: "/integrations", label: "Connections", shortLabel: "Brokers", icon: Landmark },
  { href: "/settings", label: "Settings", shortLabel: "Settings", icon: Settings },
]

function isNavigationItemActive(pathname: string, view: string | null, href: string) {
  return href === "/dashboard"
    ? pathname === "/dashboard" && !view
    : href === "/dashboard?view=analytics"
      ? pathname === "/dashboard" && view === "analytics"
      : pathname === href
}

function getCurrentNavigationItem(pathname: string, view: string | null) {
  return navigationItems.find((item) => isNavigationItemActive(pathname, view, item.href)) ?? navigationItems[0]
}

export function DesktopSidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const view = searchParams.get("view")

  return (
    <aside className="sticky top-0 hidden h-screen w-[17.5rem] shrink-0 border-r border-white/8 bg-sidebar/72 backdrop-blur md:flex md:flex-col xl:w-72">
      <div className="flex h-full flex-col gap-6 px-4 py-5 xl:px-5">
        <div className="space-y-4 border-b border-white/8 pb-5">
          <Badge variant="outline" className="gap-1.5 border-white/10 bg-white/[0.03] px-2.5 py-1 text-[0.68rem] tracking-[0.18em] uppercase text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" />
            StockSync
          </Badge>
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold tracking-tight">Portfolio workspace</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              One shell for positions, broker connections, and the current sync state.
            </p>
          </div>
        </div>

        <nav className="space-y-1.5">
          {navigationItems.map((item) => {
            const Icon = item.icon
            const isActive = isNavigationItemActive(pathname, view, item.href)

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-medium text-muted-foreground transition-all hover:bg-white/[0.04] hover:text-foreground",
                  isActive && "bg-white/[0.06] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                )}
              >
                <span className={cn("flex size-9 items-center justify-center rounded-xl border border-white/8 bg-white/[0.03]", isActive && "border-primary/30 bg-primary/10 text-primary")}>
                  <Icon className="size-4.5" />
                </span>
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <div className="mt-auto rounded-[1.5rem] border border-white/8 bg-white/[0.03] p-4 shadow-[0_16px_40px_rgba(2,6,23,0.2)]">
          <p className="text-[0.68rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Current mode</p>
          <p className="mt-2 text-base font-semibold">{workspaceModeLabel}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Trading 212 and eToro feed the same dashboard so the shell always feels unified.
          </p>
          <Link
            href="/integrations"
            className="mt-4 inline-flex items-center text-sm font-medium text-primary transition-colors hover:text-primary/80"
          >
            Manage broker connections
          </Link>
        </div>
      </div>
    </aside>
  )
}

export function MobileHeader() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentItem = getCurrentNavigationItem(pathname, searchParams.get("view"))

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-white/8 bg-background/88 px-4 py-3 backdrop-blur md:hidden">
      <div className="min-w-0">
        <p className="text-[0.65rem] uppercase tracking-[0.24em] text-muted-foreground">StockSync</p>
        <div className="mt-1 flex items-center gap-2">
          <h2 className="truncate text-lg font-semibold tracking-tight">{currentItem.label}</h2>
          <Badge variant="outline" className="border-white/10 bg-white/[0.03] text-[0.68rem]">
            {workspaceModeLabel}
          </Badge>
        </div>
      </div>
      <Link
        href="/integrations"
        className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-white/[0.06]"
      >
        Brokers
      </Link>
    </header>
  )
}

export function MobileBottomNav() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const view = searchParams.get("view")

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 md:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5 gap-2 rounded-[1.75rem] border border-white/10 bg-background/88 p-2 shadow-[0_16px_50px_rgba(2,6,23,0.35)] backdrop-blur-xl">
        {navigationItems.map((item) => {
          const Icon = item.icon
          const isActive = isNavigationItemActive(pathname, view, item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[0.72rem] font-medium text-muted-foreground transition-all hover:bg-white/[0.05] hover:text-foreground",
                isActive && "bg-white/[0.07] text-foreground"
              )}
            >
              <span className={cn("flex size-8 items-center justify-center rounded-xl", isActive && "bg-primary/12 text-primary")}>
                <Icon className="size-4" />
              </span>
              <span>{item.shortLabel}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}

