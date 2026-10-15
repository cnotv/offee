import { z } from 'zod'

const transcriptSchema = z.object({ text: z.string() })

export type Transcriber = {
  transcribe: (audio: { name: string; content: Uint8Array }, signal: AbortSignal) => Promise<string>
  isReady: () => Promise<boolean>
}

/**
 * Talks to whisper.cpp's server on the internal network. The server converts any audio format
 * with ffmpeg before transcribing.
 * @param baseUrl Where the server listens.
 * @param fetchFunction The fetch to use, replaceable in tests.
 * @returns The client.
 */
export const createTranscriber = (baseUrl: string, fetchFunction: typeof fetch = fetch): Transcriber => ({
  transcribe: async (audio, signal) => {
    const body = new FormData()
    body.set('file', new Blob([Buffer.from(audio.content)]), audio.name)
    body.set('response_format', 'json')
    body.set('temperature', '0')
    const response = await fetchFunction(`${baseUrl}/inference`, { method: 'POST', body, signal: AbortSignal.any([signal, AbortSignal.timeout(60 * 60_000)]) })
    if (!response.ok) throw new Error(`Transcription failed with ${response.status}: ${(await response.text()).slice(0, 300)}`)
    return transcriptSchema.parse(await response.json()).text.trim()
  },
  isReady: async () => {
    try {
      return (await fetchFunction(`${baseUrl}/`, { signal: AbortSignal.timeout(2000) })).ok
    } catch {
      return false
    }
  },
})
