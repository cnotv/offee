import { describe, expect, it } from 'vitest'
import { createLocalModel } from './local-model.ts'

const loading = () => new Response(JSON.stringify({ error: { message: 'Loading model', type: 'unavailable_error', code: 503 } }), { status: 503 })
// llama.cpp streams an answer as server-sent events, one piece of text per event.
const streamed = (pieces: string[]) =>
  new Response([...pieces.map((piece) => `data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`), 'data: [DONE]\n\n'].join(''), {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
const answer = (content: string) => streamed([content])

const fetchAnswering = (responses: (() => Response)[]) => {
  const calls = { count: 0, bodies: [] as unknown[] }
  const fetchFunction = async (_url: string, init?: RequestInit): Promise<Response> => {
    const next = responses[Math.min(calls.count, responses.length - 1)]
    calls.count += 1
    calls.bodies.push(JSON.parse(String(init?.body ?? 'null')))
    if (next === undefined) throw new Error('No response given')
    return next()
  }
  return { fetchFunction: fetchFunction as typeof fetch, calls }
}

const request = { messages: [{ role: 'user' as const, content: 'Hello' }], maxTokens: 16, signal: new AbortController().signal }

describe('the local model', () => {
  it('asks for a streamed answer, so a long one is not dropped, and puts its pieces together', async () => {
    const { fetchFunction, calls } = fetchAnswering([() => streamed(['<think>plan</think>', 'Hel', 'lo ', 'there'])])
    const model = createLocalModel('http://inference:8080', fetchFunction)
    expect(await model.complete(request)).toBe('Hello there')
    expect(calls.bodies[0]).toMatchObject({ stream: true, chat_template_kwargs: { enable_thinking: false } })
  })

  it('waits while the model is still loading, then answers', async () => {
    const { fetchFunction, calls } = fetchAnswering([loading, loading, () => answer('Hi')])
    const model = createLocalModel('http://inference:8080', fetchFunction, { loadingRetryDelayMs: 0, loadingRetryLimit: 5 })
    expect(await model.complete(request)).toBe('Hi')
    expect(calls.count).toBe(3)
  })

  it('gives up once the model has been loading for too long', async () => {
    const { fetchFunction, calls } = fetchAnswering([loading])
    const model = createLocalModel('http://inference:8080', fetchFunction, { loadingRetryDelayMs: 0, loadingRetryLimit: 2 })
    await expect(model.complete(request)).rejects.toThrow('The local model is still loading')
    expect(calls.count).toBe(3)
  })

  it('fails at once on any other error', async () => {
    const { fetchFunction, calls } = fetchAnswering([() => new Response('broken', { status: 500 })])
    const model = createLocalModel('http://inference:8080', fetchFunction, { loadingRetryDelayMs: 0, loadingRetryLimit: 5 })
    await expect(model.complete(request)).rejects.toThrow('The local model answered 500: broken')
    expect(calls.count).toBe(1)
  })
})
