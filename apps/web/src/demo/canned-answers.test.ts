import { describe, expect, it } from 'vitest'
import { answerFromDocuments, draftReply, reviewFromSentences } from './canned-answers'
import { sampleDocuments, sampleProfiles } from './sample-data'

describe('answerFromDocuments', () => {
  it('cites the sentence that shares the most words with the question', () => {
    const answer = answerFromDocuments('When does the office close on Fridays?', sampleDocuments)
    expect(answer.text).toBe('The office opens at 8:00 and closes at 18:00 on Fridays, 19:00 on other weekdays. [1]')
    expect(answer.citations).toEqual([
      { documentId: 'document-office-hours', documentTitle: 'office-hours.txt', excerpt: expect.stringContaining('Fridays') },
    ])
  })

  it('says the documents do not cover a question nothing in them matches', () => {
    const answer = answerFromDocuments('Who won the football?', sampleDocuments)
    expect(answer.citations).toEqual([])
    expect(answer.text).toContain('do not say')
  })

  it('finds nothing when the chosen profile may use no documents', () => {
    expect(answerFromDocuments('Are flights allowed?', []).citations).toEqual([])
  })
})

describe('draftReply', () => {
  it('carries the guidance and signs with the profile first name', () => {
    expect(draftReply('Thursday at 10:00 works.', sampleProfiles[0])).toBe(
      'Hello,\n\nThank you for your message. Thursday at 10:00 works.\n\nBest regards,\nMarco',
    )
  })
})

describe('reviewFromSentences', () => {
  it('gives each section the next sentence and marks the ones left over', () => {
    const review = reviewFromSentences('Launch moves to March. Anna writes the release.', { id: 'meeting', name: 'Meeting', sections: ['Summary', 'Decisions', 'Open questions'] })
    expect(review).toBe('## Summary\nLaunch moves to March.\n\n## Decisions\nAnna writes the release.\n\n## Open questions\nNothing in the source.')
  })
})
