import { useEffect, useState } from 'react'
import { suitReplayFileSchema } from '../../bodyview/schemas.ts'
import type { SuitReplayFile } from '../../bodyview/types.ts'

// The simulated suit replay (section 24.5) is a generated file served with
// the site: a same-origin request for a bundled file, never a call to another
// service. It is validated, held in memory and never persisted.

let pending: Promise<SuitReplayFile> | null = null

export function fetchSuitReplay(): Promise<SuitReplayFile> {
  if (pending === null) {
    const url = `${import.meta.env.BASE_URL}seed/suit-replay.json`
    const request = fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Could not load ${url} (HTTP ${response.status})`)
        }
        return response.json()
      })
      .then((json: unknown) => suitReplayFileSchema.parse(json))
    // A failed load may be retried; a good one is kept for the session.
    request.catch(() => {
      pending = null
    })
    pending = request
  }
  return pending
}

export type SuitReplayState =
  | { status: 'loading' }
  | { status: 'ready'; replay: SuitReplayFile }
  | { status: 'error'; retry: () => void }

export function useSuitReplay(): SuitReplayState {
  const [attempt, setAttempt] = useState(0)
  const [result, setResult] = useState<{
    attempt: number
    replay: SuitReplayFile | null
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchSuitReplay()
      .then((replay) => {
        if (!cancelled) setResult({ attempt, replay })
      })
      .catch(() => {
        if (!cancelled) setResult({ attempt, replay: null })
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  if (result === null || result.attempt !== attempt)
    return { status: 'loading' }
  if (result.replay === null) {
    return { status: 'error', retry: () => setAttempt((count) => count + 1) }
  }
  return { status: 'ready', replay: result.replay }
}
