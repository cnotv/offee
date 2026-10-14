import { useCallback, useState } from 'react'

export type Action = {
  busy: boolean
  error: string | null
  run: (work: () => Promise<void>) => void
  clearError: () => void
}

/**
 * Runs one piece of work at a time and keeps its busy state and error for the UI.
 * @returns The action state and runner.
 */
export const useAction = (): Action => {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const run = useCallback((work: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    work()
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Something went wrong'))
      .finally(() => setBusy(false))
  }, [])
  const clearError = useCallback(() => setError(null), [])
  return { busy, error, run, clearError }
}
