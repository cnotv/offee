import { z } from 'zod'
import type { DurationHistory, Estimate, OperationKind } from './types'

// How long each operation usually takes on a laptop's local model, until this machine has its own record.
const typicalSeconds: Record<OperationKind, { low: number; high: number }> = {
  chat: { low: 20, high: 90 },
  reply: { low: 30, high: 120 },
  translate: { low: 60, high: 300 },
  review: { low: 60, high: 300 },
  transcribe: { low: 30, high: 300 },
  extract: { low: 2, high: 60 },
  form: { low: 30, high: 180 },
  'form-save': { low: 2, high: 15 },
  profile: { low: 60, high: 360 },
  document: { low: 2, high: 120 },
}

const historyLength = 5

const storedHistorySchema = z.record(z.string(), z.array(z.number().nonnegative()))

/**
 * Seconds as a person reads them.
 * @param seconds A duration in seconds.
 * @returns For example "45 s", "3 min" or "1 min 23 s".
 */
export const describeSeconds = (seconds: number): string => {
  const whole = Math.max(0, Math.round(seconds))
  if (whole < 60) return `${whole} s`
  const minutes = Math.floor(whole / 60)
  const rest = whole % 60
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`
}

/**
 * Time since an operation started, as a running clock.
 * @param milliseconds The elapsed time.
 * @returns Minutes and seconds, such as "1:05".
 */
export const formatElapsed = (milliseconds: number): string => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

const median = (values: number[]): number => {
  const sorted = values.toSorted((first, second) => first - second)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

/**
 * How long an operation is likely to take: the median of its recent runs on this machine, or
 * the typical range before it has run here.
 * @param history Recent durations per operation kind, in milliseconds.
 * @param kind The operation.
 * @returns The estimate and what it rests on.
 */
export const estimateOf = (history: DurationHistory, kind: OperationKind): Estimate => {
  const recent = history[kind] ?? []
  if (recent.length > 0) return { basis: 'history', label: `about ${describeSeconds(median(recent) / 1000)}` }
  const typical = typicalSeconds[kind]
  return { basis: 'typical', label: `${describeSeconds(typical.low)} to ${describeSeconds(typical.high)}` }
}

/**
 * An estimate as a phrase, saying where it comes from.
 * @param estimate The estimate.
 * @returns For example "about 1 min 30 s on this machine" or "usually 30 s to 3 min".
 */
export const describeEstimate = (estimate: Estimate): string =>
  estimate.basis === 'history' ? `${estimate.label} on this machine` : `usually ${estimate.label}`

/**
 * Adds a finished operation's duration, keeping only the most recent few.
 * @param history The durations so far.
 * @param kind The operation that finished.
 * @param milliseconds How long it took.
 * @returns The new history.
 */
export const withDuration = (history: DurationHistory, kind: OperationKind, milliseconds: number): DurationHistory => ({
  ...history,
  [kind]: [...(history[kind] ?? []), milliseconds].slice(-historyLength),
})

const isOperationKind = (key: string): key is OperationKind => Object.hasOwn(typicalSeconds, key)

/**
 * Reads the history kept in the browser, dropping anything malformed or unknown.
 * @param stored The stored JSON, or null when nothing is stored.
 * @returns The history.
 */
export const readDurationHistory = (stored: string | null): DurationHistory => {
  const parsed = storedHistorySchema.safeParse((() => {
    try {
      return JSON.parse(stored ?? '{}')
    } catch {
      return null
    }
  })())
  if (!parsed.success) return {}
  return Object.fromEntries(Object.entries(parsed.data).filter(([key]) => isOperationKind(key)))
}
