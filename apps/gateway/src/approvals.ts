import { randomUUID } from 'node:crypto'
import type { PendingRequest } from '@offee/contracts'

export type ApprovalOutcome = 'approved' | 'denied' | 'timeout'

type Waiting = {
  request: PendingRequest
  settle: (outcome: ApprovalOutcome) => void
}

export type ApprovalQueue = {
  hold: (request: Omit<PendingRequest, 'id' | 'createdAt'>) => Promise<ApprovalOutcome>
  list: () => PendingRequest[]
  decide: (id: string, outcome: 'approved' | 'denied') => boolean
  denyAll: () => number
}

const previewLimit = 4000

/**
 * Shortens a request body to what fits on a terminal screen, saying how much was cut.
 * @param body The body as sent.
 * @returns The preview.
 */
export const previewOf = (body: string): string =>
  body.length <= previewLimit ? body : `${body.slice(0, previewLimit)}\n... (${body.length - previewLimit} more characters)`

/**
 * Holds requests until someone on the host approves or denies them, or they time out.
 * @param options The clock and how long a request may wait.
 * @returns The queue.
 */
export const createApprovalQueue = (options: { now: () => number; timeoutMilliseconds: number }): ApprovalQueue => {
  const waiting = new Map<string, Waiting>()

  const settleAndForget = (id: string, outcome: ApprovalOutcome): boolean => {
    const entry = waiting.get(id)
    if (entry === undefined) return false
    waiting.delete(id)
    entry.settle(outcome)
    return true
  }

  return {
    hold: (request) =>
      new Promise((resolve) => {
        const id = randomUUID()
        const timer = setTimeout(() => settleAndForget(id, 'timeout'), options.timeoutMilliseconds)
        waiting.set(id, {
          request: { ...request, id, createdAt: options.now() },
          settle: (outcome) => {
            clearTimeout(timer)
            resolve(outcome)
          },
        })
      }),
    list: () => [...waiting.values()].map((entry) => entry.request),
    decide: (id, outcome) => settleAndForget(id, outcome),
    denyAll: () => [...waiting.keys()].filter((id) => settleAndForget(id, 'denied')).length,
  }
}
