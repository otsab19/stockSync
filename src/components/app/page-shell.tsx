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
    <div className={cn("mx-auto flex w-full max-w-[96rem] flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8 lg:py-8", className)}>
      {children}
    </div>
  )
}

export function PageHeader({ eyebrow, title, description, badges, actions, className }: PageHeaderProps) {
  return (
    <section
      className={cn(
        "flex flex-col gap-5 rounded-[1.75rem] border border-white/8 bg-white/[0.02] px-5 py-5 shadow-[0_24px_60px_rgba(2,6,23,0.18)] backdrop-blur-sm sm:px-6 sm:py-6",
        className
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          {eyebrow ? (
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              {eyebrow}
            </p>
          ) : null}
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h1>
            {description ? <p className="max-w-3xl text-sm leading-6 text-muted-foreground sm:text-[0.95rem]">{description}</p> : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {badges ? <div className="flex flex-wrap items-center gap-2">{badges}</div> : null}
    </section>
  )
}

