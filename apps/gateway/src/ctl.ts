import { connect } from 'node:net'
import { createInterface } from 'node:readline/promises'
import { z } from 'zod'
import type { GatewayStatus, PendingRequest } from '@offee/contracts'
import type { ControlCommand } from './control.ts'

// Run on the host through `docker exec`, so it is the host, never the app, that changes the
// switch or approves a request.

const socketPath = process.env.OFFEE_GATEWAY_CONTROL_SOCKET ?? '/run/offee/control.sock'

const statusSchema = z.object({ mode: z.enum(['sealed', 'ask', 'open']), openUntil: z.number().nullable(), pendingCount: z.number() })
const pendingSchema = z.object({
  id: z.string(),
  destination: z.string(),
  url: z.string(),
  createdAt: z.number(),
  bodyBytes: z.number(),
  bodyPreview: z.string(),
})
const replySchema = z.union([
  z.object({ ok: z.literal(true), status: statusSchema }),
  z.object({ ok: z.literal(true), pending: z.array(pendingSchema) }),
  z.object({ ok: z.literal(true), decided: z.boolean() }),
  z.object({ ok: z.literal(false), error: z.string() }),
])

type Reply = z.infer<typeof replySchema>

const send = (command: ControlCommand): Promise<Reply> =>
  new Promise((resolve, reject) => {
    const socket = connect(socketPath)
    const chunks: Buffer[] = []
    socket.on('connect', () => socket.write(`${JSON.stringify(command)}\n`))
    socket.on('data', (chunk: Buffer) => chunks.push(chunk))
    socket.on('error', reject)
    socket.on('end', () => {
      try {
        resolve(replySchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8'))))
      } catch (error) {
        reject(error)
      }
    })
  })

const describeStatus = (status: GatewayStatus): string => {
  if (status.mode === 'open' && status.openUntil !== null) {
    const minutesLeft = Math.max(0, Math.ceil((status.openUntil - Date.now()) / 60_000))
    return `open for ${minutesLeft} more minute(s), ${status.pendingCount} waiting`
  }
  return `${status.mode}, ${status.pendingCount} waiting`
}

const printReply = (reply: Reply): void => {
  if (!reply.ok) {
    process.stderr.write(`${reply.error}\n`)
    process.exitCode = 1
    return
  }
  if ('status' in reply) process.stdout.write(`Switch: ${describeStatus(reply.status)}\n`)
  if ('pending' in reply) process.stdout.write(`${reply.pending.length} request(s) waiting\n`)
  if ('decided' in reply) process.stdout.write(reply.decided ? 'Done\n' : 'No such request (it may have timed out)\n')
}

const describePending = (request: PendingRequest): string =>
  [
    '',
    `Request to ${request.destination} (${request.url})`,
    `${request.bodyBytes} bytes, waiting since ${new Date(request.createdAt).toLocaleTimeString()}`,
    '----- what would be sent -----',
    request.bodyPreview,
    '------------------------------',
  ].join('\n')

const askAbout = async (requests: PendingRequest[]): Promise<void> => {
  const [first, ...rest] = requests
  if (first === undefined) return
  process.stdout.write(`${describePending(first)}\n`)
  const prompt = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await prompt.question('Send it? [y/N] ')
  prompt.close()
  const approved = answer.trim().toLowerCase().startsWith('y')
  printReply(await send({ command: approved ? 'approve' : 'deny', id: first.id }))
  await askAbout(rest)
}

const watchForApprovals = async (): Promise<void> => {
  const reply = await send({ command: 'pending' })
  if (reply.ok && 'pending' in reply) await askAbout(reply.pending)
  await new Promise((resolve) => setTimeout(resolve, 1000))
  await watchForApprovals()
}

const [verb, argument] = process.argv.slice(2)

const commandFor = (): ControlCommand | 'watch' | undefined => {
  if (verb === 'status' || verb === 'seal' || verb === 'ask' || verb === 'pending') return { command: verb }
  if (verb === 'open') return { command: 'open', minutes: Number(argument ?? '15') }
  if ((verb === 'approve' || verb === 'deny') && argument !== undefined) return { command: verb, id: argument }
  if (verb === 'watch') return 'watch'
  return undefined
}

const command = commandFor()
if (command === undefined) {
  process.stderr.write('Usage: ctl status | seal | ask | open <minutes> | pending | approve <id> | deny <id> | watch\n')
  process.exitCode = 2
} else if (command === 'watch') {
  process.stdout.write('Watching for requests that need approval. Ctrl-C to stop.\n')
  await watchForApprovals()
} else {
  printReply(await send(command))
}
