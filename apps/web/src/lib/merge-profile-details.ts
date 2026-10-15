import type { ProfileDetails, ProfileInput } from '@offee/contracts'

const textKeys = ['firstName', 'lastName', 'role', 'organization', 'email', 'phone', 'street', 'postalCode', 'city', 'country'] as const

const linesOf = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')

/**
 * Puts what a document says about the person into a profile being edited: a value the document
 * gives replaces the field, languages and facts are added to, never dropped.
 * @param draft The profile as it stands in the dialog.
 * @param details What the document gives.
 * @returns The profile with the details in it, still unsaved.
 */
export const mergeProfileDetails = (draft: ProfileInput, details: ProfileDetails): ProfileInput => {
  const replaced = Object.fromEntries(textKeys.flatMap((key) => (details[key] === '' ? [] : [[key, details[key]]])))
  const knownFacts = linesOf(draft.facts)
  const newFacts = linesOf(details.facts).filter((line) => !knownFacts.includes(line))
  return {
    ...draft,
    ...replaced,
    languages: [...new Set([...draft.languages, ...details.languages])],
    facts: [...knownFacts, ...newFacts].join('\n'),
  }
}
