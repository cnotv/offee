import { useCallback, useEffect, useState } from 'react'

export type Loaded<Value> = {
  value: Value | null
  error: string | null
  reload: () => void
}

/**
 * Loads a value when the component mounts and again whenever `reload` is called.
 * @param load The request; pass a stable function, such as one from `api`.
 * @returns The value once loaded, the last error, and a reload function.
 */
export const useLoad = <Value>(load: () => Promise<Value>): Loaded<Value> => {
  const [value, setValue] = useState<Value | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generation, setGeneration] = useState(0)

  useEffect(() => {
    const state = { cancelled: false }
    load()
      .then((loaded) => {
        if (state.cancelled) return
        setValue(loaded)
        setError(null)
      })
      .catch((caught: unknown) => {
        if (!state.cancelled) setError(caught instanceof Error ? caught.message : 'Loading failed')
      })
    return () => {
      state.cancelled = true
    }
  }, [load, generation])

  const reload = useCallback(() => setGeneration((current) => current + 1), [])
  return { value, error, reload }
}
