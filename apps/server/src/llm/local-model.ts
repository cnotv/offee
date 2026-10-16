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

const streamEventSchema = z.object({
  choices: z.array(z.object({ delta: z.object({ content: z.string().nullish() }) })),
})

/**
 * Puts a streamed answer back together from llama.cpp's server-sent events.
 * @param events The response body: `data:` lines, each a piece of the answer, then `data: [DONE]`.
 * @returns The answer's text.
 */
export const textOfStream = (events: string): string =>
  events
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice('data:'.length).trim())
    .filter((data) => data !== '[DONE]')
    .map((data) => streamEventSchema.parse(JSON.parse(data)).choices[0]?.delta.content ?? '')
    .join('')

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
        // Streamed, the headers come at once: fetch drops a response whose headers take more than
        // five minutes, and a long answer on a slow machine takes longer than that to write.
        stream: true,
        // Gemma thinks before a long task, out of sight in reasoning_content, and spent the whole
        // token budget there on a form's labels, leaving the answer empty. Offee's tasks are
        // short readings and drafts, so the model answers straight away.
        chat_template_kwargs: { enable_thinking: false },
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
      return stripThinking(textOfStream(await response.text()))
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
