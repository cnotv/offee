import '@radix-ui/themes/styles.css'
import './styles.css'
import { Theme } from '@radix-ui/themes'
import { StrictMode, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { ControlView } from './ControlView'

const darkSchemeQuery = '(prefers-color-scheme: dark)'

const subscribeToColorScheme = (onChange: () => void): (() => void) => {
  const mediaQueryList = window.matchMedia(darkSchemeQuery)
  mediaQueryList.addEventListener('change', onChange)
  return () => mediaQueryList.removeEventListener('change', onChange)
}

const readColorScheme = (): 'light' | 'dark' => (window.matchMedia(darkSchemeQuery).matches ? 'dark' : 'light')

const SystemTheme = () => (
  <Theme appearance={useSyncExternalStore(subscribeToColorScheme, readColorScheme)} accentColor="indigo" grayColor="slate" radius="large">
    <ControlView />
  </Theme>
)

const rootElement = document.getElementById('root')
if (rootElement === null) throw new Error('The #root element is missing')

createRoot(rootElement).render(
  <StrictMode>
    <SystemTheme />
  </StrictMode>,
)
