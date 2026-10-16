import type {
  ChatRequest,
  FormFillRequest,
  FormFillResult,
  FormInspection,
  Persona,
  PlacedField,
  ProfileReading,
  ReplyRequest,
  ReviewRequest,
  ReviewTemplate,
  TranscriptionResult,
  TranslateRequest,
  WorkflowContext,
  WorkflowResult,
} from '@offee/contracts'
import { textToDocx } from '../exports/docx-export.ts'
import { createSigningCertificate } from '../forms/certificate.ts'
import type { FieldAliases } from '../forms/match-fields.ts'
import { suggestFromProfile } from '../forms/match-fields.ts'
import type { TextLine } from '../forms/flat-form.ts'
import { addPlacedFields, fieldPlacementSchema, fieldPlacementsFromModelAnswer, readTextLines, usablePlacedFields } from '../forms/flat-form.ts'
import { decryptPdf, fillForm, readFormFields } from '../forms/pdf-form.ts'
import { chunkText } from '../knowledge/chunk-text.ts'
import type { Generation, Models } from '../llm/generate.ts'
import { generate } from '../llm/generate.ts'
import type { DocumentStore } from '../store/document-store.ts'
import type { FileStore } from '../store/file-store.ts'
import type { PersonaStore, ProfileStore } from '../store/profile-store.ts'
import type { RunStore } from '../store/run-store.ts'
import type { Transcriber } from '../transcription/transcriber.ts'
import { batchByLength } from './batch-by-length.ts'
import { suggestionsFromModelAnswer, formSchemaFor } from './form-answer.ts'
import { inSequence } from './in-sequence.ts'
import { profileDetailsFromModelAnswer, profileDetailsSchema } from './profile-details.ts'
import { chatTask, condenseTask, fieldPlacementTask, formTask, knowledgeBlock, profileDetailsTask, replyTask, reviewTask, systemPrompt, translateTask } from './prompts.ts'

export type WorkflowDependencies = {
  profiles: ProfileStore
  personas: PersonaStore
  documents: DocumentStore
  runs: RunStore
  files: FileStore
  models: Models
  transcriber: Transcriber
  reviewTemplates: ReviewTemplate[]
  fieldAliases: FieldAliases
  now: () => number
}

const docxMimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

// Short chunks leave room for the translation itself within a 16k-token local context.
const translationChunkLength = 3000
const reviewDirectLimit = 24_000
const condenseChunkLength = 12_000
// A document about a person states the details early; the rest would only crowd the context.
const profileDocumentLimit = 24_000

// A long form is read in batches, each with room for its answer within a 16k-token local context.
const placementBatchLength = 12_000
const suggestionBatchLength = 8_000

const listingLineOf = (line: TextLine): string => `${line.id} (${line.page}): ${line.text}`

const combine = (generations: Generation[]): Pick<Generation, 'model' | 'outbound'> => ({
  model: generations.at(-1)?.model ?? { kind: 'local', name: 'local model', fallbackReason: null },
  outbound: generations.flatMap((generation) => generation.outbound),
})

/**
 * The office workflows, each recorded in the run log.
 * @param dependencies Stores, models, transcriber, templates, aliases and clock.
 * @returns The workflows.
 */
export const createWorkflows = (dependencies: WorkflowDependencies) => {
  const resolve = (context: WorkflowContext) => ({
    profile: context.profileId === null ? undefined : dependencies.profiles.get(context.profileId),
    persona: context.personaId === null ? undefined : dependencies.personas.get(context.personaId),
  })

  // A PDF drawn without fields gets them from the model reading its labels; one with no text layer gets none.
  const placeFields = async (upload: { name: string; content: Uint8Array }, persona: Persona | undefined, signal: AbortSignal): Promise<PlacedField[]> => {
    if ((await readFormFields(upload.content)).length > 0) return []
    const lines = await readTextLines(upload.content)
    if (lines.length === 0) return []
    const batches = batchByLength(lines, (line) => listingLineOf(line).length + 1, placementBatchLength)
    const generations = await inSequence(batches, (batch) =>
      generate(dependencies.models, {
        persona,
        system: systemPrompt(persona, undefined, fieldPlacementTask),
        messages: [{ role: 'user', content: `<form>\n${batch.map(listingLineOf).join('\n')}\n</form>` }],
        maxTokens: 4096,
        signal,
        jsonSchema: fieldPlacementSchema,
      }),
    )
    dependencies.runs.record({
      workflow: 'form',
      title: `Fields placed on ${upload.name}`,
      ...combine(generations),
      input: lines.map(listingLineOf).join('\n'),
      output: generations.map((generation) => generation.text).join('\n\n'),
    })
    return usablePlacedFields(
      generations.flatMap((generation) => fieldPlacementsFromModelAnswer(generation.text, lines)),
      lines,
    )
  }

  // The form is kept without the placed fields, so a correction to where they go applies on save.
  const withPlacedFields = async (content: Uint8Array, placedFields: PlacedField[]): Promise<Uint8Array> =>
    placedFields.length === 0 ? content : addPlacedFields(content, placedFields, await readTextLines(content))

  const storeDocx = async (title: string, text: string): Promise<string> =>
    dependencies.files.put({ name: `${title.replace(/[^\p{L}\p{N} _-]+/gu, '').trim() || 'offee'}.docx`, mimeType: docxMimeType, content: await textToDocx(title, text) })

  return {
    chat: async (request: ChatRequest, signal: AbortSignal): Promise<WorkflowResult> => {
      const { profile, persona } = resolve(request)
      const citations = dependencies.documents.search(request.message, request)
      const generation = await generate(dependencies.models, {
        persona,
        system: systemPrompt(persona, profile, chatTask),
        messages: [...request.history, { role: 'user', content: `${knowledgeBlock(citations)}\n\nQuestion: ${request.message}` }],
        maxTokens: 2048,
        signal,
      })
      const runId = dependencies.runs.record({
        workflow: 'chat',
        conversationId: request.conversationId,
        title: request.message.slice(0, 80),
        model: generation.model,
        input: request.message,
        output: generation.text,
        outbound: generation.outbound,
      })
      return { runId, text: generation.text, citations, model: generation.model, outputFileId: null }
    },

    reply: async (request: ReplyRequest, signal: AbortSignal): Promise<WorkflowResult> => {
      const { profile, persona } = resolve(request)
      const citations = dependencies.documents.search(`${request.thread.slice(-4000)} ${request.guidance}`, request)
      const generation = await generate(dependencies.models, {
        persona,
        system: systemPrompt(persona, profile, replyTask),
        messages: [
          {
            role: 'user',
            content: [
              knowledgeBlock(citations),
              `The thread:\n<thread>\n${request.thread}\n</thread>`,
              request.guidance.trim() === '' ? '' : `What the reply should say: ${request.guidance}`,
            ]
              .filter((part) => part !== '')
              .join('\n\n'),
          },
        ],
        maxTokens: 2048,
        signal,
      })
      const runId = dependencies.runs.record({
        workflow: 'reply',
        title: `Reply: ${request.thread.split('\n').find((line) => line.toLowerCase().startsWith('subject:'))?.slice(8).trim() ?? request.thread.slice(0, 60)}`,
        model: generation.model,
        input: request.thread,
        output: generation.text,
        outbound: generation.outbound,
      })
      return { runId, text: generation.text, citations, model: generation.model, outputFileId: null }
    },

    translate: async (request: TranslateRequest, signal: AbortSignal): Promise<WorkflowResult> => {
      const { profile, persona } = resolve(request)
      const system = systemPrompt(persona, profile, translateTask(request.targetLanguage, request.glossary))
      const generations = await inSequence(chunkText(request.text, translationChunkLength), (chunk) =>
        generate(dependencies.models, { persona, system, messages: [{ role: 'user', content: chunk }], maxTokens: 4096, signal }),
      )
      const text = generations.map((generation) => generation.text).join('\n\n')
      const { model, outbound } = combine(generations)
      const title = `Translation into ${request.targetLanguage}`
      const outputFileId = await storeDocx(title, text)
      const runId = dependencies.runs.record({ workflow: 'translate', title, model, input: request.text, output: text, outbound })
      return { runId, text, citations: [], model, outputFileId }
    },

    review: async (request: ReviewRequest, signal: AbortSignal): Promise<WorkflowResult> => {
      const { profile, persona } = resolve(request)
      const template = dependencies.reviewTemplates.find((candidate) => candidate.id === request.templateId)
      if (template === undefined) throw new Error('Unknown review template')

      // A source too long for one request is condensed part by part first, keeping every fact.
      const condensed =
        request.source.length <= reviewDirectLimit
          ? []
          : await inSequence(chunkText(request.source, condenseChunkLength), (part) =>
              generate(dependencies.models, {
                persona,
                system: systemPrompt(persona, profile, condenseTask),
                messages: [{ role: 'user', content: part }],
                maxTokens: 2048,
                signal,
              }),
            )
      const material = condensed.length === 0 ? request.source : condensed.map((generation) => generation.text).join('\n\n')
      const final = await generate(dependencies.models, {
        persona,
        system: systemPrompt(persona, profile, reviewTask(template)),
        messages: [{ role: 'user', content: `<material>\n${material}\n</material>` }],
        maxTokens: 4096,
        signal,
      })
      const { model, outbound } = combine([...condensed, final])
      const title = `${template.name} review`
      const outputFileId = await storeDocx(title, final.text)
      const runId = dependencies.runs.record({ workflow: 'review', title, model, input: request.source, output: final.text, outbound })
      return { runId, text: final.text, citations: [], model, outputFileId }
    },

    transcribe: async (audio: { name: string; content: Uint8Array }, signal: AbortSignal): Promise<TranscriptionResult> => {
      const text = await dependencies.transcriber.transcribe(audio, signal)
      const runId = dependencies.runs.record({
        workflow: 'transcribe',
        title: `Transcript of ${audio.name}`,
        model: { kind: 'local', name: 'whisper.cpp', fallbackReason: null },
        input: audio.name,
        output: text,
        outbound: [],
      })
      return { runId, text }
    },

    inspectForm: async (encryptedUpload: { name: string; content: Uint8Array }, context: WorkflowContext, signal: AbortSignal): Promise<FormInspection> => {
      const { profile, persona } = resolve(context)
      // Kept decrypted, so saving the filled form reads the same fields.
      const upload = { ...encryptedUpload, content: await decryptPdf(encryptedUpload.content) }
      const placedFields = await placeFields(upload, persona, signal)
      const fields = await readFormFields(await withPlacedFields(upload.content, placedFields))
      const formFileId = dependencies.files.put({ name: upload.name, mimeType: 'application/pdf', content: upload.content })
      const today = new Date(dependencies.now()).toLocaleDateString('en-GB')
      const fromProfile = profile === undefined ? fields.map((field) => ({ name: field.name, value: '', source: 'none' as const })) : suggestFromProfile(fields, profile, dependencies.fieldAliases, today)
      const unanswered = fields.filter(
        (field) => field.kind !== 'signature' && fromProfile.find((suggestion) => suggestion.name === field.name)?.source === 'none',
      )
      if (profile === undefined || unanswered.length === 0) return { formFileId, fileName: upload.name, fields, suggestions: fromProfile, model: null, placedFields }

      const describeField = (field: (typeof unanswered)[number]): string => JSON.stringify({ name: field.name, kind: field.kind, options: field.options })
      const batches = batchByLength(unanswered, (field) => describeField(field).length + 1, suggestionBatchLength)
      const generations = await inSequence(batches, (batch) =>
        generate(dependencies.models, {
          persona,
          system: systemPrompt(persona, profile, formTask),
          messages: [
            {
              role: 'user',
              content: `${knowledgeBlock(dependencies.documents.search(batch.map((field) => field.name).join(' '), context))}\n\nToday is ${today}. Fields to fill:\n[${batch.map(describeField).join(',')}]`,
            },
          ],
          maxTokens: 2048,
          signal,
          jsonSchema: formSchemaFor(batch),
        }),
      )
      const suggestions = generations.reduce((current, generation) => suggestionsFromModelAnswer(current, generation.text), fromProfile)
      const { model, outbound } = combine(generations)
      dependencies.runs.record({
        workflow: 'form',
        title: `Suggestions for ${upload.name}`,
        model,
        input: JSON.stringify(unanswered),
        output: generations.map((generation) => generation.text).join('\n\n'),
        outbound,
      })
      return { formFileId, fileName: upload.name, fields, suggestions, model, placedFields }
    },

    // Always the local model, whatever the persona allows: a document about a person stays here.
    readProfileDocument: async (document: { name: string; text: string }, signal: AbortSignal): Promise<ProfileReading> => {
      const generation = await generate(dependencies.models, {
        persona: undefined,
        system: systemPrompt(undefined, undefined, profileDetailsTask),
        messages: [{ role: 'user', content: `<document>\n${document.text.slice(0, profileDocumentLimit)}\n</document>` }],
        maxTokens: 2048,
        signal,
        jsonSchema: profileDetailsSchema(),
      })
      const runId = dependencies.runs.record({
        workflow: 'profile',
        title: `Profile details from ${document.name}`,
        model: generation.model,
        input: document.text,
        output: generation.text,
        outbound: generation.outbound,
      })
      const details = profileDetailsFromModelAnswer(generation.text)
      if (details === null) throw new Error(`No details about a person found in ${document.name}`)
      return { runId, fileName: document.name, details, model: generation.model }
    },

    fillForm: async (request: FormFillRequest): Promise<FormFillResult> => {
      const form = dependencies.files.get(request.formFileId)
      const profile = dependencies.profiles.get(request.profileId)
      if (form === undefined || profile === undefined) throw new Error('The form or the profile no longer exists')

      const certificate = request.sign
        ? (dependencies.profiles.readCertificate(profile.id) ??
          (() => {
            const created = createSigningCertificate(profile, new Date(dependencies.now()))
            dependencies.profiles.saveCertificate(profile.id, created)
            return created
          })())
        : null
      const filled = await fillForm(await withPlacedFields(form.content, request.placedFields), {
        values: request.values,
        sign: certificate === null ? null : { profile, certificate, now: new Date(dependencies.now()) },
      })
      const outputName = form.name.replace(/\.pdf$/i, '') + (request.sign ? ' (signed).pdf' : ' (filled).pdf')
      const outputFileId = dependencies.files.put({ name: outputName, mimeType: 'application/pdf', content: filled })
      const runId = dependencies.runs.record({
        workflow: 'form',
        title: `${request.sign ? 'Filled and signed' : 'Filled'} ${form.name}`,
        model: null,
        input: JSON.stringify(request.values),
        output: outputName,
        outbound: [],
      })
      return { runId, outputFileId, signed: request.sign }
    },
  }
}

export type Workflows = ReturnType<typeof createWorkflows>
