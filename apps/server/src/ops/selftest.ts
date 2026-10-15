import { lookup } from 'node:dns/promises'
import { readFileSync } from 'node:fs'
import { connect } from 'node:net'

// Run inside the app container by `offee selftest`. Every check tries to break out; a check
// passes when the attempt fails.

type Check = { name: string; run: () => Promise<boolean> }

const failsWithin = async (attempt: () => Promise<unknown>, milliseconds = 5000): Promise<boolean> => {
  try {
    await Promise.race([attempt(), new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), milliseconds))])
    return false
  } catch {
    return true
  }
}

const tcpConnect = (host: string, port: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const socket = connect({ host, port })
    socket.setTimeout(5000, () => socket.destroy(new Error('timeout')))
    socket.once('connect', () => {
      socket.destroy()
      resolve()
    })
    socket.once('error', reject)
  })

const hostMountTypes = ['virtiofs', '9p', 'fuse.sshfs', 'fuse.grpcfuse', 'osxfs']

const checks: Check[] = [
  { name: 'cannot resolve internet names', run: () => failsWithin(() => lookup('example.com')) },
  { name: 'cannot reach the internet by name', run: () => failsWithin(() => fetch('https://example.com', { signal: AbortSignal.timeout(5000) })) },
  { name: 'cannot reach the internet by address', run: () => failsWithin(() => tcpConnect('1.1.1.1', 443)) },
  { name: 'cannot reach the host (host.docker.internal)', run: () => failsWithin(() => tcpConnect('host.docker.internal', 22)) },
  { name: 'cannot reach the host (host.lima.internal)', run: () => failsWithin(() => tcpConnect('host.lima.internal', 22)) },
  { name: 'cannot reach the VM host address', run: () => failsWithin(() => tcpConnect('192.168.5.2', 22)) },
  {
    name: 'has no folder shared from the host',
    run: async () =>
      !readFileSync('/proc/self/mountinfo', 'utf8')
        .split('\n')
        .some((line) => hostMountTypes.includes(line.split(' - ')[1]?.split(' ')[0] ?? '')),
  },
  { name: 'holds no API key', run: async () => !Object.keys(process.env).some((name) => /API_KEY|TOKEN|SECRET/i.test(name)) },
]

const gatewayCheck: Check = {
  name: 'cannot get a request past the sealed gateway',
  run: async () => {
    const response = await fetch(`${process.env.OFFEE_GATEWAY_URL ?? 'http://gateway:8480'}/to/anthropic/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(5000),
    })
    const body = await response.text()
    return response.status === 403 && (body.includes('"sealed"') || body.includes('"missing-key"'))
  },
}

const runCheck = async (check: Check) => ({ name: check.name, passed: await check.run().catch(() => false) })

// The gateway goes first: the escape attempts' stalled name lookups fill Node's four resolver
// threads, and the gateway's own lookup would queue behind them past its timeout.
const gatewayResult = await runCheck(gatewayCheck)
const results = [...(await Promise.all(checks.map(runCheck))), gatewayResult]
results.forEach((result) => process.stdout.write(`  ${result.passed ? 'ok  ' : 'FAIL'} the app ${result.name}\n`))
// A connection still stalling in the background must not keep the check running.
process.exit(results.some((result) => !result.passed) ? 1 : 0)
