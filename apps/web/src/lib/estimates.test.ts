import { describe, expect, it } from 'vitest'
import type { DurationHistory } from './types'
import { describeEstimate, describeSeconds, estimateOf, formatElapsed, readDurationHistory, withDuration } from './estimates'

const empty: DurationHistory = {}

describe('estimates', () => {
  it('falls back to the typical range before anything ran on this machine', () => {
    expect(estimateOf({}, 'form')).toEqual({ basis: 'typical', label: '30 s to 3 min' })
  })

  it('takes the median of the recent runs once there are some', () => {
    const history = [40_000, 200_000, 90_000].reduce((current, duration) => withDuration(current, 'form', duration), empty)
    expect(estimateOf(history, 'form')).toEqual({ basis: 'history', label: 'about 1 min 30 s' })
    expect(describeEstimate(estimateOf(history, 'form'))).toBe('about 1 min 30 s on this machine')
    expect(describeEstimate(estimateOf({}, 'form'))).toBe('usually 30 s to 3 min')
  })

  it('keeps only the last five durations of a kind', () => {
    const history = [1, 2, 3, 4, 5, 6, 7].reduce((current, seconds) => withDuration(current, 'chat', seconds * 1000), empty)
    expect(history.chat).toEqual([3000, 4000, 5000, 6000, 7000])
  })

  it('reads stored history defensively', () => {
    expect(readDurationHistory(null)).toEqual({})
    expect(readDurationHistory('not json')).toEqual({})
    expect(readDurationHistory('{"chat":"fast"}')).toEqual({})
    expect(readDurationHistory('{"chat":[1000],"unknown":[5]}')).toEqual({ chat: [1000] })
  })

  it('formats seconds and elapsed time', () => {
    expect(describeSeconds(45)).toBe('45 s')
    expect(describeSeconds(180)).toBe('3 min')
    expect(describeSeconds(83)).toBe('1 min 23 s')
    expect(formatElapsed(65_400)).toBe('1:05')
    expect(formatElapsed(-20)).toBe('0:00')
  })
})
