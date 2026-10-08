export type Settings = {
  dataDirectory: string
  configDirectory: string
  webDistDirectory: string
  port: number
  allowedHostNames: string[]
  chatModelUrl: string
  transcriptionUrl: string
  gatewayUrl: string
  remoteModel: string
}

/**
 * Reads the server's settings from its environment, with the values the Compose file uses
 * as defaults.
 * @param environment The process environment.
 * @param workspaceRoot The repository root, for the config and web folders.
 * @returns The settings.
 */
export const readSettings = (environment: Record<string, string | undefined>, workspaceRoot: string): Settings => ({
  dataDirectory: environment.OFFEE_DATA_DIR ?? '/data',
  configDirectory: environment.OFFEE_CONFIG_DIR ?? `${workspaceRoot}config`,
  webDistDirectory: environment.OFFEE_WEB_DIST ?? `${workspaceRoot}apps/web/dist`,
  port: Number(environment.OFFEE_PORT ?? '8470'),
  allowedHostNames: (environment.OFFEE_ALLOWED_HOSTS ?? 'localhost,127.0.0.1').split(',').map((name) => name.trim()),
  chatModelUrl: environment.OFFEE_CHAT_MODEL_URL ?? 'http://inference:8080',
  transcriptionUrl: environment.OFFEE_TRANSCRIPTION_URL ?? 'http://transcription:8090',
  gatewayUrl: environment.OFFEE_GATEWAY_URL ?? 'http://gateway:8480',
  remoteModel: environment.OFFEE_REMOTE_MODEL ?? 'claude-opus-5-5',
})

/**
 * Whether a Host header names this server. Loopback binding alone does not stop DNS
 * rebinding, so every request is checked.
 * @param hostHeader The Host header, with or without a port.
 * @param allowedHostNames The names accepted.
 * @returns True when the name is allowed.
 */
export const isAllowedHostHeader = (hostHeader: string | undefined, allowedHostNames: string[]): boolean => {
  if (hostHeader === undefined) return false
  const hostName = hostHeader.startsWith('[') ? hostHeader.slice(0, hostHeader.indexOf(']') + 1) : (hostHeader.split(':')[0] ?? '')
  return allowedHostNames.includes(hostName.toLowerCase())
}

/**
 * Whether a mutation comes from a page served by this server.
 * @param originHeader The Origin header.
 * @param hostHeader The Host header.
 * @returns True when the origin's host equals the Host header.
 */
export const isSameOriginRequest = (originHeader: string | undefined, hostHeader: string | undefined): boolean => {
  if (originHeader === undefined || hostHeader === undefined) return false
  try {
    return new URL(originHeader).host === hostHeader
  } catch {
    return false
  }
}
