import { mkdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { z } from 'zod'
import { createApp } from './app/create-app.ts'
import { fieldAliasesSchema } from '@offee/field-matching'
import { createLocalModel } from './llm/local-model.ts'
import { createRemoteModel } from './llm/remote-model.ts'
import { readSettings } from './runtime/settings.ts'
import { openDatabase } from './store/database.ts'
import { createDocumentStore } from './store/document-store.ts'
import { createFileStore } from './store/file-store.ts'
import { createPersonaStore, createProfileStore } from './store/profile-store.ts'
import { createRunStore } from './store/run-store.ts'
import { createStoredData } from './store/stored-data.ts'
import { createTranscriber } from './transcription/transcriber.ts'
import { createWorkflows } from './workflows/workflows.ts'

const workspaceRoot = fileURLToPath(new URL('../../../', import.meta.url))
const settings = readSettings(process.env, workspaceRoot)
const now = () => Date.now()

const reviewTemplateListSchema = z.array(z.object({ id: z.string().min(1), name: z.string().min(1), sections: z.array(z.string().min(1)).min(1) }))
const gatewayStatusSchema = z.object({ mode: z.enum(['sealed', 'ask', 'open']), openUntil: z.number().nullable(), pendingCount: z.number() })

const readConfig = <Output>(fileName: string, schema: z.ZodType<Output>): Output =>
  schema.parse(JSON.parse(readFileSync(join(settings.configDirectory, fileName), 'utf8')))

mkdirSync(settings.dataDirectory, { recursive: true })
const database = openDatabase(join(settings.dataDirectory, 'offee.sqlite'))

const profiles = createProfileStore(database, now)
const personas = createPersonaStore(database, now)
const documents = createDocumentStore(database, now)
const runs = createRunStore(database, now)
const files = createFileStore(database, now)
const localModel = createLocalModel(settings.chatModelUrl)
const transcriber = createTranscriber(settings.transcriptionUrl)
const reviewTemplates = readConfig('review-templates.json', reviewTemplateListSchema)

const workflows = createWorkflows({
  profiles,
  personas,
  documents,
  runs,
  files,
  models: { local: localModel, remote: createRemoteModel({ gatewayUrl: settings.gatewayUrl, model: settings.remoteModel }), now },
  transcriber,
  reviewTemplates,
  fieldAliases: readConfig('form-field-aliases.json', fieldAliasesSchema),
  now,
})

const readGatewayStatus = async () => {
  try {
    const response = await fetch(`${settings.gatewayUrl}/status`, { signal: AbortSignal.timeout(1500) })
    return response.ok ? gatewayStatusSchema.parse(await response.json()) : null
  } catch {
    return null
  }
}

const app = createApp({
  profiles,
  personas,
  documents,
  runs,
  files,
  storedData: createStoredData(database),
  workflows,
  localModel,
  transcriber,
  readGatewayStatus,
  remoteModel: settings.remoteModel,
  reviewTemplates,
  allowedHostNames: settings.allowedHostNames,
})

// serveStatic resolves its root against the working directory.
const webRoot = relative(process.cwd(), settings.webDistDirectory)
// Built files first (scripts, styles, the icon); any other path is a client route.
app.use('*', serveStatic({ root: webRoot }))
app.get('*', serveStatic({ root: webRoot, rewriteRequestPath: () => '/index.html' }))

serve({ fetch: app.fetch, hostname: settings.listenHost, port: settings.port }, () => {
  process.stdout.write(`offee: listening on ${settings.port}\n`)
})
