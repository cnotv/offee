import { ArrowLeftIcon, GearIcon, LockClosedIcon, LockOpen1Icon, PlayIcon, StopIcon } from '@radix-ui/react-icons'
import { Badge, Box, Button, Callout, Card, Flex, Heading, SegmentedControl, Separator, Text, TextField } from '@radix-ui/themes'
import { useEffect, useRef, useState } from 'react'
import type { ControlState, SwitchRequest } from '../../src/types.ts'

const control = window.offeeControl

const phaseText: Record<ControlState['phase'], string> = {
  checking: 'Checking…',
  'needs-setup': 'Not set up yet',
  'setting-up': 'Setting up',
  starting: 'Starting',
  running: 'Running',
  stopping: 'Stopping',
  stopped: 'Stopped',
  failed: 'Needs attention',
}

type Snapshot = { state: ControlState; receivedAt: number }

// The time is taken when the state arrives, so rendering stays pure.
const snapshotOf = (state: ControlState): Snapshot => ({ state, receivedAt: Date.now() })

const switchValue = ({ state, receivedAt }: Snapshot): string => {
  if (state.gateway === null) return 'sealed'
  if (state.gateway.mode !== 'open' || state.gateway.openUntil === null) return state.gateway.mode
  return state.gateway.openUntil - receivedAt > 20 * 60_000 ? 'open-60' : 'open-15'
}

const requestFor = (value: string): SwitchRequest => {
  if (value === 'ask') return { mode: 'ask' }
  if (value === 'open-15') return { mode: 'open', minutes: 15 }
  if (value === 'open-60') return { mode: 'open', minutes: 60 }
  return { mode: 'sealed' }
}

const maximumLogLength = 60_000

const shortCommit = (commit: string): string => commit.slice(0, 7)

const updateText = (state: ControlState): string => {
  const build = `Build ${shortCommit(state.buildCommit)}`
  if (state.update.status === 'checking') return `${build}. Asking GitHub for the newest build…`
  if (state.update.status === 'current') return `${build} is the newest.`
  if (state.update.status === 'available') return `${build}. Build ${shortCommit(state.update.commit)} is ready to install.`
  if (state.update.status === 'installing') return 'Downloading and checking the new build…'
  if (state.update.status === 'notice') return state.update.message
  return `${build}. Checked only when you ask, from this computer; nothing comes from Offee itself.`
}

const PhaseBadge = ({ state }: { state: ControlState }) => (
  <Badge size="2" color={state.phase === 'running' ? 'grass' : state.phase === 'failed' ? 'red' : 'gray'} variant="soft">
    {phaseText[state.phase]}
  </Badge>
)

const SwitchControl = ({ snapshot, size, onChange }: { snapshot: Snapshot; size: '1' | '2'; onChange: (request: SwitchRequest) => void }) => (
  <SegmentedControl.Root size={size} value={switchValue(snapshot)} onValueChange={(value) => onChange(requestFor(value))}>
    <SegmentedControl.Item value="sealed">Sealed</SegmentedControl.Item>
    <SegmentedControl.Item value="ask">Ask</SegmentedControl.Item>
    <SegmentedControl.Item value="open-15">Open 15 min</SegmentedControl.Item>
    <SegmentedControl.Item value="open-60">Open 1 hour</SegmentedControl.Item>
  </SegmentedControl.Root>
)

/** The host-side settings: setup, start and stop, the switch, and the key for Claude. */
export const ControlView = () => {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [log, setLog] = useState('')
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)
  const logReference = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void control.getState().then((state) => setSnapshot(snapshotOf(state)))
    control.onState((state) => setSnapshot(snapshotOf(state)))
    control.onLog((text) => setLog((current) => (current + text).slice(-maximumLogLength)))
  }, [])

  useEffect(() => {
    logReference.current?.scrollTo({ top: logReference.current.scrollHeight })
  }, [log])

  const run = (work: () => Promise<void>) => {
    setBusy(true)
    work().finally(() => setBusy(false))
  }

  if (snapshot === null) return null
  const { state } = snapshot
  const running = state.phase === 'running'
  const working = ['setting-up', 'starting', 'stopping', 'checking'].includes(state.phase)
  const setSwitch = (request: SwitchRequest) => run(() => control.setSwitch(request))

  // Above the Offee page, this page shrinks to one bar; the window keeps the two apart.
  if (state.view === 'offee') {
    return (
      <Flex align="center" justify="between" gap="3" className="control-toolbar">
        <Flex align="center" gap="3">
          <Text size="3" weight="bold">
            Offee
          </Text>
          <PhaseBadge state={state} />
        </Flex>
        <Flex align="center" gap="3">
          {running && <SwitchControl snapshot={snapshot} size="1" onChange={setSwitch} />}
          <Button size="1" variant="soft" onClick={() => run(control.showSettings)}>
            <GearIcon /> Settings
          </Button>
        </Flex>
      </Flex>
    )
  }

  return (
    <Flex direction="column" gap="4" className="control-page">
      <Flex justify="between" align="center" gap="3">
        <Heading size="5">Offee</Heading>
        <Flex align="center" gap="3">
          <PhaseBadge state={state} />
          {running && (
            <Button size="2" onClick={() => run(control.openOffee)}>
              <ArrowLeftIcon /> Back to Offee
            </Button>
          )}
        </Flex>
      </Flex>

      {state.message !== null && (
        <Callout.Root color="red" variant="surface">
          <Callout.Text className="control-message">{state.message}</Callout.Text>
        </Callout.Root>
      )}

      {(state.phase === 'needs-setup' || state.phase === 'failed') && !running && (
        <Card size="3">
          <Flex direction="column" gap="3">
            <Text size="2">
              Offee runs in a Linux virtual machine on this computer that shares no folder with it. Setup installs what is missing, creates the
              machine and downloads the local models.
            </Text>
            <Flex gap="2">
              <Button loading={busy || working} onClick={() => run(control.runSetup)}>
                Set up Offee
              </Button>
              {state.phase === 'failed' && (
                <>
                  <Button variant="soft" loading={busy || working} onClick={() => run(control.start)}>
                    <PlayIcon /> Try starting
                  </Button>
                  <Button variant="soft" color="red" loading={busy || working} onClick={() => run(control.stop)}>
                    <StopIcon /> Stop the VM
                  </Button>
                </>
              )}
            </Flex>
          </Flex>
        </Card>
      )}

      {state.phase === 'setting-up' && (
        <Flex gap="3" align="center" wrap="wrap">
          <Text size="2" color="gray">
            Setting up downloads about 10 GB; it stops when you cancel.
          </Text>
          <Button variant="soft" color="red" onClick={() => run(control.stop)}>
            <StopIcon /> Cancel setup
          </Button>
        </Flex>
      )}

      {running && (
        <Card size="3">
          <Flex direction="column" gap="3">
            <Flex justify="between" align="center" gap="2" wrap="wrap">
              <Text size="2" weight="medium">
                What may leave this computer
              </Text>
              {state.gateway?.mode === 'open' ? <LockOpen1Icon /> : <LockClosedIcon />}
            </Flex>
            <SwitchControl snapshot={snapshot} size="2" onChange={setSwitch} />
            <Text size="1" color="gray">
              Sealed: nothing leaves. Ask: each request waits for you in a dialog showing what would be sent. Open: listed destinations only,
              closing again on its own.
            </Text>
            <Separator size="4" />
            <Flex direction="column" gap="2">
              <Text size="2" weight="medium">
                Anthropic API key {state.hasAnthropicKey ? '(stored)' : '(not set)'}
              </Text>
              <Flex gap="2">
                <Box flexGrow="1">
                  <TextField.Root type="password" placeholder="sk-ant-…" value={key} onChange={(event) => setKey(event.target.value)} />
                </Box>
                <Button
                  disabled={key.trim().length < 20}
                  loading={busy}
                  onClick={() =>
                    run(async () => {
                      await control.saveAnthropicKey(key)
                      setKey('')
                    })
                  }
                >
                  Save
                </Button>
              </Flex>
              <Text size="1" color="gray">
                Stored on this computer and given only to the gateway, never to Offee. Saving restarts the gateway sealed.
              </Text>
            </Flex>
            <Separator size="4" />
            <Flex gap="2" wrap="wrap">
              <Button variant="soft" loading={busy} onClick={() => run(control.runSelftest)}>
                Check isolation
              </Button>
              <Button variant="soft" color="red" loading={busy} onClick={() => run(control.stop)}>
                <StopIcon /> Stop
              </Button>
            </Flex>
          </Flex>
        </Card>
      )}

      {state.phase === 'stopped' && (
        <Button onClick={() => run(control.start)} loading={busy}>
          <PlayIcon /> Start Offee
        </Button>
      )}

      <Card size="2">
        <Flex justify="between" align="center" gap="3" wrap="wrap">
          <Flex direction="column" gap="1" flexGrow="1" flexBasis="16rem">
            <Text size="2" weight="medium">
              Updates
            </Text>
            <Text size="1" color="gray">
              {updateText(state)}
            </Text>
          </Flex>
          {state.update.status === 'available' ? (
            <Button disabled={working} loading={busy} onClick={() => run(control.installUpdate)}>
              Install update
            </Button>
          ) : (
            <Button
              variant="soft"
              loading={state.update.status === 'checking' || state.update.status === 'installing'}
              onClick={() => run(control.checkForUpdate)}
            >
              Check for updates
            </Button>
          )}
        </Flex>
      </Card>

      <Flex direction="column" gap="1">
        <Text size="2" weight="medium">
          Log
        </Text>
        <div ref={logReference} className="control-log">
          {log === '' ? 'Nothing yet.' : log}
        </div>
      </Flex>
    </Flex>
  )
}
