import { describe, expect, it } from 'vitest'
import { describeSwitch, workflowName } from './presentation'

describe('the switch in the sidebar', () => {
  it('reads as sealed when the gateway is missing or sealed', () => {
    expect(describeSwitch(null, 0)).toMatchObject({ open: false, color: 'gray' })
    expect(describeSwitch({ mode: 'sealed', openUntil: null, pendingCount: 0 }, 0)).toMatchObject({ label: 'Sealed', open: false })
  })

  it('shows waiting requests in ask mode and minutes left when open', () => {
    expect(describeSwitch({ mode: 'ask', openUntil: null, pendingCount: 2 }, 0).label).toBe('Ask, 2 waiting')
    expect(describeSwitch({ mode: 'open', openUntil: 10 * 60_000, pendingCount: 0 }, 60_000)).toMatchObject({ label: 'Open, 9 min left', open: true })
  })

  it('names workflows for the run log', () => {
    expect(workflowName('transcribe')).toBe('Transcript')
  })
})
