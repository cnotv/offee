import { setTimeout as wait } from 'node:timers/promises'
import { z } from 'zod'

export type HostedModelOptions = {
  /** The provider's OpenAI-compatible base, such as https://api.groq.com/openai/v1. */
  baseUrl: string
  apiKey: string
  model: string
  fetchFunction?: typeof fetch
  rateLimitRetryLimit?: number
  /** Used when a 429 answer carries no Retry-After. */
  rateLimitDelayMs?: number
}

const chatRequestSchema = z.record(z.string(), z.unknown())

/**
 * Turns the request Offee sends to llama.cpp into one a hosted provider accepts: it names the
 * model, which llama.cpp ignores, and drops llama.cpp's chat template switches, which providers
 * reject.
 * @param body The request body as Offee sent it.
 * @param model The provider's model id.
 * @returns The body to send on.
 */
export const hostedRequestBody = (body: unknown, model: string): Record<string, unknown> =>
  Object.fromEntries([...Object.entries(chatRequestSchema.parse(body)).filter(([key]) => key !== 'chat_template_kwargs'), ['model', model]])

const retryDelayOf = (response: Response, fallbackMs: number): number => {
  const seconds = Number(response.headers.get('retry-after'))
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : fallbackMs
}

/**
 * Answers on the paths Offee calls llama.cpp on, and passes chat requests to a hosted model with
 * the API key added, so a development run can use a fast free model without the key ever
 * reaching the app. A free tier answers 429 when asked too often; that answer is waited out.
 * @param options Where to send requests, the key, the model and the retry policy.
 * @returns A fetch handler.
 */
export const createHostedModelProxy = (options: HostedModelOptions): ((request: Request) => Promise<Response>) => {
  const { baseUrl, apiKey, model, fetchFunction = fetch, rateLimitRetryLimit = 10, rateLimitDelayMs = 10_000 } = options

  const sendChat = async (body: string, signal: AbortSignal, retriesLeft: number): Promise<Response> => {
    const response = await fetchFunction(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body,
      signal,
    })
    if (response.status !== 429 || retriesLeft === 0) return response
    await response.body?.cancel()
    await wait(retryDelayOf(response, rateLimitDelayMs), undefined, { signal })
    return sendChat(body, signal, retriesLeft - 1)
  }

  return async (request) => {
    const path = new URL(request.url).pathname
    if (path === '/health') return Response.json({ status: 'ok' })
    if (path === '/v1/models') return Response.json({ data: [{ id: model }] })
    if (path !== '/v1/chat/completions' || request.method !== 'POST') return new Response('Not found', { status: 404 })
    const upstream = await sendChat(JSON.stringify(hostedRequestBody(await request.json(), model)), request.signal, rateLimitRetryLimit)
    return new Response(upstream.body, { status: upstream.status, headers: { 'content-type': upstream.headers.get('content-type') ?? 'text/plain' } })
  }
}
