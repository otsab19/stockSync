export type DataBackend = "supabase" | "browser"

const DEFAULT_BACKEND: DataBackend = "supabase"

export function getConfiguredBackend(): DataBackend {
  const configured = process.env.NEXT_PUBLIC_DATA_BACKEND?.toLowerCase()

  if (configured === "browser") {
    return "browser"
  }

  return DEFAULT_BACKEND
}

export function isSupabaseBackend() {
  return getConfiguredBackend() === "supabase"
}

export function isBrowserBackend() {
  return getConfiguredBackend() === "browser"
}

