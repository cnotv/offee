import { z } from 'zod'

// Imported first, before any schema exists: the page's policy forbids eval, so zod's check for
// it would only log a blocked violation, which the Mac app records as a page error.
z.config({ jitless: true })
