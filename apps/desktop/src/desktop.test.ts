import { describe, expect, it } from 'vitest'
import { approvalPromptFor, parsePendingReply, parseStatusReply, requestsToAsk, switchLabel } from './gateway-replies.ts'
import { describeFailure } from './setup-messages.ts'
import { trayEntries } from './tray-menu.ts'
import { isAllowedRequestUrl, isOffeeUrl, isPermissionAllowed, pathWithHomebrew, progressAsLines } from './window-policy.ts'

const request = (id: string, createdAt: number) => ({
  id,
  destination: 'anthropic',
  url: 'https://api.anthropic.com/v1/messages',
  createdAt,
  bodyBytes: 1234,
  bodyPreview: '{"model":"claude-opus-5-5"}',
})

describe('reading the gateway', () => {
  it('reads the status and the waiting requests from the JSON line, ignoring other output', () => {
    expect(parseStatusReply('warning: something\n{"ok":true,"status":{"mode":"ask","openUntil":null,"pendingCount":1}}\n')).toEqual({
      mode: 'ask',
      openUntil: null,
      pendingCount: 1,
    })
    expect(parseStatusReply('Error: No such container: offee-gateway-1')).toBeNull()
    expect(parsePendingReply(JSON.stringify({ ok: true, pending: [request('a', 1)] }))).toHaveLength(1)
    expect(parsePendingReply('{"ok":true,"pending":[{"id":1}]}')).toEqual([])
  })

  it('asks about each request once, oldest first', () => {
    expect(requestsToAsk([request('b', 2), request('a', 1), request('c', 3)], new Set(['c'])).map((entry) => entry.id)).toEqual(['a', 'b'])
  })

  it('shows where a request goes and exactly what it carries', () => {
    const prompt = approvalPromptFor(request('a', 1))
    expect(prompt.message).toBe('Send this request to anthropic?')
    expect(prompt.detail).toContain('https://api.anthropic.com/v1/messages')
    expect(prompt.detail).toContain('1,234 bytes')
    expect(prompt.detail).toContain('{"model":"claude-opus-5-5"}')
  })

  it('labels the switch', () => {
    expect(switchLabel(null, 0)).toBe('Not running')
    expect(switchLabel({ mode: 'ask', openUntil: null, pendingCount: 2 }, 0)).toBe('Ask (2 waiting)')
    expect(switchLabel({ mode: 'open', openUntil: 10 * 60_000, pendingCount: 0 }, 60_000)).toBe('Open, 9 min left')
  })
})

describe('the menu bar', () => {
  const labels = (entries: ReturnType<typeof trayEntries>) => entries.flatMap((entry) => (entry.type === 'separator' ? [] : [entry.label]))

  it('offers the switch only while running', () => {
    const running = trayEntries('running', { mode: 'sealed', openUntil: null, pendingCount: 0 }, 0)
    expect(labels(running)).toContain('Ask before each request')
    expect(running.find((entry) => entry.type === 'action' && entry.label === 'Sealed')).toMatchObject({ checked: true })
    expect(labels(trayEntries('needs-setup', null, 0))).not.toContain('Ask before each request')
  })

  it('offers to review waiting requests', () => {
    expect(labels(trayEntries('running', { mode: 'ask', openUntil: null, pendingCount: 2 }, 0))).toContain('Review 2 waiting request(s)…')
  })

  it('stops a setup, a start or a failed attempt, which can all leave the VM running', () => {
    expect(labels(trayEntries('setting-up', null, 0))).toContain('Cancel setup')
    expect(labels(trayEntries('starting', null, 0))).toContain('Stop Offee')
    expect(labels(trayEntries('failed', null, 0))).toEqual(expect.arrayContaining(['Start Offee', 'Stop Offee']))
    expect(labels(trayEntries('needs-setup', null, 0))).not.toContain('Stop Offee')
  })

  it('opens Offee only when it runs', () => {
    const openEntry = trayEntries('stopped', null, 0).find((entry) => entry.type === 'action' && entry.label === 'Open Offee')
    expect(openEntry).toMatchObject({ enabled: false })
  })
})

describe('explaining a failed setup', () => {
  it('lists every failed machine check', () => {
    const output = 'Checking this machine\n  ok    32 GB of memory\n  FAIL  Setup needs 25 GB free on disk; there are 12 GB\n  FAIL  cannot reach ghcr.io\noffee: Fix the 2 problem(s) above'
    expect(describeFailure(output, '/log')).toBe('This Mac is not ready for Offee yet:\n• Setup needs 25 GB free on disk; there are 12 GB\n• cannot reach ghcr.io')
  })

  it("gives the launcher's own reason, and the log", () => {
    expect(describeFailure('Starting\noffee: Offee is not set up on this machine: its VM is missing. Run setup\n', '/log')).toBe(
      'Offee is not set up on this machine: its VM is missing. Run setup\nThe full log is in /log.',
    )
    expect(describeFailure('compose failed', '/log')).toBe('Something failed. The full log is in /log.')
  })
})

describe('the window policy', () => {
  it('keeps the Offee window on its own origin', () => {
    expect(isOffeeUrl('http://127.0.0.1:8470/forms')).toBe(true)
    expect(isOffeeUrl('http://127.0.0.1:8471/')).toBe(false)
    expect(isOffeeUrl('https://example.com/')).toBe(false)
    expect(isOffeeUrl('file:///etc/passwd')).toBe(false)
    expect(isOffeeUrl('not a url')).toBe(false)
  })

  it('lets the Offee page load nothing from outside its own origin', () => {
    expect(isAllowedRequestUrl('http://127.0.0.1:8470/api/status')).toBe(true)
    expect(isAllowedRequestUrl('data:image/png;base64,AAAA')).toBe(true)
    expect(isAllowedRequestUrl('blob:http://127.0.0.1:8470/1234')).toBe(true)
    expect(isAllowedRequestUrl('https://attacker.example/?secret=1')).toBe(false)
    expect(isAllowedRequestUrl('http://localhost:8470/')).toBe(false)
    expect(isAllowedRequestUrl('wss://attacker.example/')).toBe(false)
  })

  it('grants no browser permission but copying', () => {
    expect(isPermissionAllowed('clipboard-sanitized-write')).toBe(true)
    expect(isPermissionAllowed('media')).toBe(false)
    expect(isPermissionAllowed('geolocation')).toBe(false)
  })

  it('finds Homebrew from an app started without a shell', () => {
    expect(pathWithHomebrew('/usr/bin:/bin')).toBe('/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin')
    expect(pathWithHomebrew(undefined).startsWith('/opt/homebrew/bin:')).toBe(true)
  })

  it('turns redrawn progress into lines', () => {
    expect(progressAsLines('10%\r20%\rdone\r\n')).toBe('10%\n20%\ndone\r\n')
  })
})
