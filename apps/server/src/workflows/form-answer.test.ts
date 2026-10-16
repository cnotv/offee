import { describe, expect, it } from 'vitest'
import type { FieldSuggestion } from '@offee/contracts'
import { suggestionsFromModelAnswer } from './form-answer.ts'

const fromProfile: FieldSuggestion[] = [
  { name: 'Full name', value: 'Erika Mustermann', source: 'profile' },
  { name: 'Date of birth', value: '', source: 'none' },
  { name: 'Nationality', value: '', source: 'none' },
]

describe('reading the model answer for a form', () => {
  it('fills the fields the profile left empty from the schema answer', () => {
    const answer = '{"fields":[{"name":"Date of birth","value":"12.08.1984"},{"name":"Full name","value":"Someone else"}]}'
    expect(suggestionsFromModelAnswer(fromProfile, answer)).toEqual([
      { name: 'Full name', value: 'Erika Mustermann', source: 'profile' },
      { name: 'Date of birth', value: '12.08.1984', source: 'model' },
      { name: 'Nationality', value: '', source: 'none' },
    ])
  })

  it('reads an answer that names each field directly, as a model not held to the schema writes it', () => {
    const answer = '```json\n{\n  "Date of birth": "12.08.1984",\n  "Nationality": "German",\n  "Unknown field": "x"\n}\n```'
    expect(suggestionsFromModelAnswer(fromProfile, answer)).toEqual([
      { name: 'Full name', value: 'Erika Mustermann', source: 'profile' },
      { name: 'Date of birth', value: '12.08.1984', source: 'model' },
      { name: 'Nationality', value: 'German', source: 'model' },
    ])
  })
})
