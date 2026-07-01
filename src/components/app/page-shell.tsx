import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

interface PageShellProps {
  children: ReactNode
  className?: string
}

interface PageHeaderProps {
  eyebrow?: string
  title: string
  description?: string
  badges?: ReactNode
  actions?: ReactNode
  className?: string
}

export function PageShell({ children, className }: PageShellProps) {
  return (
    <div className={cn("mx-auto flex w-full max-w-[96rem] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8", className)}>
      {children}
    </div>
  )
}

export function PageHeader({ eyebrow, title, description, badges, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          {eyebrow ? (
            <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
              {eyebrow}
            </span>
          ) : null}
          <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">{title}</h1>
          {description ? (
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {badges ? <div className="flex flex-wrap items-center gap-2">{badges}</div> : null}
    </div>
  )
}

