"use client"

import { useCallback, useEffect, useState } from "react"

type PushState = "unsupported" | "denied" | "prompt" | "subscribed" | "loading"

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function usePushNotifications() {
  const [state, setState] = useState<PushState>("loading")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported")
      return
    }

    const checkPermission = async () => {
      const permission = Notification.permission
      if (permission === "denied") {
        setState("denied")
        return
      }

      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      setState(subscription ? "subscribed" : "prompt")
    }

    checkPermission()
  }, [])

  const subscribe = useCallback(async () => {
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidPublicKey) {
      setError("Push notifications not configured (missing VAPID key).")
      return false
    }

    try {
      setState("loading")
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as unknown as ArrayBuffer,
      })

      const keys = subscription.toJSON().keys
      if (!keys) throw new Error("Subscription keys missing")

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
          p256dh: keys.p256dh,
          auth: keys.auth,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.message || "Failed to save subscription")
      }

      setState("subscribed")
      setError(null)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : "Subscription failed")
      setState("prompt")
      return false
    }
  }, [])

  const unsubscribe = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await subscription.unsubscribe()
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        })
      }
      setState("prompt")
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unsubscribe failed")
    }
  }, [])

  return { state, error, subscribe, unsubscribe }
}

