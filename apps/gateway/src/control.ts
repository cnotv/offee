import { createServer, type Server } from 'node:net'
import { chmodSync, rmSync } from 'node:fs'
import { z } from 'zod'
import type { GatewayStatus, PendingRequest } from '@offee/contracts'
import type { ApprovalQueue } from './approvals.ts'
import type { SwitchState } from './policy.ts'
import { openFor, sealedState } from './policy.ts'

export const controlCommandSchema = z.discriminatedUnion('command', [
  z.object({ command: z.literal('status') }),
  z.object({ command: z.literal('seal') }),
  z.object({ command: z.literal('ask') }),
  z.object({ command: z.literal('open'), minutes: z.number().positive() }),
  z.object({ command: z.literal('pending') }),
  z.object({ command: z.literal('approve'), id: z.string().min(1) }),
  z.object({ command: z.literal('deny'), id: z.string().min(1) }),
])

export type ControlCommand = z.infer<typeof controlCommandSchema>

export type ControlReply =
  | { ok: true; status: GatewayStatus }
  | { ok: true; pending: PendingRequest[] }
  | { ok: true; decided: boolean }
  | { ok: false; error: string }

export type ControlDependencies = {
  writeSwitch: (state: SwitchState) => void
  approvals: ApprovalQueue
  status: () => GatewayStatus
  now: () => number
}

/**
 * Carries out one command from the host. Sealing also denies whatever is waiting.
 * @param command The parsed command.
 * @param dependencies The switch writer, approvals, status reader and clock.
 * @returns The reply to send back.
 */
export const runControlCommand = (command: ControlCommand, dependencies: ControlDependencies): ControlReply => {
  switch (command.command) {
    case 'status':
      return { ok: true, status: dependencies.status() }
    case 'seal':
      dependencies.writeSwitch(sealedState)
      dependencies.approvals.denyAll()
      return { ok: true, status: dependencies.status() }
    case 'ask':
      dependencies.writeSwitch({ mode: 'ask', openUntil: null })
      return { ok: true, status: dependencies.status() }
    case 'open':
      dependencies.writeSwitch(openFor(command.minutes, dependencies.now()))
      return { ok: true, status: dependencies.status() }
    case 'pending':
      return { ok: true, pending: dependencies.approvals.list() }
    case 'approve':
      return { ok: true, decided: dependencies.approvals.decide(command.id, 'approved') }
    case 'deny':
      return { ok: true, decided: dependencies.approvals.decide(command.id, 'denied') }
  }
}

/**
 * Parses a line from the socket and runs it.
 * @param line One JSON command.
 * @param dependencies What the command acts on.
 * @returns The reply.
 */
export const handleControlLine = (line: string, dependencies: ControlDependencies): ControlReply => {
  const parsed = controlCommandSchema.safeParse((() => {
    try {
      return JSON.parse(line)
    } catch {
      return null
    }
  })())
  return parsed.success ? runControlCommand(parsed.data, dependencies) : { ok: false, error: 'Unknown command' }
}

/**
 * Listens on a Unix socket inside the gateway container. Only `docker exec` from the host
 * reaches it; the app container has no way in, so it can never change the switch.
 * @param socketPath Where the socket lives.
 * @param dependencies What commands act on.
 * @returns The server.
 */
export const startControlServer = (socketPath: string, dependencies: ControlDependencies): Server => {
  rmSync(socketPath, { force: true })
  const server = createServer((connection) => {
    const chunks: Buffer[] = []
    connection.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
      const received = Buffer.concat(chunks).toString('utf8')
      if (!received.includes('\n')) return
      const reply = handleControlLine(received.split('\n')[0] ?? '', dependencies)
      connection.end(`${JSON.stringify(reply)}\n`)
    })
  })
  server.listen(socketPath, () => chmodSync(socketPath, 0o600))
  return server
}
