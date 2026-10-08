import { useSyncExternalStore } from 'react'

const darkSchemeQuery = '(prefers-color-scheme: dark)'

const subscribeToColorScheme = (onChange: () => void): (() => void) => {
  const mediaQueryList = window.matchMedia(darkSchemeQuery)
  mediaQueryList.addEventListener('change', onChange)
  return () => mediaQueryList.removeEventListener('change', onChange)
}

const readColorScheme = (): 'light' | 'dark' => (window.matchMedia(darkSchemeQuery).matches ? 'dark' : 'light')

/**
 * Follows the system's light or dark preference as it changes.
 * @returns The current scheme.
 */
export const useColorScheme = (): 'light' | 'dark' => useSyncExternalStore(subscribeToColorScheme, readColorScheme)
