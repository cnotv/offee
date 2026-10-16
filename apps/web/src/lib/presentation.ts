import type { GatewayStatus, RunSummary } from '@offee/contracts'

export type SwitchPresentation = {
  label: string
  hint: string
  color: 'grass' | 'amber' | 'red' | 'gray'
  open: boolean
}

/**
 * How the switch reads in the sidebar.
 * @param gateway The gateway's status, or null when it cannot be reached.
 * @param now The current time.
 * @returns The label, explanation, color and whether anything may leave.
 */
export const describeSwitch = (gateway: GatewayStatus | null, now: number): SwitchPresentation => {
  if (gateway === null) return { label: 'Sealed (no gateway)', hint: 'The gateway is not running, so nothing can leave.', color: 'gray', open: false }
  if (gateway.mode === 'sealed') return { label: 'Sealed', hint: 'Nothing leaves this machine. Change it on the host: offee switch ask', color: 'grass', open: false }
  if (gateway.mode === 'ask') {
    const waiting = gateway.pendingCount > 0 ? `, ${gateway.pendingCount} waiting` : ''
    return { label: `Ask${waiting}`, hint: 'Each request waits for approval on the host: offee watch', color: 'amber', open: false }
  }
  const minutesLeft = gateway.openUntil === null ? 0 : Math.max(0, Math.ceil((gateway.openUntil - now) / 60_000))
  return { label: `Open, ${minutesLeft} min left`, hint: 'Requests to listed destinations leave without asking. Seal it: offee switch seal', color: 'red', open: true }
}

const workflowNames: Record<RunSummary['workflow'], string> = {
  chat: 'Chat',
  reply: 'Reply',
  translate: 'Translation',
  review: 'Review',
  transcribe: 'Transcript',
  form: 'Form',
  profile: 'Profile from a document',
}

/**
 * A workflow's name for the run log.
 * @param workflow The workflow kind.
 * @returns Its name.
 */
export const workflowName = (workflow: RunSummary['workflow']): string => workflowNames[workflow]

const byteFormat = new Intl.NumberFormat(undefined, { style: 'unit', unit: 'byte', notation: 'compact', unitDisplay: 'narrow' })

/**
 * A size in bytes, short, in the person's locale.
 * @param bytes The size.
 * @returns For example 12KB.
 */
export const formatBytes = (bytes: number): string => byteFormat.format(bytes)

/**
 * A timestamp in the person's locale, short.
 * @param timestamp Milliseconds since the epoch.
 * @returns The formatted date and time.
 */
export const formatTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
