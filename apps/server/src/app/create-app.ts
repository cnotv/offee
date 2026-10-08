import { Hono } from 'hono'
import type { Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { secureHeaders } from 'hono/secure-headers'
import type { ZodType } from 'zod'
import type { AppStatus, GatewayStatus, ReviewTemplate } from '@offee/contracts'
import { extractText } from '../documents/extract-text.ts'
import type { LocalModel } from '../llm/local-model.ts'
import { isAllowedHostHeader, isSameOriginRequest } from '../runtime/settings.ts'
import type { DocumentStore } from '../store/document-store.ts'
import type { FileStore } from '../store/file-store.ts'
import type { PersonaStore, ProfileStore } from '../store/profile-store.ts'
import type { RunStore } from '../store/run-store.ts'
import {
  chatRequestSchema,
  documentAssignmentSchema,
  formFillRequestSchema,
  personaInputSchema,
  profileInputSchema,
  replyRequestSchema,
  reviewRequestSchema,
  translateRequestSchema,
} from '../store/schemas.ts'
import type { Transcriber } from '../transcription/transcriber.ts'
import type { Workflows } from '../workflows/workflows.ts'

export type AppDependencies = {
  profiles: ProfileStore
  personas: PersonaStore
  documents: DocumentStore
  runs: RunStore
  files: FileStore
  workflows: Workflows
  localModel: LocalModel
  transcriber: Transcriber
  readGatewayStatus: () => Promise<GatewayStatus | null>
  remoteModel: string
  reviewTemplates: ReviewTemplate[]
  allowedHostNames: string[]
}

const jsonLimit = bodyLimit({ maxSize: 2 * 1024 * 1024, onError: (context) => context.json({ error: 'The body is too large' }, 413) })
const uploadLimit = bodyLimit({ maxSize: 200 * 1024 * 1024, onError: (context) => context.json({ error: 'The file is too large' }, 413) })

const readJson = async <Output>(context: Context, schema: ZodType<Output>): Promise<{ ok: true; data: Output } | { ok: false; error: string }> => {
  const body: unknown = await context.req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') }
}

const readUpload = async (context: Context): Promise<{ file: File; fields: Record<string, string> } | null> => {
  const form = await context.req.formData().catch(() => null)
  const file = form?.get('file')
  if (form === null || form === undefined || !(file instanceof File)) return null
  const fields = Object.fromEntries([...form.entries()].flatMap(([key, value]) => (typeof value === 'string' ? [[key, value]] : [])))
  return { file, fields }
}

const nullableId = (value: string | undefined): string | null => (value === undefined || value === '' ? null : value)

const describeError = (error: unknown): string => (error instanceof Error ? error.message : 'Something went wrong')

/**
 * Builds Offee's HTTP API: the Host and origin guard in front of every route, then profiles,
 * personas, documents, the workflows, files and the run log.
 * @param dependencies Stores, workflows, model clients, gateway status reader and settings.
 * @returns The Hono app.
 */
export const createApp = (dependencies: AppDependencies): Hono => {
  const app = new Hono()

  app.use('*', secureHeaders({ contentSecurityPolicy: { defaultSrc: ["'self'"], imgSrc: ["'self'", 'data:', 'blob:'], styleSrc: ["'self'", "'unsafe-inline'"] } }))
  app.use('*', async (context, next) => {
    const hostHeader = context.req.header('host')
    if (!isAllowedHostHeader(hostHeader, dependencies.allowedHostNames)) return context.json({ error: 'Unknown host' }, 403)
    if (!['GET', 'HEAD'].includes(context.req.method) && !isSameOriginRequest(context.req.header('origin'), hostHeader)) {
      return context.json({ error: 'Cross-origin request refused' }, 403)
    }
    return next()
  })
  app.onError((error, context) => context.json({ error: describeError(error) }, 500))

  app.get('/api/status', async (context) => {
    const [gateway, chatModel, transcriptionReady] = await Promise.all([
      dependencies.readGatewayStatus(),
      dependencies.localModel.name(),
      dependencies.transcriber.isReady(),
    ])
    const status: AppStatus = { gateway, chatModel, transcriptionReady, remoteModel: dependencies.remoteModel }
    return context.json(status)
  })

  app.get('/api/profiles', (context) => context.json(dependencies.profiles.list()))
  app.post('/api/profiles', jsonLimit, async (context) => {
    const input = await readJson(context, profileInputSchema)
    return input.ok ? context.json(dependencies.profiles.create(input.data), 201) : context.json({ error: input.error }, 400)
  })
  app.put('/api/profiles/:id', jsonLimit, async (context) => {
    const input = await readJson(context, profileInputSchema)
    if (!input.ok) return context.json({ error: input.error }, 400)
    return dependencies.profiles.update(context.req.param('id'), input.data) ? context.json(dependencies.profiles.get(context.req.param('id'))) : context.notFound()
  })
  app.delete('/api/profiles/:id', (context) => (dependencies.profiles.remove(context.req.param('id')) ? context.body(null, 204) : context.notFound()))

  app.get('/api/personas', (context) => context.json(dependencies.personas.list()))
  app.post('/api/personas', jsonLimit, async (context) => {
    const input = await readJson(context, personaInputSchema)
    return input.ok ? context.json(dependencies.personas.create(input.data), 201) : context.json({ error: input.error }, 400)
  })
  app.put('/api/personas/:id', jsonLimit, async (context) => {
    const input = await readJson(context, personaInputSchema)
    if (!input.ok) return context.json({ error: input.error }, 400)
    return dependencies.personas.update(context.req.param('id'), input.data) ? context.json(dependencies.personas.get(context.req.param('id'))) : context.notFound()
  })
  app.delete('/api/personas/:id', (context) => (dependencies.personas.remove(context.req.param('id')) ? context.body(null, 204) : context.notFound()))

  app.get('/api/documents', (context) => context.json(dependencies.documents.list()))
  app.post('/api/documents', uploadLimit, async (context) => {
    const upload = await readUpload(context)
    if (upload === null) return context.json({ error: 'Send the document as a "file" field' }, 400)
    try {
      const extracted = await extractText(upload.file.name, upload.file.type, new Uint8Array(await upload.file.arrayBuffer()))
      if (extracted.text === '') return context.json({ error: `No text found in ${upload.file.name}. Scanned pages need OCR, which is not in this build yet.` }, 422)
      const summary = dependencies.documents.add({
        title: upload.file.name,
        mimeType: extracted.mimeType,
        text: extracted.text,
        profileId: nullableId(upload.fields.profileId),
        personaId: nullableId(upload.fields.personaId),
      })
      return context.json(summary, 201)
    } catch (error) {
      return context.json({ error: describeError(error) }, 422)
    }
  })
  app.put('/api/documents/:id', jsonLimit, async (context) => {
    const input = await readJson(context, documentAssignmentSchema)
    if (!input.ok) return context.json({ error: input.error }, 400)
    return dependencies.documents.assign(context.req.param('id'), input.data) ? context.body(null, 204) : context.notFound()
  })
  app.delete('/api/documents/:id', (context) => (dependencies.documents.remove(context.req.param('id')) ? context.body(null, 204) : context.notFound()))

  // Reads a file into text for a workflow's input box, without keeping it.
  app.post('/api/extract', uploadLimit, async (context) => {
    const upload = await readUpload(context)
    if (upload === null) return context.json({ error: 'Send the file as a "file" field' }, 400)
    try {
      const extracted = await extractText(upload.file.name, upload.file.type, new Uint8Array(await upload.file.arrayBuffer()))
      return context.json({ text: extracted.text })
    } catch (error) {
      return context.json({ error: describeError(error) }, 422)
    }
  })

  app.post('/api/chat', jsonLimit, async (context) => {
    const input = await readJson(context, chatRequestSchema)
    return input.ok ? context.json(await dependencies.workflows.chat(input.data)) : context.json({ error: input.error }, 400)
  })
  app.post('/api/workflows/reply', jsonLimit, async (context) => {
    const input = await readJson(context, replyRequestSchema)
    return input.ok ? context.json(await dependencies.workflows.reply(input.data)) : context.json({ error: input.error }, 400)
  })
  app.post('/api/workflows/translate', jsonLimit, async (context) => {
    const input = await readJson(context, translateRequestSchema)
    return input.ok ? context.json(await dependencies.workflows.translate(input.data)) : context.json({ error: input.error }, 400)
  })
  app.get('/api/review-templates', (context) => context.json(dependencies.reviewTemplates))
  app.post('/api/workflows/review', jsonLimit, async (context) => {
    const input = await readJson(context, reviewRequestSchema)
    return input.ok ? context.json(await dependencies.workflows.review(input.data)) : context.json({ error: input.error }, 400)
  })
  app.post('/api/transcribe', uploadLimit, async (context) => {
    const upload = await readUpload(context)
    if (upload === null) return context.json({ error: 'Send the recording as a "file" field' }, 400)
    return context.json(await dependencies.workflows.transcribe({ name: upload.file.name, content: new Uint8Array(await upload.file.arrayBuffer()) }))
  })

  app.post('/api/forms/inspect', uploadLimit, async (context) => {
    const upload = await readUpload(context)
    if (upload === null) return context.json({ error: 'Send the PDF form as a "file" field' }, 400)
    try {
      const inspection = await dependencies.workflows.inspectForm(
        { name: upload.file.name, content: new Uint8Array(await upload.file.arrayBuffer()) },
        { profileId: nullableId(upload.fields.profileId), personaId: nullableId(upload.fields.personaId) },
      )
      return context.json(inspection)
    } catch (error) {
      return context.json({ error: describeError(error) }, 422)
    }
  })
  app.post('/api/forms/fill', jsonLimit, async (context) => {
    const input = await readJson(context, formFillRequestSchema)
    return input.ok ? context.json(await dependencies.workflows.fillForm(input.data)) : context.json({ error: input.error }, 400)
  })

  app.get('/api/files/:id', (context) => {
    const file = dependencies.files.get(context.req.param('id'))
    if (file === undefined) return context.notFound()
    return new Response(Buffer.from(file.content), {
      headers: {
        'content-type': file.mimeType,
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      },
    })
  })

  app.get('/api/runs', (context) => context.json(dependencies.runs.list()))
  app.get('/api/runs/:id', (context) => {
    const run = dependencies.runs.get(context.req.param('id'))
    return run === undefined ? context.notFound() : context.json(run)
  })

  return app
}
