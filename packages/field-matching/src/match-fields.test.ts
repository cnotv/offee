import { describe, expect, it } from 'vitest'
import { matchFieldToKey, normalizeFieldName } from './match-fields'

const aliases = {
  fullName: ['fullname', 'name'],
  email: ['email', 'emailaddress'],
  organization: ['company', 'firma'],
  city: ['city', 'ort'],
  date: ['date', 'datum'],
}

describe('matching fields to a profile', () => {
  it('normalizes names across spelling and accents', () => {
    expect(normalizeFieldName('E-Mail')).toBe('email')
    expect(normalizeFieldName('Straße')).toBe('strasse')
    expect(normalizeFieldName('Città')).toBe('citta')
  })

  it('prefers an exact alias, then the longest alias the name contains', () => {
    expect(matchFieldToKey('Name', aliases)).toBe('fullName')
    expect(matchFieldToKey('Company name', aliases)).toBe('organization')
    expect(matchFieldToKey('Ort, Datum', aliases)).toBe('date')
    expect(matchFieldToKey('Favourite colour', aliases)).toBeUndefined()
  })
})
