"use client"

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

export type ThemePreference = "light" | "dark" | "system"

type ThemeContextValue = {
  theme: ThemePreference
  resolvedTheme: "light" | "dark"
  setTheme: (theme: ThemePreference) => void
}

const THEME_STORAGE_KEY = "stocksync-theme"
const ThemeContext = createContext<ThemeContextValue | null>(null)

function getSystemTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

function resolveTheme(theme: ThemePreference) {
  return theme === "system" ? getSystemTheme() : theme
}

function getStoredTheme(): ThemePreference {
  const value = window.localStorage.getItem(THEME_STORAGE_KEY)
  return value === "light" || value === "dark" || value === "system" ? value : "system"
}

function applyTheme(theme: ThemePreference) {
  const resolvedTheme = resolveTheme(theme)
  document.documentElement.classList.toggle("dark", resolvedTheme === "dark")
  document.documentElement.style.colorScheme = resolvedTheme
  return resolvedTheme
}

function getInitialTheme() {
  return typeof window === "undefined" ? "system" : getStoredTheme()
}

function getInitialResolvedTheme() {
  return typeof window === "undefined" ? "dark" : resolveTheme(getStoredTheme())
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(getInitialTheme)
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(getInitialResolvedTheme)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    const handleChange = () => {
      if (theme === "system") {
        setResolvedTheme(applyTheme(theme))
      }
    }

    mediaQuery.addEventListener("change", handleChange)
    return () => mediaQuery.removeEventListener("change", handleChange)
  }, [theme])

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    resolvedTheme,
    setTheme: (nextTheme) => {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme)
      setThemeState(nextTheme)
      setResolvedTheme(applyTheme(nextTheme))
    },
  }), [resolvedTheme, theme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider")
  }

  return context
}

export const themeStorageKey = THEME_STORAGE_KEY
