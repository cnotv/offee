import { describe, expect, it } from 'vitest'
import { openDatabase } from '../store/database.ts'
import { createDocumentStore } from '../store/document-store.ts'
import { chunkText } from './chunk-text.ts'
import { buildSearchQuery } from './search-query.ts'

describe('chunking', () => {
  it('joins short paragraphs and splits long ones', () => {
    expect(chunkText('One.\n\nTwo.\n\nThree.', 100)).toEqual(['One.\n\nTwo.\n\nThree.'])
    const long = 'A sentence that goes on. '.repeat(20)
    const chunks = chunkText(long, 100)
    expect(chunks.length).toBeGreaterThan(4)
    expect(chunks.every((chunk) => chunk.length <= 100)).toBe(true)
  })
})

describe('search queries', () => {
  it('keeps meaningful words, quoted, and drops stop words and punctuation', () => {
    expect(buildSearchQuery('What is the notice period?')).toBe('"notice" OR "period"')
    expect(buildSearchQuery('"); DROP TABLE x; --')).toBe('"drop" OR "table"')
    expect(buildSearchQuery('is it?')).toBeNull()
  })
})

describe('document scope', () => {
  it('finds shared documents and those assigned to the chosen profile or persona only', () => {
    const store = createDocumentStore(openDatabase(':memory:'), () => 0)
    store.add({ title: 'shared.txt', mimeType: 'text/plain', text: 'The notice period is three months.', profileId: null, personaId: null })
    store.add({ title: 'work.txt', mimeType: 'text/plain', text: 'Work notice period: one month.', profileId: 'work', personaId: null })
    store.add({ title: 'home.txt', mimeType: 'text/plain', text: 'Home lease notice period: two months.', profileId: 'home', personaId: null })

    const titles = (profileId: string | null) =>
      store
        .search('notice period', { profileId, personaId: null })
        .map((citation) => citation.documentTitle)
        .toSorted()
    expect(titles('work')).toEqual(['shared.txt', 'work.txt'])
    expect(titles('home')).toEqual(['home.txt', 'shared.txt'])
    expect(titles(null)).toEqual(['shared.txt'])
  })
})
