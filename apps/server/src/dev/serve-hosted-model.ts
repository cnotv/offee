import { serve } from '@hono/node-server'
import { z } from 'zod'
import { createHostedModelProxy } from './hosted-model.ts'

// Development only, started by `bin/offee-dev hosted`: the key comes from the host's environment
// and stays in this process, never in the app's.
const environment = z
  .object({
    OFFEE_DEV_HOSTED_URL: z.url(),
    OFFEE_DEV_HOSTED_KEY: z.string().min(1),
    OFFEE_DEV_HOSTED_MODEL: z.string().min(1),
    OFFEE_DEV_MODEL_PORT: z.coerce.number().int().positive().default(18080),
  })
  .parse(process.env)

serve({
  fetch: createHostedModelProxy({
    baseUrl: environment.OFFEE_DEV_HOSTED_URL.replace(/\/$/, ''),
    apiKey: environment.OFFEE_DEV_HOSTED_KEY,
    model: environment.OFFEE_DEV_HOSTED_MODEL,
  }),
  hostname: '127.0.0.1',
  port: environment.OFFEE_DEV_MODEL_PORT,
})
console.log(`${environment.OFFEE_DEV_HOSTED_MODEL} at ${environment.OFFEE_DEV_HOSTED_URL}, served on 127.0.0.1:${environment.OFFEE_DEV_MODEL_PORT}`)
