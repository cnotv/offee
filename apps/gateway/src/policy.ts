import type { SwitchMode } from '@offee/contracts'

export type SwitchState = {
  mode: SwitchMode
  openUntil: number | null
}

export type ForwardDecision = 'refuse' | 'hold' | 'send'

export const sealedState: SwitchState = { mode: 'sealed', openUntil: null }

/**
 * The mode in force at a moment: an open switch whose time has run out counts as sealed.
 * @param state The switch as last set.
 * @param now The current time in milliseconds.
 * @returns The state that applies now.
 */
export const currentState = (state: SwitchState, now: number): SwitchState =>
  state.mode === 'open' && state.openUntil !== null && now >= state.openUntil ? sealedState : state

/**
 * Opens the switch for a number of minutes from now.
 * @param minutes How long it stays open; at least one minute, at most a day.
 * @param now The current time in milliseconds.
 * @returns The open state.
 */
export const openFor = (minutes: number, now: number): SwitchState => {
  const boundedMinutes = Math.min(Math.max(Math.round(minutes), 1), 24 * 60)
  return { mode: 'open', openUntil: now + boundedMinutes * 60_000 }
}

/**
 * What the gateway does with a request in a given mode.
 * @param mode The mode in force.
 * @returns Refuse when sealed, hold for approval when asking, send when open.
 */
export const decideForward = (mode: SwitchMode): ForwardDecision => {
  if (mode === 'sealed') return 'refuse'
  if (mode === 'ask') return 'hold'
  return 'send'
}
