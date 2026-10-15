import { describe, expect, it } from 'vitest'
import type { ProfileDetails, ProfileInput } from '@offee/contracts'
import { mergeProfileDetails } from './merge-profile-details'

const draft: ProfileInput = {
  label: 'Personal',
  firstName: 'Erika',
  lastName: '',
  role: '',
  organization: '',
  email: 'old@example.org',
  phone: '+49 30 1234567',
  street: '',
  postalCode: '',
  city: '',
  country: '',
  languages: ['German'],
  tone: 'Warm',
  facts: 'Shoe size: 38\nNationality: German',
  signatureImage: null,
}

const details: ProfileDetails = {
  firstName: 'Erika',
  lastName: 'Mustermann',
  role: '',
  organization: '',
  email: 'erika@example.org',
  phone: '',
  street: 'Musterstraße 12',
  postalCode: '10115',
  city: 'Berlin',
  country: 'Germany',
  languages: ['German', 'English'],
  facts: 'Nationality: German\nDate of birth: 12.08.1990',
}

describe('putting a document’s details into a profile', () => {
  it('fills what the document gives, keeps the rest, and adds languages and facts without repeating them', () => {
    expect(mergeProfileDetails(draft, details)).toEqual({
      ...draft,
      lastName: 'Mustermann',
      email: 'erika@example.org',
      street: 'Musterstraße 12',
      postalCode: '10115',
      city: 'Berlin',
      country: 'Germany',
      languages: ['German', 'English'],
      facts: 'Shoe size: 38\nNationality: German\nDate of birth: 12.08.1990',
    })
  })
})
