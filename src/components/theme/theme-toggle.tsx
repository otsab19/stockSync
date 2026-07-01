"use client"

import { Monitor, Moon, Sun } from "lucide-react"
import { cn } from "@/lib/utils"
import { useTheme, type ThemePreference } from "@/components/theme/theme-provider"

const themeOptions: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
]

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme()

  return (
    <div className={cn(
      "grid grid-cols-3 gap-1 rounded-xl border border-border bg-muted/40 p-1",
      compact && "rounded-xl"
    )}>
      {themeOptions.map((option) => {
        const Icon = option.icon
        const isActive = theme === option.value

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground",
              isActive && "bg-primary/12 text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]",
              compact && "px-2"
            )}
            aria-pressed={isActive}
            title={`${option.label} theme`}
          >
            <Icon className="size-3.5" />
            <span className={compact ? "sr-only" : undefined}>{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
