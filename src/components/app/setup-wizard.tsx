"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { CheckCircle2, ChevronRight, Circle, Landmark, LayoutDashboard, Settings } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

type BrokerStatus = "unknown" | "connected" | "not_connected"

type SetupStep = {
  id: string
  title: string
  description: string
  href: string
  cta: string
  icon: React.ElementType
}

const steps: SetupStep[] = [
  {
    id: "t212",
    title: "Connect Trading 212",
    description: "Paste your API key and secret to start syncing positions and trade history from Trading 212.",
    href: "/integrations",
    cta: "Add Trading 212 credentials",
    icon: Landmark,
  },
  {
    id: "etoro",
    title: "Connect eToro",
    description: "Paste your eToro API key and user key to sync your eToro portfolio alongside Trading 212.",
    href: "/integrations",
    cta: "Add eToro credentials",
    icon: Landmark,
  },
  {
    id: "dashboard",
    title: "View your portfolio",
    description: "Open the dashboard to see your unified portfolio, KPIs, charts, and trade history.",
    href: "/dashboard",
    cta: "Open dashboard",
    icon: LayoutDashboard,
  },
  {
    id: "notifications",
    title: "Enable push notifications",
    description: "Turn on browser push alerts so you get notified when a stock moves past your threshold.",
    href: "/settings",
    cta: "Go to Settings",
    icon: Settings,
  },
]

async function checkBrokerConnected(broker: "t212" | "etoro"): Promise<boolean> {
  try {
    const db = await openDb()
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction("broker_connections", "readonly")
      const store = tx.objectStore("broker_connections")
      const req = store.get(broker)
      req.onsuccess = () => {
        const record = req.result as Record<string, unknown> | undefined
        const connected = Boolean(record?.apiKey && record?.apiSecret)
        resolve(connected)
      }
      req.onerror = () => resolve(false)
    })
  } catch {
    return false
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("stocksync_portfolio", 1)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains("broker_connections")) {
        db.createObjectStore("broker_connections", { keyPath: "broker" })
      }
    }
  })
}

export function SetupWizard() {
  const [t212Status, setT212Status] = useState<BrokerStatus>("unknown")
  const [etoroStatus, setEtoroStatus] = useState<BrokerStatus>("unknown")
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    async function check() {
      const [t212, etoro] = await Promise.all([
        checkBrokerConnected("t212"),
        checkBrokerConnected("etoro"),
      ])
      setT212Status(t212 ? "connected" : "not_connected")
      setEtoroStatus(etoro ? "connected" : "not_connected")
    }
    void check()
  }, [])

  const allConnected = t212Status === "connected" && etoroStatus === "connected"

  if (dismissed || (t212Status === "unknown" && etoroStatus === "unknown")) {
    return null
  }

  if (allConnected) {
    return null
  }

  const stepStatus: Record<string, "done" | "active" | "pending"> = {
    t212: t212Status === "connected" ? "done" : "active",
    etoro: etoroStatus === "connected" ? "done" : t212Status === "connected" ? "active" : "pending",
    dashboard: t212Status === "connected" || etoroStatus === "connected" ? "active" : "pending",
    notifications: "pending",
  }

  return (
    <Card className="border-primary/20 bg-[linear-gradient(135deg,rgba(16,185,129,0.06),rgba(59,130,246,0.04),transparent_60%)]">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Get started</CardTitle>
          <CardDescription>
            Connect your brokers to start tracking your portfolio in StockSync.
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDismissed(true)}
          className="shrink-0 text-muted-foreground"
        >
          Dismiss
        </Button>
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {steps.map((step) => {
            const status = stepStatus[step.id]
            const Icon = step.icon
            const isDone = status === "done"
            const isActive = status === "active"

            return (
              <li
                key={step.id}
                className={`flex items-start gap-3 rounded-2xl border px-4 py-3 transition-colors ${
                  isDone
                    ? "border-emerald-500/20 bg-emerald-500/5 opacity-70"
                    : isActive
                      ? "border-primary/30 bg-primary/5"
                      : "border-white/8 bg-white/[0.02] opacity-50"
                }`}
              >
                <span className="mt-0.5 shrink-0">
                  {isDone ? (
                    <CheckCircle2 className="size-5 text-emerald-400" />
                  ) : (
                    <Circle className={`size-5 ${isActive ? "text-primary" : "text-muted-foreground/40"}`} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className={`text-sm font-semibold ${isDone ? "line-through text-muted-foreground" : ""}`}>
                        {step.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>
                    </div>
                    {!isDone && isActive && (
                      <Link href={step.href}>
                        <Button size="sm" variant="outline" className="shrink-0 gap-1.5 rounded-xl border-white/10 bg-white/[0.03]">
                          {step.cta}
                          <ChevronRight className="size-3.5" />
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
                <span className="mt-0.5 shrink-0">
                  <Icon className="size-4 text-muted-foreground/40" />
                </span>
              </li>
            )
          })}
        </ol>
      </CardContent>
    </Card>
  )
}
