// The settings window's only way to the main process. The Offee window gets no preload at all.
import { contextBridge, ipcRenderer } from 'electron'
import { z } from 'zod'
import type { ControlApi, ControlState, SwitchRequest } from './types.ts'

const stateSchema = z.object({
  phase: z.enum(['checking', 'needs-setup', 'setting-up', 'starting', 'running', 'stopping', 'stopped', 'failed']),
  gateway: z.object({ mode: z.enum(['sealed', 'ask', 'open']), openUntil: z.number().nullable(), pendingCount: z.number() }).nullable(),
  hasAnthropicKey: z.boolean(),
  message: z.string().nullable(),
})

const readState = (value: unknown): ControlState => stateSchema.parse(value)

const invoke = async (channel: string, payload?: unknown): Promise<void> => {
  await ipcRenderer.invoke(channel, payload)
}

const api: ControlApi = {
  getState: async () => readState(await ipcRenderer.invoke('offee:get-state')),
  onState: (listener) => {
    ipcRenderer.on('offee:state', (_event, state: unknown) => listener(readState(state)))
  },
  onLog: (listener) => {
    ipcRenderer.on('offee:log', (_event, line: unknown) => listener(typeof line === 'string' ? line : ''))
  },
  runSetup: () => invoke('offee:setup'),
  start: () => invoke('offee:start'),
  stop: () => invoke('offee:stop'),
  setSwitch: (request: SwitchRequest) => invoke('offee:switch', request),
  saveAnthropicKey: (key: string) => invoke('offee:save-key', key),
  runSelftest: () => invoke('offee:selftest'),
  openOffee: () => invoke('offee:open-offee'),
}

contextBridge.exposeInMainWorld('offeeControl', api)
