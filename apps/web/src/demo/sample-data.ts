import type { ModelUsed, Persona, Profile, RunDetail } from '@offee/contracts'
import type { DemoDocument } from '@/lib/types'

const minute = 60_000
const hour = 60 * minute

export const demoModelName = 'stand-in model (demo)'

export const demoLocalModel: ModelUsed = { kind: 'local', name: demoModelName, fallbackReason: null }

export const sampleProfiles: Profile[] = [
  {
    id: 'profile-work',
    label: 'Work',
    firstName: 'Marco',
    lastName: 'Rossi',
    role: 'Project lead',
    organization: 'Example Studio GmbH',
    email: 'marco.rossi@example.com',
    phone: '+49 30 1234567',
    street: 'Musterstrasse 1',
    postalCode: '10115',
    city: 'Berlin',
    country: 'Germany',
    languages: ['English', 'German', 'Italian'],
    tone: 'Friendly and short',
    facts: 'Works Monday to Thursday. Prefers calls before noon.',
    signatureImage: null,
    hasCertificate: true,
    createdAt: Date.UTC(2026, 8, 1),
  },
  {
    id: 'profile-personal',
    label: 'Personal',
    firstName: 'Marco',
    lastName: 'Rossi',
    role: '',
    organization: '',
    email: 'marco@example.org',
    phone: '',
    street: 'Beispielweg 7',
    postalCode: '10437',
    city: 'Berlin',
    country: 'Germany',
    languages: ['Italian', 'English'],
    tone: 'Warm',
    facts: '',
    signatureImage: null,
    hasCertificate: false,
    createdAt: Date.UTC(2026, 8, 2),
  },
]

export const samplePersonas: Persona[] = [
  {
    id: 'persona-assistant',
    name: 'Office assistant',
    instructions: 'Answer from the documents and say when they do not cover the question.',
    modelPreference: 'local',
    createdAt: Date.UTC(2026, 8, 1),
  },
  {
    id: 'persona-translator',
    name: 'Careful translator',
    instructions: 'Keep names, numbers and dates exactly as written. Use the glossary.',
    modelPreference: 'local',
    createdAt: Date.UTC(2026, 8, 3),
  },
  {
    id: 'persona-researcher',
    name: 'Research helper',
    instructions: 'May use the remote model, after asking, for long documents.',
    modelPreference: 'remote',
    createdAt: Date.UTC(2026, 8, 4),
  },
]

const sampleDocument = (id: string, title: string, text: string, profileId: string | null, createdAt: number): DemoDocument => ({
  id,
  title,
  mimeType: 'text/plain',
  characterCount: text.length,
  profileId,
  personaId: null,
  createdAt,
  text,
})

export const sampleDocuments: DemoDocument[] = [
  sampleDocument(
    'document-office-hours',
    'office-hours.txt',
    'The office opens at 8:00 and closes at 18:00 on Fridays, 19:00 on other weekdays. The office is closed on Saturdays, Sundays and public holidays.',
    null,
    Date.UTC(2026, 8, 5),
  ),
  sampleDocument(
    'document-travel-policy',
    'travel-policy.txt',
    'Train travel is booked in second class. Flights need approval from the team lead. Hotel costs are refunded up to 140 euros a night.',
    'profile-work',
    Date.UTC(2026, 8, 6),
  ),
  sampleDocument(
    'document-launch-notes',
    'launch-meeting-notes.txt',
    'The team agreed to move the launch to 3 March. Anna owns the press release. Marco updates the budget by Friday. Nobody has signed off the final design yet.',
    'profile-work',
    Date.UTC(2026, 8, 7),
  ),
]

export const sampleConversationId = '5d0c6c3e-8a63-4c55-9a8e-2b1f7f0e4a10'

/**
 * The run log a visitor finds on opening the demo, dated relative to now.
 * @param now The current time.
 * @returns The runs, newest first.
 */
export const sampleRuns = (now: number): RunDetail[] => [
  {
    id: 'run-chat-2',
    workflow: 'chat',
    title: 'And on Saturdays?',
    model: demoLocalModel,
    leftMachine: false,
    createdAt: now - 20 * minute,
    conversationId: sampleConversationId,
    input: 'And on Saturdays?',
    output: 'The office is closed on Saturdays [1].',
    outbound: [],
  },
  {
    id: 'run-chat-1',
    workflow: 'chat',
    title: 'When does the office close on Fridays?',
    model: demoLocalModel,
    leftMachine: false,
    createdAt: now - 21 * minute,
    conversationId: sampleConversationId,
    input: 'When does the office close on Fridays?',
    output: 'The office closes at 18:00 on Fridays [1].',
    outbound: [],
  },
  {
    id: 'run-translate-1',
    workflow: 'translate',
    title: 'Translation into German',
    model: demoLocalModel,
    leftMachine: false,
    createdAt: now - 2 * hour,
    conversationId: null,
    input: 'Dear Ms Weber,\n\nThank you for your message. The office closes at 18:00 on Fridays.\n\nKind regards',
    output: 'Sehr geehrte Frau Weber,\n\nvielen Dank für Ihre Nachricht. Das Büro schließt freitags um 18:00 Uhr.\n\nMit freundlichen Grüßen',
    outbound: [],
  },
  {
    id: 'run-review-1',
    workflow: 'review',
    title: 'Meeting or talk review',
    model: demoLocalModel,
    leftMachine: false,
    createdAt: now - 26 * hour,
    conversationId: null,
    input: 'We agreed to move the launch to the third of March. Anna owns the press release, and Marco updates the budget by Friday.',
    output:
      '## Summary\nThe team agreed to move the launch to 3 March.\n\n## Decisions\n- Launch on 3 March\n\n## Action items with owners\n- Anna: the press release\n- Marco: update the budget by Friday\n\n## Open questions\nThe notes do not say who signs off the final design.',
    outbound: [],
  },
  {
    id: 'run-transcribe-1',
    workflow: 'transcribe',
    title: 'Transcript of launch-call.m4a',
    model: null,
    leftMachine: false,
    createdAt: now - 27 * hour,
    conversationId: null,
    input: 'launch-call.m4a',
    output: 'We agreed to move the launch to the third of March. Anna owns the press release, and Marco updates the budget by Friday.',
    outbound: [],
  },
]
