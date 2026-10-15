import type { ModelUsed, OutboundRecord, Persona } from '@offee/contracts'
import type { ChatMessage, LocalModel } from './local-model.ts'
import type { RemoteModel } from './remote-model.ts'

export type Generation = {
  text: string
  model: ModelUsed
  outbound: OutboundRecord[]
}

export type GenerateRequest = {
  persona: Persona | undefined
  system: string
  messages: { role: 'user' | 'assistant'; content: string }[]
  maxTokens: number
  jsonSchema?: Record<string, unknown>
  signal: AbortSignal
}

export type Models = {
  local: LocalModel
  remote: RemoteModel
  now: () => number
}

const localName = async (local: LocalModel): Promise<string> => (await local.name()) ?? 'local model'

/**
 * Answers with the persona's preferred model. A persona allowed to go remote tries Claude
 * through the gateway first and falls back to the local model, saying why, when the switch or
 * the provider says no.
 * @param models The local and remote models, and the clock.
 * @param request The persona, prompt and limits.
 * @returns The text, which model wrote it, and what left the machine.
 */
export const generate = async (models: Models, request: GenerateRequest): Promise<Generation> => {
  const runLocal = async (fallbackReason: string | null, outbound: OutboundRecord[]): Promise<Generation> => {
    const messages: ChatMessage[] = [{ role: 'system', content: request.system }, ...request.messages]
    const text = await models.local.complete({
      messages,
      maxTokens: request.maxTokens,
      signal: request.signal,
      ...(request.jsonSchema === undefined ? {} : { jsonSchema: request.jsonSchema }),
    })
    return { text, model: { kind: 'local', name: await localName(models.local), fallbackReason }, outbound }
  }

  if (request.persona?.modelPreference !== 'remote') return runLocal(null, [])

  const outcome = await models.remote.complete({ system: request.system, messages: request.messages, maxTokens: Math.max(request.maxTokens, 4096), signal: request.signal })
  if (outcome.ok) {
    return {
      text: outcome.text,
      model: { kind: 'remote', name: outcome.model, fallbackReason: null },
      outbound: [{ destination: 'anthropic', sentAt: models.now(), outcome: 'sent', detail: `Answered by ${outcome.model}` }],
    }
  }
  const record: OutboundRecord = {
    destination: 'anthropic',
    sentAt: models.now(),
    outcome: outcome.reachedProvider ? 'sent' : 'refused',
    detail: outcome.reason,
  }
  return runLocal(outcome.reason, [record])
}
