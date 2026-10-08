import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import type { GatewayRefusalBody } from '@offee/contracts'

export type RemoteRequest = {
  system: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  maxTokens: number
}

export type RemoteOutcome =
  | { ok: true; text: string; model: string }
  | { ok: false; reason: string; reachedProvider: boolean }

export type RemoteModel = {
  model: string
  complete: (request: RemoteRequest) => Promise<RemoteOutcome>
}

const refusalSchema = z.object({
  refusal: z.enum(['sealed', 'denied', 'timeout', 'unknown-destination', 'missing-key']),
  detail: z.string(),
})

/**
 * Reads the gateway's refusal out of an SDK error, when that is what it was.
 * @param error What the SDK threw.
 * @returns The refusal, or null when the error came from elsewhere.
 */
export const gatewayRefusalOf = (error: unknown): GatewayRefusalBody | null => {
  if (!(error instanceof Anthropic.PermissionDeniedError)) return null
  const parsed = refusalSchema.safeParse(error.error)
  return parsed.success ? parsed.data : null
}

/**
 * Calls Claude through the gateway. The app holds no key: the SDK's key is a placeholder the
 * gateway drops, and the gateway adds the real one only if the switch lets the request out.
 * @param options The gateway's address and the model to use.
 * @returns The client.
 */
export const createRemoteModel = (options: { gatewayUrl: string; model: string }): RemoteModel => {
  const client = new Anthropic({
    apiKey: 'held-by-the-offee-gateway',
    baseURL: `${options.gatewayUrl}/to/anthropic`,
    maxRetries: 0,
    // A request in ask mode waits up to five minutes for approval on the host.
    timeout: 10 * 60_000,
  })

  return {
    model: options.model,
    complete: async (request) => {
      try {
        const response = await client.beta.messages.create({
          model: options.model,
          max_tokens: request.maxTokens,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: request.system,
          messages: request.messages,
        })
        if (response.stop_reason === 'refusal') {
          return { ok: false, reason: 'The remote model declined this request', reachedProvider: true }
        }
        const text = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('').trim()
        return { ok: true, text, model: response.model }
      } catch (error) {
        const refusal = gatewayRefusalOf(error)
        if (refusal !== null) return { ok: false, reason: refusal.detail, reachedProvider: false }
        if (error instanceof Anthropic.APIConnectionError) {
          return { ok: false, reason: 'The gateway could not be reached', reachedProvider: false }
        }
        if (error instanceof Anthropic.APIError) {
          return { ok: false, reason: `The remote model answered ${String(error.status)}`, reachedProvider: true }
        }
        throw error
      }
    },
  }
}
