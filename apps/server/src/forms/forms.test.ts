import { PDFDocument as EncryptingPDFDocument } from '@cantoo/pdf-lib'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import type { Profile } from '@offee/contracts'
import { createSigningCertificate } from './certificate.ts'
import shippedAliasesFile from '../../../../config/form-field-aliases.json' with { type: 'json' }
import { fieldAliasesSchema, matchFieldToKey, normalizeFieldName, suggestFromProfile } from './match-fields.ts'
import { decryptPdf, fillForm, readFormFields } from './pdf-form.ts'

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

  it('answers occupation from the role, and leaves questions about birth to the model rather than answering them with today or the city', () => {
    const shippedAliases = fieldAliasesSchema.parse(shippedAliasesFile)
    const fields = ['Occupation', 'Date of birth', 'Place of birth', 'Geburtsdatum', 'Place and date'].map((name) => ({ name, kind: 'text' as const, options: [] }))
    expect(suggestFromProfile(fields, profile, shippedAliases, '15/10/2026').map((suggestion) => suggestion.value)).toEqual(['Engineer', '', '', '', 'London, 15/10/2026'])
  })

  it('fills the tax return labels that are the profile, and leaves death, birth, the spouse and a foreign address to the model', () => {
    const shippedAliases = fieldAliasesSchema.parse(shippedAliasesFile)
    const resident = { ...profile, street: 'Hauptstraße 1', postalCode: '10115', city: 'Berlin', country: 'Deutschland' }
    const valueFor = (label: string): string => suggestFromProfile([{ name: label, kind: 'text', options: [] }], resident, shippedAliases, '15/10/2026')[0]?.value ?? ''
    expect(['Name', 'Vorname', 'Ausgeübter Beruf', 'Straße (derzeitige Adresse)', 'Postleitzahl (Inland)', 'Wohnort', 'Ort, Datum'].map(valueFor)).toEqual([
      'Ada Lovelace',
      'Ada',
      'Engineer',
      'Hauptstraße 1',
      '10115',
      'Berlin',
      'Berlin, 15/10/2026',
    ])
    const notTheProfile = [
      'im Sterbefall: Sterbedatum',
      'Geburtsdatum',
      'Adressergänzung',
      'Postleitzahl (Ausland)',
      'Staat (falls Anschrift im Ausland)',
      'Name 2',
      'Vorname 2',
      'Abweichende Anschrift der Ehefrau oder Person B',
      'Person B: Vorname',
    ]
    expect(notTheProfile.map(valueFor)).toEqual(notTheProfile.map(() => ''))
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

const encrypt = async (content: Uint8Array, userPassword: string): Promise<Uint8Array> => {
  const document = await EncryptingPDFDocument.load(content)
  document.encrypt({ userPassword, ownerPassword: 'owner', permissions: { modifying: false } })
  return document.save()
}

describe('opening an encrypted PDF form', () => {
  it('decrypts a form anyone may open, so its fields can be read and filled', async () => {
    const encrypted = await encrypt(await makeForm(), '')
    const decrypted = await decryptPdf(encrypted)
    expect((await readFormFields(decrypted)).map((field) => field.name)).toEqual(['Name', 'E-Mail Address', 'Company name', 'Favourite colour', 'Agree'])
    const filled = await fillForm(decrypted, { values: [{ name: 'Name', value: 'Ada Lovelace', source: 'profile' }], sign: null })
    expect((await PDFDocument.load(filled)).getForm().getTextField('Name').getText()).toBe('Ada Lovelace')
  })

  it('says a form needs a password to open, rather than failing inside the PDF library', async () => {
    const locked = await encrypt(await makeForm(), 'secret')
    await expect(decryptPdf(locked)).rejects.toThrow('This PDF needs a password to open')
  })

  it('leaves a PDF that is not encrypted as it is', async () => {
    const plain = await makeForm()
    expect(await decryptPdf(plain)).toBe(plain)
  })
})
