'use client'
// The browser's end of the live layer: one stream, the latest state, and a
// way to act on it. Every view that shows decisions reads from here.
import { useCallback, useEffect, useState } from 'react'
import type { Action, LiveState } from './live'

export function useLive() {
  const [state, setState] = useState<LiveState | null>(null)
  const [online, setOnline] = useState(false)

  useEffect(() => {
    let es: EventSource | null = null
    let last = 0
    let dead = false
    const open = () => {
      es?.close()
      es = new EventSource('/api/live')
      es.onmessage = (e) => {
        last = Date.now()
        setOnline(true)
        setState(JSON.parse(e.data) as LiveState)
      }
      es.onerror = () => setOnline(false)
    }
    open()
    // A hot reload on the server leaves the old stream open and silent.
    const watchdog = setInterval(() => {
      if (!dead && Date.now() - last > 5000) {
        setOnline(false)
        open()
      }
    }, 2500)
    return () => {
      dead = true
      clearInterval(watchdog)
      es?.close()
    }
  }, [])

  const act = useCallback(async (a: Action): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch('/api/live', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(a),
      })
      return await res.json()
    } catch {
      return { ok: false, error: 'The live server did not answer.' }
    }
  }, [])

  return { state, online, act }
}
