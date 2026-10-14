import type { ControlApi } from '../../src/types.ts'

declare global {
  interface Window {
    offeeControl: ControlApi
  }
}
