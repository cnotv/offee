import { defineConfig } from '@playwright/test'

const modelUrl = `http://127.0.0.1:${process.env.OFFEE_DEV_MODEL_PORT ?? '18080'}`
const appUrl = `http://127.0.0.1:${process.env.OFFEE_DEV_PORT ?? '18470'}`

export default defineConfig({
  testDir: 'e2e',
  // A long form is read in many model calls on this machine's model.
  timeout: 60 * 60_000,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: appUrl, acceptDownloads: true, trace: 'retain-on-failure' },
  webServer: [
    // A hosted model when one is named; otherwise the local one, which the first run downloads,
    // several gigabytes.
    { command: process.env.OFFEE_DEV_HOSTED_URL === undefined ? 'bin/offee-dev model' : 'bin/offee-dev hosted', url: `${modelUrl}/health`, timeout: 60 * 60_000, reuseExistingServer: true },
    { command: 'bin/offee-dev app', url: `${appUrl}/api/status`, timeout: 5 * 60_000, reuseExistingServer: true },
  ],
})
