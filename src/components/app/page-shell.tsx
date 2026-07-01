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
    <div className={cn("flex flex-col gap-1 pb-6 border-b border-border", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h1>
          {description ? (
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 sm:pt-1">{actions}</div> : null}
      </div>
      {badges ? <div className="mt-3 flex flex-wrap items-center gap-2">{badges}</div> : null}
    </div>
  )
}

