import { httpApi } from './http-api'
import type { OffeeApi } from './types'

// Vite replaces the variable at build time, so a production build drops the import and ships no demo code.
export const isDemoMode = import.meta.env.VITE_DEMO_MODE === '1'

export const api: OffeeApi = isDemoMode ? (await import('@/demo/demo-api')).createDemoApi() : httpApi
