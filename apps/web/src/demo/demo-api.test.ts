import { describe, expect, it } from 'vitest'
import { createDemoApi } from './demo-api'
import { sampleConversationId } from './sample-data'

const context = { profileId: 'profile-work', personaId: null }
const running = new AbortController().signal

describe('createDemoApi', () => {
  it('lists the stored data and deletes one item or everything', async () => {
    const api = createDemoApi()
    const items = await api.storedData()
    expect(new Set(items.map((item) => item.kind))).toEqual(new Set(['profile', 'persona', 'document', 'run']))
    await api.deleteStoredItems([{ kind: 'profile', id: 'profile-work' }, ...items.filter((item) => item.kind === 'run').map(({ kind, id }) => ({ kind, id }))])
    expect((await api.profiles()).map((profile) => profile.id)).not.toContain('profile-work')
    expect(await api.runs()).toEqual([])
    await api.deleteAllStoredData()
    expect(await api.storedData()).toEqual([])
  })

  it('answers a chat from the documents the profile may use and records the run', async () => {
    const api = createDemoApi()
    const answer = await api.chat({ ...context, conversationId: sampleConversationId, history: [], message: 'Do flights need approval?' }, running)
    expect(answer.citations[0]?.documentTitle).toBe('travel-policy.txt')
    const conversation = await api.runConversation(answer.runId)
    expect(conversation.map((run) => run.input)).toEqual(['When does the office close on Fridays?', 'And on Saturdays?', 'Do flights need approval?'])
  })

  it('keeps a document assigned to another profile out of the answer', async () => {
    const api = createDemoApi()
    const answer = await api.chat({ profileId: 'profile-personal', personaId: null, conversationId: crypto.randomUUID(), history: [], message: 'Do flights need approval?' }, running)
    expect(answer.citations).toEqual([])
  })

  it('adds an uploaded text file to the library and refuses a PDF', async () => {
    const api = createDemoApi()
    const uploaded = await api.uploadDocument(new File(['Parking is behind the building.'], 'parking.txt', { type: 'text/plain' }), context, running)
    expect((await api.documents()).map((document) => document.title)).toContain('parking.txt')
    expect(uploaded).not.toHaveProperty('text')
    await expect(api.uploadDocument(new File(['%PDF'], 'form.pdf', { type: 'application/pdf' }), context, running)).rejects.toThrow('plain text')
  })

  it('suggests form values from the chosen profile and signs only with a certificate', async () => {
    const api = createDemoApi()
    const inspection = await api.inspectForm(new File(['%PDF'], 'travel-request.pdf', { type: 'application/pdf' }), context, running)
    expect(inspection.suggestions.find((suggestion) => suggestion.name === 'City')).toEqual({ name: 'City', value: 'Berlin', source: 'profile' })
    const work = await api.fillForm({ formFileId: inspection.formFileId, profileId: 'profile-work', values: inspection.suggestions, placedFields: inspection.placedFields, sign: true })
    const personal = await api.fillForm({ formFileId: inspection.formFileId, profileId: 'profile-personal', values: inspection.suggestions, placedFields: inspection.placedFields, sign: true })
    expect([work.signed, personal.signed]).toEqual([true, false])
    expect((await api.run(work.runId)).title).toBe('Filled and signed travel-request.pdf')
  })

  it('lists runs newest first without their input and output', async () => {
    const api = createDemoApi()
    await api.translate({ ...context, text: 'Hello', targetLanguage: 'German', glossary: '' }, running)
    const [newest] = await api.runs()
    expect(newest?.title).toBe('Translation into German')
    expect(newest).not.toHaveProperty('output')
  })

  it('stops an answer when its signal aborts', async () => {
    const api = createDemoApi()
    const controller = new AbortController()
    const answer = api.chat({ ...context, conversationId: sampleConversationId, history: [], message: 'Do flights need approval?' }, controller.signal)
    controller.abort()
    await expect(answer).rejects.toThrow()
    expect((await api.runs()).map((run) => run.title)).not.toContain('Do flights need approval?')
  })

  it('previews a document with the text it keeps', async () => {
    const api = createDemoApi()
    expect((await api.document('document-office-hours')).text).toContain('closes at 18:00')
    await expect(api.document('nothing')).rejects.toThrow()
  })

  it('starts every page load from the same sample data', async () => {
    const first = createDemoApi()
    await first.deleteProfile('profile-work')
    expect((await createDemoApi().profiles()).map((profile) => profile.id)).toEqual(['profile-work', 'profile-personal'])
  })
})
