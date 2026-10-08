import { describe, expect, it } from 'vitest'
import { createApprovalQueue } from './approvals.ts'
import { handleControlLine } from './control.ts'
import type { Destination } from './destinations.ts'
import type { OutboundRequest } from './gateway-app.ts'
import { createGatewayApp, gatewayStatusOf, parseForwardPath } from './gateway-app.ts'
import type { SwitchState } from './policy.ts'
import { currentState, openFor, sealedState } from './policy.ts'

const anthropic: Destination = {
  id: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  allowedPaths: ['/v1/messages'],
  forwardedHeaders: ['content-type', 'anthropic-version'],
  keyHeader: 'x-api-key',
  keyEnvironmentVariable: 'ANTHROPIC_API_KEY',
}

const setUp = (initial: SwitchState, environment: Record<string, string | undefined> = { ANTHROPIC_API_KEY: 'sk-real' }) => {
  const holder = { state: initial }
  const sent: OutboundRequest[] = []
  const now = () => 1_000_000
  const approvals = createApprovalQueue({ now, timeoutMilliseconds: 200 })
  const app = createGatewayApp({
    destinations: [anthropic],
    readSwitch: () => holder.state,
    approvals,
    send: async (request) => {
      sent.push(request)
      return { status: 200, contentType: 'application/json', body: '{"answer":42}' }
    },
    environment,
    now,
  })
  const control = (line: string) =>
    handleControlLine(line, {
      writeSwitch: (state) => {
        holder.state = state
      },
      approvals,
      status: () => gatewayStatusOf({ readSwitch: () => holder.state, approvals, now }),
      now,
    })
  return { app, sent, approvals, control }
}

const post = (app: ReturnType<typeof setUp>['app'], path = '/to/anthropic/v1/messages') =>
  app.request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': 'fake-from-app', 'x-tracking': 'nope' },
    body: '{"model":"claude-opus-5-5"}',
  })

describe('the switch', () => {
  it('counts an open switch whose time ran out as sealed', () => {
    expect(currentState(openFor(5, 0), 5 * 60_000)).toEqual(sealedState)
    expect(currentState(openFor(5, 0), 60_000).mode).toBe('open')
  })

  it('splits a forward path into destination and path', () => {
    expect(parseForwardPath('/to/anthropic/v1/messages')).toEqual({ destinationId: 'anthropic', path: '/v1/messages' })
    expect(parseForwardPath('/to/anthropic')).toBeNull()
    expect(parseForwardPath('/elsewhere')).toBeNull()
  })
})

describe('forwarding', () => {
  it('refuses everything while sealed', async () => {
    const { app, sent } = setUp(sealedState)
    const response = await post(app)
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ refusal: 'sealed' })
    expect(sent).toHaveLength(0)
  })

  it('refuses a path the destination does not list', async () => {
    const { app, sent } = setUp(openFor(10, 1_000_000))
    const response = await post(app, '/to/anthropic/v1/files')
    expect(await response.json()).toMatchObject({ refusal: 'unknown-destination' })
    expect(sent).toHaveLength(0)
  })

  it('refuses when no key is set', async () => {
    const { app } = setUp(openFor(10, 1_000_000), {})
    expect(await (await post(app)).json()).toMatchObject({ refusal: 'missing-key' })
  })

  it('sends when open, with the real key and only the listed headers', async () => {
    const { app, sent } = setUp(openFor(10, 1_000_000))
    const response = await post(app)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ answer: 42 })
    expect(sent[0]?.url).toBe('https://api.anthropic.com/v1/messages')
    expect(sent[0]?.headers).toEqual({ 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': 'sk-real' })
  })

  it('holds a request in ask mode until the host approves it', async () => {
    const { app, sent, approvals, control } = setUp({ mode: 'ask', openUntil: null })
    const pending = post(app)
    await new Promise((resolve) => setTimeout(resolve, 10))
    const [waiting] = approvals.list()
    expect(waiting?.bodyPreview).toBe('{"model":"claude-opus-5-5"}')
    expect(sent).toHaveLength(0)
    control(JSON.stringify({ command: 'approve', id: waiting?.id }))
    expect((await pending).status).toBe(200)
    expect(sent).toHaveLength(1)
  })

  it('refuses a request the host denies, and one nobody answers', async () => {
    const { app, approvals, control } = setUp({ mode: 'ask', openUntil: null })
    const denied = post(app)
    await new Promise((resolve) => setTimeout(resolve, 10))
    control(JSON.stringify({ command: 'deny', id: approvals.list()[0]?.id }))
    expect(await (await denied).json()).toMatchObject({ refusal: 'denied' })
    expect(await (await post(app)).json()).toMatchObject({ refusal: 'timeout' })
  })

  it('denies whatever is waiting when the host seals the switch', async () => {
    const { app, control } = setUp({ mode: 'ask', openUntil: null })
    const pending = post(app)
    await new Promise((resolve) => setTimeout(resolve, 10))
    control('{"command":"seal"}')
    expect(await (await pending).json()).toMatchObject({ refusal: 'denied' })
  })

  it('ignores commands it does not know', () => {
    const { control } = setUp(sealedState)
    expect(control('{"command":"open-forever"}')).toEqual({ ok: false, error: 'Unknown command' })
    expect(control('not json')).toEqual({ ok: false, error: 'Unknown command' })
  })
})

describe('an unreachable provider', () => {
  it('answers 502 with a refusal that carries no request detail', async () => {
    const app = createGatewayApp({
      destinations: [anthropic],
      readSwitch: () => openFor(10, 0),
      approvals: createApprovalQueue({ now: () => 0, timeoutMilliseconds: 100 }),
      send: async () => {
        throw new Error('getaddrinfo ENOTFOUND api.anthropic.com with sk-real')
      },
      environment: { ANTHROPIC_API_KEY: 'sk-real' },
      now: () => 0,
    })
    const response = await post(app)
    expect(response.status).toBe(502)
    const text = await response.text()
    expect(text).toContain('"unreachable"')
    expect(text).not.toContain('sk-real')
  })
})
