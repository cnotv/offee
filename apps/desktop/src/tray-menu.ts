import { switchLabel } from './gateway-replies.ts'
import type { AppPhase, GatewayStatus, TrayEntry } from './types.ts'

const phaseLabels: Record<AppPhase, string> = {
  checking: 'Checking…',
  'needs-setup': 'Not set up yet',
  'setting-up': 'Setting up…',
  starting: 'Starting…',
  running: 'Running',
  stopping: 'Stopping…',
  stopped: 'Stopped',
  failed: 'Needs attention',
}

/**
 * The menu bar menu for the app's state. Pure, so what each state offers is tested.
 * @param phase Where the app is.
 * @param gateway The switch's status, when running.
 * @param now The current time.
 * @returns The entries, top to bottom.
 */
export const trayEntries = (phase: AppPhase, gateway: GatewayStatus | null, now: number): TrayEntry[] => {
  const running = phase === 'running' && gateway !== null
  const mode = gateway?.mode
  const switchEntries: TrayEntry[] = running
    ? [
        { type: 'label', label: `Switch: ${switchLabel(gateway, now)}` },
        { type: 'action', label: 'Sealed', action: { kind: 'switch', request: { mode: 'sealed' } }, enabled: true, checked: mode === 'sealed' },
        { type: 'action', label: 'Ask before each request', action: { kind: 'switch', request: { mode: 'ask' } }, enabled: true, checked: mode === 'ask' },
        { type: 'action', label: 'Open for 15 minutes', action: { kind: 'switch', request: { mode: 'open', minutes: 15 } }, enabled: true, checked: false },
        { type: 'action', label: 'Open for 1 hour', action: { kind: 'switch', request: { mode: 'open', minutes: 60 } }, enabled: true, checked: false },
        ...(gateway.pendingCount > 0
          ? [{ type: 'action', label: `Review ${gateway.pendingCount} waiting request(s)…`, action: { kind: 'review-requests' }, enabled: true } satisfies TrayEntry]
          : []),
        { type: 'separator' },
      ]
    : []

  return [
    { type: 'label', label: `Offee: ${phaseLabels[phase]}` },
    { type: 'separator' },
    ...switchEntries,
    { type: 'action', label: 'Open Offee', action: { kind: 'open-offee' }, enabled: running },
    { type: 'action', label: 'Settings and setup…', action: { kind: 'open-control' }, enabled: true },
    phase === 'running'
      ? { type: 'action', label: 'Stop Offee', action: { kind: 'stop' }, enabled: true }
      : { type: 'action', label: 'Start Offee', action: { kind: 'start' }, enabled: phase === 'stopped' || phase === 'failed' },
    { type: 'action', label: 'Show log file', action: { kind: 'show-log' }, enabled: true },
    { type: 'separator' },
    { type: 'action', label: 'Quit', action: { kind: 'quit' }, enabled: true },
  ]
}
