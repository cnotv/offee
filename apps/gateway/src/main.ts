import { serve } from '@hono/node-server'
import { createApprovalQueue } from './approvals.ts'
import { startControlServer } from './control.ts'
import { loadDestinations } from './destinations.ts'
import { createGatewayApp, gatewayStatusOf, sendWithFetch } from './gateway-app.ts'
import type { SwitchState } from './policy.ts'
import { sealedState } from './policy.ts'

const destinationsFile = process.env.OFFEE_GATEWAY_DESTINATIONS ?? '/app/config/gateway-destinations.json'
const controlSocket = process.env.OFFEE_GATEWAY_CONTROL_SOCKET ?? '/run/offee/control.sock'
const port = Number(process.env.OFFEE_GATEWAY_PORT ?? '8480')

// The switch starts sealed on every start: a restart can only ever close it.
const switchHolder: { state: SwitchState } = { state: sealedState }
const now = () => Date.now()
const approvals = createApprovalQueue({ now, timeoutMilliseconds: 5 * 60_000 })
const readSwitch = () => switchHolder.state

const app = createGatewayApp({
  destinations: loadDestinations(destinationsFile),
  readSwitch,
  approvals,
  send: sendWithFetch,
  environment: process.env,
  now,
})

startControlServer(controlSocket, {
  writeSwitch: (state) => {
    switchHolder.state = state
  },
  approvals,
  status: () => gatewayStatusOf({ readSwitch, approvals, now }),
  now,
})

serve({ fetch: app.fetch, hostname: '0.0.0.0', port }, () => {
  process.stdout.write(`offee gateway: listening on ${port}, switch sealed\n`)
})
