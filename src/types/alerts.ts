export type AlertJobResult = {
  success: boolean
  backend: "supabase" | "browser"
  skipped?: boolean
  error?: string
  message: string
}

