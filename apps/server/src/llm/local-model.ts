import { z } from 'zod'

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type CompletionRequest = {
  messages: ChatMessage[]
  maxTokens: number
  jsonSchema?: Record<string, unknown>
}

const completionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })).min(1),
})

const modelListSchema = z.object({ data: z.array(z.object({ id: z.string() })) })

export type LocalModel = {
  complete: (request: CompletionRequest) => Promise<string>
  name: () => Promise<string | null>
}

/**
 * Talks to llama.cpp's OpenAI-compatible server on the internal network.
 * @param baseUrl Where the server listens.
 * @param fetchFunction The fetch to use, replaceable in tests.
 * @returns The client.
 */
export const createLocalModel = (baseUrl: string, fetchFunction: typeof fetch = fetch): LocalModel => ({
  complete: async (request) => {
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
      signal: AbortSignal.timeout(15 * 60_000),
    })
    if (!response.ok) throw new Error(`The local model answered ${response.status}: ${(await response.text()).slice(0, 300)}`)
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
})

/**
 * Removes a reasoning block some local models print before their answer.
 * @param content The model's reply.
 * @returns The answer alone.
 */
export const stripThinking = (content: string): string => content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
