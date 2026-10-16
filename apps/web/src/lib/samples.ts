import type { SampleFile } from './types'

// Under the build's base path, so the samples load wherever the app is served (the demo lives at /demo/).
const samplesFolder = `${import.meta.env.BASE_URL}samples/`

// Made up documents shipped with the app, so every slow operation can be tried without a file of one's own.
export const sampleFiles = {
  form: {
    path: `${samplesFolder}tenant-self-disclosure.pdf`,
    name: 'tenant-self-disclosure.pdf',
    type: 'application/pdf',
    pageImagePath: `${samplesFolder}tenant-self-disclosure.png`,
  },
  scan: {
    path: `${samplesFolder}personal-data-sheet-scan.pdf`,
    name: 'personal-data-sheet-scan.pdf',
    type: 'application/pdf',
    pageImagePath: `${samplesFolder}personal-data-sheet-scan.png`,
  },
  document: { path: `${samplesFolder}office-handbook.txt`, name: 'office-handbook.txt', type: 'text/plain', pageImagePath: null },
} satisfies Record<string, SampleFile>

/**
 * Loads a bundled sample as if the person had picked it.
 * @param sample Which sample.
 * @param signal Stops the download when the operation is stopped.
 * @returns The file.
 */
export const loadSample = async (sample: SampleFile, signal: AbortSignal): Promise<File> => {
  const response = await fetch(sample.path, { signal })
  if (!response.ok) throw new Error(`The sample ${sample.name} could not be loaded (${response.status})`)
  return new File([await response.blob()], sample.name, { type: sample.type })
}
