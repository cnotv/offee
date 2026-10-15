import type { GatewayStatus, PendingRequest, SwitchMode } from '@offee/contracts'

export type AppPhase = 'checking' | 'needs-setup' | 'setting-up' | 'starting' | 'running' | 'stopping' | 'stopped' | 'failed'

export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'current' }
  | { status: 'available'; commit: string }
  | { status: 'installing' }
  | { status: 'notice'; message: string }

export type ControlState = {
  phase: AppPhase
  gateway: GatewayStatus | null
  hasAnthropicKey: boolean
  message: string | null
  buildCommit: string
  update: UpdateState
}

/** How this copy of the app was installed, which decides how it is updated. */
export type InstallKind = 'replace-app' | 'open-disk-image' | 'deb' | 'release-page' | 'source'

export type ReleaseAsset = {
  name: string
  url: string
  digest: string
}

export type AvailableUpdate = {
  commit: string
  asset: ReleaseAsset | null
}

export type Release = {
  commit: string
  assets: { name: string; url: string; digest: string | null }[]
}

export type SwitchRequest = { mode: Exclude<SwitchMode, 'open'> } | { mode: 'open'; minutes: number }

export type TrayAction =
  | { kind: 'open-offee' }
  | { kind: 'open-control' }
  | { kind: 'switch'; request: SwitchRequest }
  | { kind: 'review-requests' }
  | { kind: 'start' }
  | { kind: 'stop' }
  | { kind: 'show-log' }
  | { kind: 'check-update' }
  | { kind: 'quit' }

export type TrayEntry =
  | { type: 'separator' }
  | { type: 'label'; label: string }
  | { type: 'action'; label: string; action: TrayAction; enabled: boolean; checked?: boolean }

export type ApprovalPrompt = {
  title: string
  message: string
  detail: string
}

export type LauncherResult = {
  exitCode: number
  output: string
}

export type { GatewayStatus, PendingRequest }

/** What the control window may ask the main process to do; every call is validated there. */
export type ControlApi = {
  getState: () => Promise<ControlState>
  onState: (listener: (state: ControlState) => void) => void
  onLog: (listener: (line: string) => void) => void
  runSetup: () => Promise<void>
  start: () => Promise<void>
  stop: () => Promise<void>
  setSwitch: (request: SwitchRequest) => Promise<void>
  saveAnthropicKey: (key: string) => Promise<void>
  runSelftest: () => Promise<void>
  openOffee: () => Promise<void>
  checkForUpdate: () => Promise<void>
  installUpdate: () => Promise<void>
}
