import { describe, expect, it } from 'vitest'
import { createHostedModelProxy, hostedRequestBody } from './hosted-model.ts'

const chatRequest = (body: unknown): Request =>
  new Request('http://127.0.0.1:18080/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

describe('the hosted model proxy', () => {
  it('names the model and drops the llama.cpp template switches', () => {
    expect(hostedRequestBody({ messages: [], stream: true, chat_template_kwargs: { enable_thinking: false } }, 'gemma')).toEqual({
      messages: [],
      stream: true,
      model: 'gemma',
    })
  })

  it('adds the key on the way out and streams the answer back', async () => {
    const sent: { url: string; init: RequestInit | undefined }[] = []
    const proxy = createHostedModelProxy({
      baseUrl: 'https://provider.example/v1',
      apiKey: 'test-key',
      model: 'gemma',
      fetchFunction: async (url, init) => {
        sent.push({ url: String(url), init })
        return new Response('data: [DONE]\n', { headers: { 'content-type': 'text/event-stream' } })
      },
    })
    const response = await proxy(chatRequest({ messages: [{ role: 'user', content: 'Hi' }] }))
    expect(await response.text()).toBe('data: [DONE]\n')
    expect(sent[0]?.url).toBe('https://provider.example/v1/chat/completions')
    expect(new Headers(sent[0]?.init?.headers).get('authorization')).toBe('Bearer test-key')
    expect(JSON.parse(String(sent[0]?.init?.body))).toMatchObject({ model: 'gemma' })
  })

  it('waits out a rate limit and asks again', async () => {
    const answers = [new Response('slow down', { status: 429, headers: { 'retry-after': '0' } }), new Response('data: [DONE]\n')]
    const proxy = createHostedModelProxy({
      baseUrl: 'https://provider.example/v1',
      apiKey: 'test-key',
      model: 'gemma',
      rateLimitDelayMs: 1,
      fetchFunction: async () => answers.shift() ?? new Response('', { status: 500 }),
    })
    const response = await proxy(chatRequest({ messages: [] }))
    expect(response.status).toBe(200)
    expect(answers).toEqual([])
  })

  it('answers the health and model checks itself', async () => {
    const proxy = createHostedModelProxy({ baseUrl: 'https://provider.example/v1', apiKey: 'test-key', model: 'gemma', fetchFunction: async () => new Response('', { status: 500 }) })
    expect((await proxy(new Request('http://127.0.0.1:18080/health'))).status).toBe(200)
    expect(await (await proxy(new Request('http://127.0.0.1:18080/v1/models'))).json()).toEqual({ data: [{ id: 'gemma' }] })
  })
})
