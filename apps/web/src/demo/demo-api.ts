import { z } from 'zod'
import type { DocumentAssignment, DocumentSummary, FormField, Persona, Profile, RunDetail, RunSummary, StoredItem, StoredItemKind, WorkflowContext, WorkflowKind } from '@offee/contracts'
import reviewTemplatesFile from '../../../../config/review-templates.json'
import { reviewTemplateSchema } from '@/lib/schemas'
import type { DemoDocument, OffeeApi } from '@/lib/types'
import { answerFromDocuments, demoTranscript, describeDemoTranslation, draftReply, reviewFromSentences } from './canned-answers'
import { demoLocalModel, demoModelName, samplePersonas, sampleProfiles, sampleDocuments, sampleRuns } from './sample-data'

// The same templates the server offers, read from the same file.
const reviewTemplates = z.array(reviewTemplateSchema).parse(reviewTemplatesFile)

// A model answers in seconds on a Mac; the pause lets a visitor see the page while it works.
const demoAnswerDelayMilliseconds = 1200

const pause = (signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, demoAnswerDelayMilliseconds)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new Error('Stopped'))
    })
  })

const plainTextFile = (file: File): boolean => file.type.startsWith('text/') || /\.(txt|md|csv|eml)$/i.test(file.name)

const readPlainText = async (file: File): Promise<string> => {
  if (!plainTextFile(file)) throw new Error('Demo mode reads plain text files only. On your machine Offee also reads PDF, Word and email files.')
  return (await file.text()).trim()
}

const sampleFormFields: FormField[] = [
  { name: 'First name', kind: 'text', options: [] },
  { name: 'Last name', kind: 'text', options: [] },
  { name: 'Email', kind: 'text', options: [] },
  { name: 'City', kind: 'text', options: [] },
  { name: 'Country', kind: 'dropdown', options: ['Germany', 'Italy', 'Other'] },
  { name: 'Purpose of the trip', kind: 'text', options: [] },
  { name: 'I confirm the details are correct', kind: 'checkbox', options: [] },
  { name: 'Signature', kind: 'signature', options: [] },
]

const profileValueOf = (fieldName: string, profile: Profile | undefined): string => {
  if (profile === undefined) return ''
  const values: Record<string, string> = {
    'First name': profile.firstName,
    'Last name': profile.lastName,
    Email: profile.email,
    City: profile.city,
    Country: profile.country,
  }
  return values[fieldName] ?? ''
}

const usableBy = (context: WorkflowContext) => (document: DemoDocument) =>
  (document.profileId === null && document.personaId === null) ||
  (document.profileId !== null && document.profileId === context.profileId) ||
  (document.personaId !== null && document.personaId === context.personaId)

// The server keeps a document's text and a run's content to itself in its lists; so does the demo.
const documentSummaryOf = (document: DemoDocument): DocumentSummary => ({
  id: document.id,
  title: document.title,
  mimeType: document.mimeType,
  characterCount: document.characterCount,
  profileId: document.profileId,
  personaId: document.personaId,
  createdAt: document.createdAt,
})

const runSummaryOf = (run: RunDetail): RunSummary => ({
  id: run.id,
  workflow: run.workflow,
  title: run.title,
  model: run.model,
  leftMachine: run.leftMachine,
  createdAt: run.createdAt,
})

const missing = (what: string): Error => new Error(`That ${what} is not in the demo data`)

/**
 * Creates the in-page API demo mode uses in place of the Offee server. Everything lives in this
 * page and is gone on reload; nothing typed or uploaded leaves the browser.
 * @returns The demo API.
 */
export const createDemoApi = (): OffeeApi => {
  const memory: {
    profiles: Profile[]
    personas: Persona[]
    documents: DemoDocument[]
    runs: RunDetail[]
    files: Map<string, { name: string; url: string; bytes: number; createdAt: number }>
  } = {
    profiles: sampleProfiles,
    personas: samplePersonas,
    documents: sampleDocuments,
    runs: sampleRuns(Date.now()),
    files: new Map(),
  }

  const newId = (): string => crypto.randomUUID()

  const record = (workflow: WorkflowKind, title: string, input: string, output: string, conversationId: string | null = null): RunDetail => {
    const run: RunDetail = {
      id: newId(),
      workflow,
      title,
      model: workflow === 'transcribe' ? null : demoLocalModel,
      leftMachine: false,
      createdAt: Date.now(),
      conversationId,
      input,
      output,
      outbound: [],
    }
    memory.runs = [run, ...memory.runs]
    return run
  }

  const profileOf = (id: string | null): Profile | undefined => memory.profiles.find((profile) => profile.id === id)

  const runOf = (id: string): RunDetail => {
    const run = memory.runs.find((candidate) => candidate.id === id)
    if (run === undefined) throw missing('run')
    return run
  }

  const keepFile = (file: File): string => {
    const id = newId()
    memory.files.set(id, { name: file.name, url: URL.createObjectURL(file), bytes: file.size, createdAt: Date.now() })
    return id
  }

  return {
    status: async () => ({
      gateway: { mode: 'sealed', openUntil: null, pendingCount: 0 },
      chatModel: demoModelName,
      transcriptionReady: true,
      remoteModel: 'remote model (demo)',
    }),
    profiles: async () => memory.profiles,
    createProfile: async (input) => {
      const profile: Profile = { ...input, id: newId(), hasCertificate: false, createdAt: Date.now() }
      memory.profiles = [...memory.profiles, profile]
      return profile
    },
    updateProfile: async (id, input) => {
      const current = profileOf(id)
      if (current === undefined) throw missing('profile')
      const profile: Profile = { ...current, ...input }
      memory.profiles = memory.profiles.map((candidate) => (candidate.id === id ? profile : candidate))
      return profile
    },
    deleteProfile: async (id) => {
      memory.profiles = memory.profiles.filter((profile) => profile.id !== id)
    },
    readProfileDocument: async () => {
      throw new Error('Demo mode has no model to read a document. On your machine Offee reads the details into the profile for you to check.')
    },
    personas: async () => memory.personas,
    createPersona: async (input) => {
      const persona: Persona = { ...input, id: newId(), createdAt: Date.now() }
      memory.personas = [...memory.personas, persona]
      return persona
    },
    updatePersona: async (id, input) => {
      const current = memory.personas.find((persona) => persona.id === id)
      if (current === undefined) throw missing('persona')
      const persona: Persona = { ...current, ...input }
      memory.personas = memory.personas.map((candidate) => (candidate.id === id ? persona : candidate))
      return persona
    },
    deletePersona: async (id) => {
      memory.personas = memory.personas.filter((persona) => persona.id !== id)
    },
    documents: async () => memory.documents.map(documentSummaryOf),
    document: async (id) => {
      const document = memory.documents.find((candidate) => candidate.id === id)
      if (document === undefined) throw missing('document')
      return document
    },
    uploadDocument: async (file, assignment) => {
      const text = await readPlainText(file)
      const document: DemoDocument = {
        id: newId(),
        title: file.name,
        mimeType: file.type === '' ? 'text/plain' : file.type,
        characterCount: text.length,
        ...assignment,
        createdAt: Date.now(),
        text,
      }
      memory.documents = [...memory.documents, document]
      return documentSummaryOf(document)
    },
    assignDocument: async (id, assignment: DocumentAssignment) => {
      memory.documents = memory.documents.map((document) => (document.id === id ? { ...document, ...assignment } : document))
    },
    deleteDocument: async (id) => {
      memory.documents = memory.documents.filter((document) => document.id !== id)
    },
    extractText: async (file) => ({ text: await readPlainText(file) }),
    chat: async (request, signal) => {
      await pause(signal)
      const answer = answerFromDocuments(request.message, memory.documents.filter(usableBy(request)))
      const run = record('chat', request.message.slice(0, 80), request.message, answer.text, request.conversationId)
      return { runId: run.id, text: answer.text, citations: answer.citations, model: demoLocalModel, outputFileId: null }
    },
    reply: async (request, signal) => {
      await pause(signal)
      const text = draftReply(request.guidance, profileOf(request.profileId))
      const run = record('reply', `Reply: ${request.thread.slice(0, 60)}`, request.thread, text)
      return { runId: run.id, text, citations: [], model: demoLocalModel, outputFileId: null }
    },
    translate: async (request, signal) => {
      await pause(signal)
      const text = describeDemoTranslation(request.text, request.targetLanguage)
      const run = record('translate', `Translation into ${request.targetLanguage}`, request.text, text)
      return { runId: run.id, text, citations: [], model: demoLocalModel, outputFileId: null }
    },
    reviewTemplates: async () => reviewTemplates,
    review: async (request, signal) => {
      const template = reviewTemplates.find((candidate) => candidate.id === request.templateId)
      if (template === undefined) throw missing('review template')
      await pause(signal)
      const text = reviewFromSentences(request.source, template)
      const run = record('review', `${template.name} review`, request.source, text)
      return { runId: run.id, text, citations: [], model: demoLocalModel, outputFileId: null }
    },
    transcribe: async (file, signal) => {
      await pause(signal)
      const run = record('transcribe', `Transcript of ${file.name}`, file.name, demoTranscript)
      return { runId: run.id, text: demoTranscript }
    },
    inspectForm: async (file, context, signal) => {
      await pause(signal)
      const profile = profileOf(context.profileId)
      return {
        formFileId: keepFile(file),
        fileName: file.name,
        fields: sampleFormFields,
        suggestions: sampleFormFields.map((field) => {
          const value = profileValueOf(field.name, profile)
          if (value !== '') return { name: field.name, value, source: 'profile' }
          if (field.name === 'Purpose of the trip') return { name: field.name, value: 'Launch meeting with the press team', source: 'model' }
          return { name: field.name, value: '', source: 'none' }
        }),
        model: demoLocalModel,
      }
    },
    fillForm: async (request) => {
      const signed = request.sign && profileOf(request.profileId)?.hasCertificate === true
      const filled = request.values.map((value) => `${value.name}: ${value.value}`).join('\n')
      const run = record('form', `${signed ? 'Filled and signed' : 'Filled'} ${memory.files.get(request.formFileId)?.name ?? 'form'}`, filled, 'Demo mode returns the form as it was uploaded; on your machine Offee fills and signs it.')
      return { runId: run.id, outputFileId: request.formFileId, signed }
    },
    runs: async () => memory.runs.map(runSummaryOf),
    run: async (id) => runOf(id),
    runConversation: async (id) => {
      const run = runOf(id)
      if (run.conversationId === null) return [run]
      return memory.runs.filter((candidate) => candidate.conversationId === run.conversationId).toSorted((first, second) => first.createdAt - second.createdAt)
    },
    fileUrl: (id) => memory.files.get(id)?.url ?? '#',
    storedData: async () =>
      [
        ...memory.profiles.map((profile): StoredItem => ({ kind: 'profile', id: profile.id, title: profile.label, bytes: JSON.stringify(profile).length, createdAt: profile.createdAt })),
        ...memory.personas.map((persona): StoredItem => ({ kind: 'persona', id: persona.id, title: persona.name, bytes: JSON.stringify(persona).length, createdAt: persona.createdAt })),
        ...memory.documents.map((document): StoredItem => ({ kind: 'document', id: document.id, title: document.title, bytes: document.characterCount, createdAt: document.createdAt })),
        ...[...memory.files].map(([id, file]): StoredItem => ({ kind: 'file', id, title: file.name, bytes: file.bytes, createdAt: file.createdAt })),
        ...memory.runs.map((run): StoredItem => ({ kind: 'run', id: run.id, title: run.title, bytes: run.input.length + run.output.length, createdAt: run.createdAt })),
      ].toSorted((first, second) => second.createdAt - first.createdAt),
    deleteStoredItems: async (items) => {
      const chosen = new Set(items.map(({ kind, id }) => `${kind}:${id}`))
      const kept = (kind: StoredItemKind) => (item: { id: string }) => !chosen.has(`${kind}:${item.id}`)
      memory.profiles = memory.profiles.filter(kept('profile'))
      memory.personas = memory.personas.filter(kept('persona'))
      memory.documents = memory.documents.filter(kept('document'))
      memory.runs = memory.runs.filter(kept('run'))
      items.filter((item) => item.kind === 'file').forEach((item) => memory.files.delete(item.id))
    },
    deleteAllStoredData: async () => {
      memory.profiles = []
      memory.personas = []
      memory.documents = []
      memory.files.clear()
      memory.runs = []
    },
  }
}
