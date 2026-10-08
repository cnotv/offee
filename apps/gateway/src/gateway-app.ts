import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import type { GatewayRefusalBody, GatewayStatus } from '@offee/contracts'
import type { ApprovalQueue } from './approvals.ts'
import { previewOf } from './approvals.ts'
import type { Destination } from './destinations.ts'
import { findDestination, isAllowedPath } from './destinations.ts'
import type { SwitchState } from './policy.ts'
import { currentState, decideForward } from './policy.ts'

export type OutboundRequest = {
  url: string
  headers: Record<string, string>
  body: string
}

export type OutboundResponse = {
  status: number
  contentType: string
  body: string
}

export type SendOutbound = (request: OutboundRequest) => Promise<OutboundResponse>

export type GatewayDependencies = {
  destinations: Destination[]
  readSwitch: () => SwitchState
  approvals: ApprovalQueue
  send: SendOutbound
  environment: Record<string, string | undefined>
  now: () => number
}

const maximumBodyBytes = 20 * 1024 * 1024
const routePrefix = '/to/'

/**
 * Describes the switch for the app's status bar.
 * @param dependencies The switch reader, approvals and clock.
 * @returns The status.
 */
export const gatewayStatusOf = (dependencies: Pick<GatewayDependencies, 'readSwitch' | 'approvals' | 'now'>): GatewayStatus => {
  const state = currentState(dependencies.readSwitch(), dependencies.now())
  return { mode: state.mode, openUntil: state.openUntil, pendingCount: dependencies.approvals.list().length }
}

/**
 * Splits `/to/<destination>/<path>` into the destination id and the path on that destination.
 * @param pathname The request path.
 * @returns The two parts, or null when the path has another shape.
 */
export const parseForwardPath = (pathname: string): { destinationId: string; path: string } | null => {
  if (!pathname.startsWith(routePrefix)) return null
  const rest = pathname.slice(routePrefix.length)
  const slashIndex = rest.indexOf('/')
  if (slashIndex <= 0) return null
  return { destinationId: rest.slice(0, slashIndex), path: rest.slice(slashIndex) }
}

/**
 * Keeps only the request headers a destination lists, so nothing the app adds (a fake key, a
 * tracking header) leaves the machine.
 * @param destination The destination.
 * @param incoming The request's headers.
 * @returns The headers to send, before the key is added.
 */
export const pickForwardedHeaders = (destination: Destination, incoming: Headers): Record<string, string> =>
  Object.fromEntries(
    destination.forwardedHeaders.flatMap((name) => {
      const value = incoming.get(name)
      return value === null ? [] : [[name, value]]
    }),
  )

/**
 * The gateway's HTTP side, reachable only from the internal network: the switch's status and
 * the route that lets a request out to a listed destination.
 * @param dependencies Destinations, switch, approvals, sender, environment and clock.
 * @returns The Hono app.
 */
export const createGatewayApp = (dependencies: GatewayDependencies): Hono => {
  const app = new Hono()

  app.get('/status', (context) => context.json(gatewayStatusOf(dependencies)))

  app.post(
    `${routePrefix}*`,
    bodyLimit({ maxSize: maximumBodyBytes, onError: (context) => context.json({ error: 'The body is too large' }, 413) }),
    async (context) => {
      const refuse = (refusal: GatewayRefusalBody) => context.json(refusal, 403)
      const target = parseForwardPath(new URL(context.req.url).pathname)
      const destination = target === null ? undefined : findDestination(dependencies.destinations, target.destinationId)
      if (target === null || destination === undefined || !isAllowedPath(destination, target.path)) {
        return refuse({ refusal: 'unknown-destination', detail: 'That destination or path is not listed' })
      }

      const key = dependencies.environment[destination.keyEnvironmentVariable]
      if (key === undefined || key.length === 0) {
        return refuse({ refusal: 'missing-key', detail: `No key is set for ${destination.id}. Run: offee key ${destination.id}` })
      }

      const body = await context.req.text()
      const decision = decideForward(currentState(dependencies.readSwitch(), dependencies.now()).mode)
      if (decision === 'refuse') {
        return refuse({ refusal: 'sealed', detail: 'The switch is sealed. Run: offee switch ask' })
      }

      const url = `${destination.baseUrl}${target.path}`
      if (decision === 'hold') {
        const outcome = await dependencies.approvals.hold({
          destination: destination.id,
          url,
          bodyBytes: Buffer.byteLength(body),
          bodyPreview: previewOf(body),
        })
        if (outcome === 'denied') return refuse({ refusal: 'denied', detail: 'The request was denied on the host' })
        if (outcome === 'timeout') return refuse({ refusal: 'timeout', detail: 'Nobody approved the request in time. Run: offee watch' })
      }

      const sent = await dependencies.send({
        url,
        headers: { ...pickForwardedHeaders(destination, context.req.raw.headers), [destination.keyHeader]: key },
        body,
      })
      return new Response(sent.body, { status: sent.status, headers: { 'content-type': sent.contentType } })
    },
  )

  return app
}

/**
 * Sends a request with fetch and passes the answer back unchanged.
 * @param request The prepared request.
 * @returns The status, content type and body.
 */
export const sendWithFetch: SendOutbound = async (request) => {
  const response = await fetch(request.url, { method: 'POST', headers: request.headers, body: request.body })
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? 'application/octet-stream',
    body: await response.text(),
  }
}
