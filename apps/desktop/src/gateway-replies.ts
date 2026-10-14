import { z } from 'zod'
import type { ApprovalPrompt, GatewayStatus, PendingRequest } from './types.ts'

const statusSchema = z.object({
  mode: z.enum(['sealed', 'ask', 'open']),
  openUntil: z.number().nullable(),
  pendingCount: z.number(),
})

const pendingSchema = z.object({
  id: z.string(),
  destination: z.string(),
  url: z.string(),
  createdAt: z.number(),
  bodyBytes: z.number(),
  bodyPreview: z.string(),
})

const statusReplySchema = z.object({ ok: z.literal(true), status: statusSchema })
const pendingReplySchema = z.object({ ok: z.literal(true), pending: z.array(pendingSchema) })

const lastJsonLine = (output: string): unknown => {
  const line = output
    .split('\n')
    .map((candidate) => candidate.trim())
    .filter((candidate) => candidate.startsWith('{'))
    .at(-1)
  if (line === undefined) return null
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

/**
 * Reads the switch's status from `offee ctl --json status`.
 * @param output What the command printed.
 * @returns The status, or null when the gateway did not answer.
 */
export const parseStatusReply = (output: string): GatewayStatus | null => {
  const parsed = statusReplySchema.safeParse(lastJsonLine(output))
  return parsed.success ? parsed.data.status : null
}

/**
 * Reads the waiting requests from `offee ctl --json pending`.
 * @param output What the command printed.
 * @returns The requests, empty when none or when the gateway did not answer.
 */
export const parsePendingReply = (output: string): PendingRequest[] => {
  const parsed = pendingReplySchema.safeParse(lastJsonLine(output))
  return parsed.success ? parsed.data.pending : []
}

/**
 * The requests not yet put to the person.
 * @param pending What waits now.
 * @param alreadyAsked The ids already shown.
 * @returns The new ones, oldest first.
 */
export const requestsToAsk = (pending: PendingRequest[], alreadyAsked: ReadonlySet<string>): PendingRequest[] =>
  pending.filter((request) => !alreadyAsked.has(request.id)).toSorted((left, right) => left.createdAt - right.createdAt)

/**
 * The native dialog for one request: where it goes and exactly what it carries.
 * @param request The waiting request.
 * @returns The dialog's title, message and detail.
 */
export const approvalPromptFor = (request: PendingRequest): ApprovalPrompt => ({
  title: 'Offee wants to send a request',
  message: `Send this request to ${request.destination}?`,
  detail: [`${request.url}`, `${request.bodyBytes.toLocaleString('en-US')} bytes`, '', request.bodyPreview].join('\n'),
})

/**
 * The words for the switch in the menu bar.
 * @param status The gateway's status, or null when Offee is not running.
 * @param now The current time.
 * @returns A short label.
 */
export const switchLabel = (status: GatewayStatus | null, now: number): string => {
  if (status === null) return 'Not running'
  if (status.mode === 'sealed') return 'Sealed'
  if (status.mode === 'ask') return status.pendingCount > 0 ? `Ask (${status.pendingCount} waiting)` : 'Ask'
  const minutesLeft = status.openUntil === null ? 0 : Math.max(0, Math.ceil((status.openUntil - now) / 60_000))
  return `Open, ${minutesLeft} min left`
}
