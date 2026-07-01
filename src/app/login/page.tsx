"use client"

import { useEffect, useState } from "react"
import { createBrowserClient } from "@supabase/ssr"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [verifying, setVerifying] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)

    // Show error if redirected back with failure
    if (params.get("error")) {
      setError("Sign-in failed. Please try again.")
    }

    // Handle hash-based tokens (Supabase implicit flow fallback)
    const hash = window.location.hash
    if (hash && hash.includes("access_token")) {
      setVerifying(true)
      const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          window.location.href = "/dashboard"
        } else {
          setVerifying(false)
        }
      })
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }

    setLoading(false)
  }

  if (verifying) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p className="text-sm text-muted-foreground">Signing you in...</p>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">StockSync</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in with your email</p>
        </div>

        {sent ? (
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center text-sm text-emerald-400">
            Check your email for the magic link.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">Email</span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-sm outline-none focus:border-primary"
                placeholder="you@example.com"
              />
            </label>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "Sending..." : "Send magic link"}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
