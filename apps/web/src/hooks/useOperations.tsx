import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { readDurationHistory, withDuration } from '@/lib/estimates'
import type { DurationHistory, Operation, OperationKind } from '@/lib/types'

type OperationsValue = {
  operations: Operation[]
  history: DurationHistory
  start: (kind: OperationKind, label: string, work: (signal: AbortSignal) => Promise<void>) => Promise<void>
  stop: (id: string) => void
}

const OperationsContext = createContext<OperationsValue | null>(null)

const historyKey = 'offee.operation-durations'

// Storage can be missing or refuse writes (a private window); an estimate is a convenience, so it simply starts over.
const loadHistory = (): DurationHistory => {
  try {
    return readDurationHistory(localStorage.getItem(historyKey))
  } catch {
    return {}
  }
}

const saveHistory = (history: DurationHistory): void => {
  try {
    localStorage.setItem(historyKey, JSON.stringify(history))
  } catch {
    // Kept in memory for this session only.
  }
}

/**
 * Keeps every slow operation above the router, so it runs on while the person moves around the
 * app, can be stopped from anywhere, and teaches the estimates how fast this machine is.
 */
export const OperationsProvider = ({ children }: { children: ReactNode }) => {
  const [operations, setOperations] = useState<Operation[]>([])
  const [history, setHistory] = useState<DurationHistory>(loadHistory)
  const controllers = useRef(new Map<string, AbortController>())

  useEffect(() => saveHistory(history), [history])

  const start = useCallback(async (kind: OperationKind, label: string, work: (signal: AbortSignal) => Promise<void>) => {
    const id = crypto.randomUUID()
    const controller = new AbortController()
    const startedAt = Date.now()
    controllers.current.set(id, controller)
    setOperations((current) => [...current, { id, kind, label, startedAt }])
    try {
      await work(controller.signal)
      const finishedAt = Date.now()
      setHistory((current) => withDuration(current, kind, finishedAt - startedAt))
    } catch (error) {
      throw controller.signal.aborted ? new Error('Stopped.') : error
    } finally {
      controllers.current.delete(id)
      setOperations((current) => current.filter((operation) => operation.id !== id))
    }
  }, [])

  const stop = useCallback((id: string) => controllers.current.get(id)?.abort(), [])

  const value = useMemo<OperationsValue>(() => ({ operations, history, start, stop }), [operations, history, start, stop])
  return <OperationsContext.Provider value={value}>{children}</OperationsContext.Provider>
}

/**
 * The running operations, their estimates' history, and the way to start or stop one.
 * @returns The operations state and actions.
 */
export const useOperations = (): OperationsValue => {
  const value = useContext(OperationsContext)
  if (value === null) throw new Error('Operations need an OperationsProvider')
  return value
}

/**
 * The current time, ticking every second while `active`, for running clocks.
 * @param active Whether anything needs the clock.
 * @returns Milliseconds since the epoch.
 */
export const useNow = (active: boolean): number => {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])
  return now
}
