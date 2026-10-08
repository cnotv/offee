import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import type { Profile } from '@offee/contracts'
import { createSigningCertificate } from './certificate.ts'
import { matchFieldToKey, normalizeFieldName, suggestFromProfile } from './match-fields.ts'
import { fillForm, readFormFields } from './pdf-form.ts'

const aliases = {
  fullName: ['fullname', 'name'],
  email: ['email', 'emailaddress'],
  organization: ['company', 'firma'],
  city: ['city', 'ort'],
  date: ['date', 'datum'],
}

const profile: Profile = {
  id: 'p1',
  label: 'Work',
  firstName: 'Ada',
  lastName: 'Lovelace',
  role: 'Engineer',
  organization: 'Analytical Engines Ltd',
  email: 'ada@example.org',
  phone: '',
  street: '',
  postalCode: '',
  city: 'London',
  country: 'UK',
  languages: ['English'],
  tone: '',
  facts: '',
  // A 1x1 transparent PNG.
  signatureImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  hasCertificate: false,
  createdAt: 0,
}

const makeForm = async (): Promise<Uint8Array> => {
  const document = await PDFDocument.create()
  const page = document.addPage([600, 400])
  const form = document.getForm()
  form.createTextField('Name').addToPage(page, { x: 50, y: 300, width: 200, height: 20 })
  form.createTextField('E-Mail Address').addToPage(page, { x: 50, y: 260, width: 200, height: 20 })
  form.createTextField('Company name').addToPage(page, { x: 50, y: 220, width: 200, height: 20 })
  form.createTextField('Favourite colour').addToPage(page, { x: 50, y: 180, width: 200, height: 20 })
  form.createCheckBox('Agree').addToPage(page, { x: 50, y: 140, width: 20, height: 20 })
  return document.save()
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

describe('filling and signing a PDF form', () => {
  it('reads the fields, suggests values from the profile, fills and signs', async () => {
    const pdf = await makeForm()
    const fields = await readFormFields(pdf)
    expect(fields.map((field) => [field.name, field.kind])).toEqual([
      ['Name', 'text'],
      ['E-Mail Address', 'text'],
      ['Company name', 'text'],
      ['Favourite colour', 'text'],
      ['Agree', 'checkbox'],
    ])

    const suggestions = suggestFromProfile(fields, profile, aliases, '08/10/2026')
    expect(suggestions).toEqual([
      { name: 'Name', value: 'Ada Lovelace', source: 'profile' },
      { name: 'E-Mail Address', value: 'ada@example.org', source: 'profile' },
      { name: 'Company name', value: 'Analytical Engines Ltd', source: 'profile' },
      { name: 'Favourite colour', value: '', source: 'none' },
      { name: 'Agree', value: '', source: 'none' },
    ])

    const filled = await fillForm(pdf, { values: [...suggestions.slice(0, 3), { name: 'Agree', value: 'yes', source: 'model' }], sign: null })
    const reread = (await PDFDocument.load(filled)).getForm()
    expect(reread.getTextField('Name').getText()).toBe('Ada Lovelace')
    expect(reread.getCheckBox('Agree').isChecked()).toBe(true)

    const certificate = createSigningCertificate(profile, new Date('2026-10-08T10:00:00Z'))
    const signed = await fillForm(pdf, { values: suggestions, sign: { profile, certificate, now: new Date('2026-10-08T10:00:00Z') } })
    const signedText = Buffer.from(signed).toString('latin1')
    expect(signedText).toContain('/ByteRange')
    expect(signedText).toContain('/ETSI.CAdES.detached')
    expect(signedText).not.toMatch(/\/Contents\s*<0+>/)
  }, 30_000)
})
