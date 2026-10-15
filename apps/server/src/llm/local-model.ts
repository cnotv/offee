import { setTimeout as wait } from 'node:timers/promises'
import { z } from 'zod'

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type CompletionRequest = {
  messages: ChatMessage[]
  maxTokens: number
  jsonSchema?: Record<string, unknown>
  /** Aborts when the person stops the operation, so the model stops writing for nobody. */
  signal: AbortSignal
}

const completionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
})

const modelListSchema = z.object({ data: z.array(z.object({ id: z.string() })) })

export type LoadingRetry = {
  loadingRetryDelayMs: number
  loadingRetryLimit: number
}

// llama.cpp answers 503 until the model is in memory, which takes a minute or two after a start.
const defaultLoadingRetry: LoadingRetry = { loadingRetryDelayMs: 5000, loadingRetryLimit: 60 }

const isStillLoading = (status: number, body: string): boolean => status === 503 && body.includes('Loading model')

export type LocalModel = {
  complete: (request: CompletionRequest) => Promise<string>
  name: () => Promise<string | null>
}

/**
 * Talks to llama.cpp's OpenAI-compatible server on the internal network. While the server is
 * still loading the model, it asks again every few seconds instead of failing.
 * @param baseUrl Where the server listens.
 * @param fetchFunction The fetch to use, replaceable in tests.
 * @param loadingRetry How often and how many times to ask again while the model loads.
 * @returns The client.
 */
export const createLocalModel = (baseUrl: string, fetchFunction: typeof fetch = fetch, loadingRetry: LoadingRetry = defaultLoadingRetry): LocalModel => {
  const send = async (request: CompletionRequest, retriesLeft: number): Promise<Response> => {
    const response = await fetchFunction(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        messages: request.messages,
        max_tokens: request.maxTokens,
        // An answer that must fit a schema is data read off a document: the likeliest reading, every time.
        temperature: request.jsonSchema === undefined ? 0.3 : 0,
        ...(request.jsonSchema === undefined
          ? {}
          : { response_format: { type: 'json_schema', json_schema: { name: 'answer', schema: request.jsonSchema } } }),
      }),
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(15 * 60_000)]),
    })
    if (response.ok) return response
    const body = await response.text()
    if (!isStillLoading(response.status, body)) throw new Error(`The local model answered ${response.status}: ${body.slice(0, 300)}`)
    if (retriesLeft === 0) throw new Error('The local model is still loading. Try again in a few minutes.')
    await wait(loadingRetry.loadingRetryDelayMs, undefined, { signal: request.signal })
    return send(request, retriesLeft - 1)
  }

  return {
    complete: async (request) => {
      const response = await send(request, loadingRetry.loadingRetryLimit)
      const content = completionSchema.parse(await response.json()).choices[0]?.message.content ?? ''
      return stripThinking(content)
    },
    name: async () => {
      try {
        const response = await fetchFunction(`${baseUrl}/v1/models`, { signal: AbortSignal.timeout(2000) })
        if (!response.ok) return null
        return modelListSchema.parse(await response.json()).data[0]?.id ?? null
      } catch {
        return null
      }
    },
  }
}

/**
 * Removes a reasoning block some local models print before their answer.
 * @param content The model's reply.
 * @returns The answer alone.
 */
export const stripThinking = (content: string): string => content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
