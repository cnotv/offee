import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { RemoteModel, RemoteRequest } from '../llm/remote-model.ts'
import type { CompletionRequest, LocalModel } from '../llm/local-model.ts'
import { openDatabase } from '../store/database.ts'
import { createDocumentStore } from '../store/document-store.ts'
import { createFileStore } from '../store/file-store.ts'
import { createPersonaStore, createProfileStore } from '../store/profile-store.ts'
import { createRunStore } from '../store/run-store.ts'
import { createWorkflows } from '../workflows/workflows.ts'
import { createApp } from './create-app.ts'

const origin = 'http://localhost:8470'

const idSchema = z.object({ id: z.string() })
const answerSchema = z.object({
  runId: z.string(),
  text: z.string(),
  citations: z.array(z.object({ documentTitle: z.string() })),
  model: z.object({ kind: z.string(), name: z.string(), fallbackReason: z.string().nullable() }),
})
const runSchema = z.object({ leftMachine: z.boolean(), outbound: z.array(z.unknown()) })

const parse = async <Output>(response: Response, schema: z.ZodType<Output>): Promise<Output> => schema.parse(await response.json())

const setUp = (remoteOutcome: Awaited<ReturnType<RemoteModel['complete']>>, localAnswer = 'Local answer [1]') => {
  const database = openDatabase(':memory:')
  const now = () => 1_000
  const localRequests: CompletionRequest[] = []
  const remoteRequests: RemoteRequest[] = []
  const localModel: LocalModel = {
    complete: async (request) => {
      localRequests.push(request)
      return localAnswer
    },
    name: async () => 'gemma-test',
  }
  const remote: RemoteModel = {
    model: 'claude-opus-5-5',
    complete: async (request) => {
      remoteRequests.push(request)
      return remoteOutcome
    },
  }
  const transcriber = { transcribe: async () => 'hello', isReady: async () => true }
  const stores = {
    profiles: createProfileStore(database, now),
    personas: createPersonaStore(database, now),
    documents: createDocumentStore(database, now),
    runs: createRunStore(database, now),
    files: createFileStore(database, now),
  }
  const reviewTemplates = [{ id: 'meeting', name: 'Meeting', sections: ['Summary'] }]
  const workflows = createWorkflows({ ...stores, models: { local: localModel, remote, now }, transcriber, reviewTemplates, fieldAliases: {}, now })
  const app = createApp({
    ...stores,
    workflows,
    localModel,
    transcriber,
    readGatewayStatus: async () => ({ mode: 'sealed', openUntil: null, pendingCount: 0 }),
    remoteModel: 'claude-opus-5-5',
    reviewTemplates,
    allowedHostNames: ['localhost'],
  })
  const request = (path: string, init: RequestInit = {}) =>
    app.request(path, { ...init, headers: { host: 'localhost:8470', origin, ...(init.headers ?? {}) } })
  const postJson = (path: string, body: unknown) =>
    request(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  return { request, postJson, localRequests, remoteRequests, stores }
}

const emptyProfile = {
  label: '',
  firstName: '',
  lastName: '',
  role: '',
  organization: '',
  email: '',
  phone: '',
  street: '',
  postalCode: '',
  city: '',
  country: '',
  languages: [],
  tone: '',
  facts: '',
  signatureImage: null,
}

const firstConversation ='0f8fad5b-d9cb-469f-a165-70867728950e'
const secondConversation = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

describe('the request guard', () => {
  it('refuses an unknown Host and a cross-origin mutation', async () => {
    const { request } = setUp({ ok: false, reason: 'sealed', reachedProvider: false })
    expect((await request('/api/status', { headers: { host: 'evil.example' } })).status).toBe(403)
    expect((await request('/api/personas', { method: 'POST', headers: { origin: 'http://evil.example' }, body: '{}' })).status).toBe(403)
    expect((await request('/api/status')).status).toBe(200)
  })
})

describe('chat over documents', () => {
  it('answers locally with citations from the documents in scope and logs the run', async () => {
    const { request, postJson, localRequests } = setUp({ ok: false, reason: 'unused', reachedProvider: false })
    const upload = new FormData()
    upload.set('file', new File(['The office closes at 18:00 on Fridays.'], 'hours.txt', { type: 'text/plain' }))
    expect((await request('/api/documents', { method: 'POST', body: upload })).status).toBe(201)

    const persona = await parse(await postJson('/api/personas', { name: 'Helper', instructions: 'Be brief.', modelPreference: 'local' }), idSchema)
    const response = await postJson('/api/chat', { profileId: null, personaId: persona.id, conversationId: firstConversation, history: [], message: 'When does the office close on Fridays?' })
    const answer = await parse(response, answerSchema)

    expect(answer.text).toBe('Local answer [1]')
    expect(answer.citations[0]?.documentTitle).toBe('hours.txt')
    expect(answer.model).toEqual({ kind: 'local', name: 'gemma-test', fallbackReason: null })
    expect(localRequests[0]?.messages[0]?.content).toContain('Be brief.')
    expect(localRequests[0]?.messages.at(-1)?.content).toContain('closes at 18:00')

    const runs = await parse(await request('/api/runs'), z.array(z.object({ leftMachine: z.boolean() })))
    expect(runs).toHaveLength(1)
    expect(runs[0]?.leftMachine).toBe(false)
  })
})

describe('continuing a conversation', () => {
  it('returns every exchange of the conversation a run belongs to, and nothing of another', async () => {
    const { request, postJson } = setUp({ ok: false, reason: 'unused', reachedProvider: false })
    const ask = async (conversationId: string, message: string) =>
      parse(await postJson('/api/chat', { profileId: null, personaId: null, conversationId, history: [], message }), answerSchema)
    await ask(firstConversation, 'First question')
    await ask(secondConversation, 'Elsewhere')
    const last = await ask(firstConversation, 'Second question')

    const conversation = await parse(await request(`/api/runs/${last.runId}/conversation`), z.array(z.object({ input: z.string(), conversationId: z.string() })))
    expect(conversation.map((run) => run.input)).toEqual(['First question', 'Second question'])
    expect(new Set(conversation.map((run) => run.conversationId))).toEqual(new Set([firstConversation]))
  })

  it('refuses a chat without a well-formed conversation id', async () => {
    const { postJson } = setUp({ ok: false, reason: 'unused', reachedProvider: false })
    const response = await postJson('/api/chat', { profileId: null, personaId: null, conversationId: 'not-an-id', history: [], message: 'Hi' })
    expect(response.status).toBe(400)
  })

  it('answers 404 for an unknown run', async () => {
    const { request } = setUp({ ok: false, reason: 'unused', reachedProvider: false })
    expect((await request('/api/runs/missing/conversation')).status).toBe(404)
  })
})

describe('remote personas', () => {
  it('falls back to the local model when the gateway refuses, and records the refusal', async () => {
    const { postJson, request, remoteRequests } = setUp({ ok: false, reason: 'The switch is sealed', reachedProvider: false })
    const persona = await parse(await postJson('/api/personas', { name: 'Remote', instructions: '', modelPreference: 'remote' }), idSchema)
    const answer = await parse(await postJson('/api/chat', { profileId: null, personaId: persona.id, conversationId: firstConversation, history: [], message: 'Hello there' }), answerSchema)

    expect(remoteRequests).toHaveLength(1)
    expect(answer.model).toEqual({ kind: 'local', name: 'gemma-test', fallbackReason: 'The switch is sealed' })
    const run = await parse(await request(`/api/runs/${answer.runId}`), runSchema)
    expect(run.outbound).toEqual([{ destination: 'anthropic', sentAt: 1_000, outcome: 'refused', detail: 'The switch is sealed' }])
    expect(run.leftMachine).toBe(false)
  })

  it('uses the remote answer when the gateway lets it through', async () => {
    const { postJson } = setUp({ ok: true, text: 'Remote answer', model: 'claude-opus-5-5' })
    const persona = await parse(await postJson('/api/personas', { name: 'Remote', instructions: '', modelPreference: 'remote' }), idSchema)
    const answer = await parse(await postJson('/api/chat', { profileId: null, personaId: persona.id, conversationId: firstConversation, history: [], message: 'Hello there' }), answerSchema)
    expect(answer.text).toBe('Remote answer')
    expect(answer.model.kind).toBe('remote')
  })
})

describe('reading a document into a profile', () => {
  it('asks only the local model for the details, returns them to check and logs the run', async () => {
    const modelAnswer = 'Here you go: {"firstName":"Erika","lastName":"Mustermann","city":"Berlin","languages":["German"],"facts":"Date of birth: 12.08.1990"}'
    const { request, postJson, localRequests, remoteRequests } = setUp({ ok: true, text: 'unused', model: 'claude-opus-5-5' }, modelAnswer)
    await postJson('/api/personas', { name: 'Remote', instructions: '', modelPreference: 'remote' })
    const upload = new FormData()
    upload.set('file', new File(['Name: Erika Mustermann\nBorn 12.08.1990 in Berlin'], 'data-sheet.txt', { type: 'text/plain' }))
    const response = await request('/api/profiles/read-document', { method: 'POST', body: upload })
    const reading = await parse(response, z.object({ runId: z.string(), fileName: z.string(), details: z.record(z.string(), z.unknown()) }))

    expect(reading.fileName).toBe('data-sheet.txt')
    expect(reading.details).toEqual({
      firstName: 'Erika',
      lastName: 'Mustermann',
      role: '',
      organization: '',
      email: '',
      phone: '',
      street: '',
      postalCode: '',
      city: 'Berlin',
      country: '',
      languages: ['German'],
      facts: 'Date of birth: 12.08.1990',
    })
    expect(remoteRequests).toHaveLength(0)
    expect(localRequests[0]?.messages.at(-1)?.content).toContain('Born 12.08.1990 in Berlin')
    const run = await parse(await request(`/api/runs/${reading.runId}`), z.object({ workflow: z.string(), leftMachine: z.boolean() }))
    expect(run).toEqual(expect.objectContaining({ workflow: 'profile', leftMachine: false }))
  })

  it('says so when the model gives nothing it can read', async () => {
    const { request } = setUp({ ok: false, reason: '', reachedProvider: false }, 'I cannot help with that')
    const upload = new FormData()
    upload.set('file', new File(['Nothing about a person'], 'note.txt', { type: 'text/plain' }))
    expect((await request('/api/profiles/read-document', { method: 'POST', body: upload })).status).toBe(422)
  })
})

describe('form suggestions', () => {
  it('give the model the passages of the profile’s documents', async () => {
    const { request, postJson, localRequests } = setUp({ ok: false, reason: '', reachedProvider: false })
    const profile = await parse(await postJson('/api/profiles', { ...emptyProfile, label: 'Erika' }), idSchema)
    const document = new FormData()
    document.set('file', new File(['Date of birth: 12.08.1990. Nationality: German.'], 'data-sheet.txt', { type: 'text/plain' }))
    document.set('profileId', profile.id)
    await request('/api/documents', { method: 'POST', body: document })

    const pdf = await PDFDocument.create()
    pdf.getForm().createTextField('Date of birth').addToPage(pdf.addPage([600, 400]), { x: 50, y: 300, width: 200, height: 20 })
    const form = new FormData()
    form.set('file', new File([await pdf.save()], 'application.pdf', { type: 'application/pdf' }))
    form.set('profileId', profile.id)
    expect((await request('/api/forms/inspect', { method: 'POST', body: form })).status).toBe(200)
    expect(localRequests[0]?.messages.at(-1)?.content).toContain('Date of birth: 12.08.1990')
  })
})

describe('previewing a document', () => {
  it('returns the text kept for it, and 404 for an unknown one', async () => {
    const { request } = setUp({ ok: false, reason: 'unused', reachedProvider: false })
    const upload = new FormData()
    upload.set('file', new File(['Parking is behind the building.'], 'parking.txt', { type: 'text/plain' }))
    const added = await parse(await request('/api/documents', { method: 'POST', body: upload }), idSchema)

    const preview = await parse(await request(`/api/documents/${added.id}`), z.object({ title: z.string(), text: z.string() }))
    expect(preview).toEqual(expect.objectContaining({ title: 'parking.txt', text: 'Parking is behind the building.' }))
    expect((await request('/api/documents/unknown')).status).toBe(404)
  })
})

describe('stopping an operation', () => {
  it('hands the request’s abort signal to the local model, so closing the request stops the model call', async () => {
    const { request, localRequests } = setUp({ ok: false, reason: 'unused', reachedProvider: false })
    const controller = new AbortController()
    await request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profileId: null, personaId: null, conversationId: firstConversation, history: [], message: 'Hello' }),
      signal: controller.signal,
    })
    expect(localRequests[0]?.signal.aborted).toBe(false)
    controller.abort()
    expect(localRequests[0]?.signal.aborted).toBe(true)
  })
})

describe('validation', () => {
  it('rejects a malformed profile', async () => {
    const { postJson } = setUp({ ok: false, reason: '', reachedProvider: false })
    const response = await postJson('/api/profiles', { label: '' })
    expect(response.status).toBe(400)
  })
})

describe('unknown API paths', () => {
  it('answer 404 in JSON instead of falling through to the web app', async () => {
    const { request } = setUp({ ok: false, reason: '', reachedProvider: false })
    const response = await request('/api/nope')
    expect(response.status).toBe(404)
  })
})
