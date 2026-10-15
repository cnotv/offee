import { describe, expect, it } from 'vitest'
import { batchByLength } from './batch-by-length.ts'

describe('batching for the local model', () => {
  it('fills each batch up to the budget, in order', () => {
    expect(batchByLength(['aaaa', 'bb', 'cc', 'dddd', 'e'], (item) => item.length, 6)).toEqual([['aaaa', 'bb'], ['cc', 'dddd'], ['e']])
  })

  it('gives an item longer than the budget a batch of its own', () => {
    expect(batchByLength(['a', 'bbbbbbbb', 'c'], (item) => item.length, 4)).toEqual([['a'], ['bbbbbbbb'], ['c']])
  })

  it('makes no batch from nothing', () => {
    expect(batchByLength([], (item: string) => item.length, 4)).toEqual([])
  })
})
