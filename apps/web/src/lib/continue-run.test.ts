import { describe, expect, it } from 'vitest'
import type { RunDetail } from '@offee/contracts'
import { canContinue, continuationOf, emptyWorkflowPages } from './continue-run'

const empty = emptyWorkflowPages(() => 'new-conversation')

const run = (overrides: Partial<RunDetail>): RunDetail => ({
  id: 'run',
  workflow: 'chat',
  title: 'A run',
  model: { kind: 'local', name: 'gemma', fallbackReason: null },
  leftMachine: false,
  createdAt: 1,
  conversationId: null,
  input: 'in',
  output: 'out',
  outbound: [],
  ...overrides,
})

describe('continuing a run from the log', () => {
  it('reopens a chat with every exchange of its conversation, in the same conversation', () => {
    const next = continuationOf(
      [
        run({ id: 'a', conversationId: 'c1', input: 'First?', output: 'One.' }),
        run({ id: 'b', conversationId: 'c1', input: 'Second?', output: 'Two.' }),
      ],
      empty,
    )
    expect(next?.page).toBe('chat')
    expect(next?.page === 'chat' && next.state.conversationId).toBe('c1')
    expect(next?.page === 'chat' && next.state.exchanges.map((exchange) => [exchange.question, exchange.answer.text])).toEqual([
      ['First?', 'One.'],
      ['Second?', 'Two.'],
    ])
  })

  it('starts a new conversation from an older chat that had none', () => {
    const next = continuationOf([run({ conversationId: null })], empty)
    expect(next?.page === 'chat' && next.state.conversationId).toBe('new-conversation')
  })

  it('reopens a translation with its text, language and result', () => {
    const next = continuationOf([run({ workflow: 'translate', title: 'Translation into German', input: 'Hello', output: 'Hallo' })], empty)
    expect(next).toMatchObject({ page: 'translate', state: { text: 'Hello', targetLanguage: 'German', result: { text: 'Hallo' } } })
  })

  it('reopens a reply and a review with their input and result', () => {
    expect(continuationOf([run({ workflow: 'reply', input: 'Thread', output: 'Draft' })], empty)).toMatchObject({
      page: 'reply',
      state: { thread: 'Thread', result: { text: 'Draft' } },
    })
    expect(continuationOf([run({ workflow: 'review', input: 'Notes', output: 'Review' })], empty)).toMatchObject({
      page: 'review',
      state: { source: 'Notes', result: { text: 'Review' } },
    })
  })

  it('turns a transcript into the source of a review', () => {
    expect(continuationOf([run({ workflow: 'transcribe', input: 'call.m4a', output: 'What was said' })], empty)).toMatchObject({
      page: 'review',
      state: { source: 'What was said', result: null },
    })
  })

  it('has nothing to continue for a filled form', () => {
    expect(canContinue('form')).toBe(false)
    expect(continuationOf([run({ workflow: 'form' })], empty)).toBeNull()
  })
})
