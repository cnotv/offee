import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { Persona, Profile } from '@offee/contracts'
import { api } from '@/lib/api'
import { useLoad } from './useLoad'

type Directory = {
  profiles: Profile[]
  personas: Persona[]
  reload: () => void
}

const DirectoryContext = createContext<Directory | null>(null)

/** Loads the profiles and personas once for every page, reloading after an edit. */
export const DirectoryProvider = ({ children }: { children: ReactNode }) => {
  const profiles = useLoad(api.profiles)
  const personas = useLoad(api.personas)
  const reloadProfiles = profiles.reload
  const reloadPersonas = personas.reload
  const value = useMemo<Directory>(
    () => ({
      profiles: profiles.value ?? [],
      personas: personas.value ?? [],
      reload: () => {
        reloadProfiles()
        reloadPersonas()
      },
    }),
    [profiles.value, personas.value, reloadProfiles, reloadPersonas],
  )
  return <DirectoryContext.Provider value={value}>{children}</DirectoryContext.Provider>
}

/**
 * The profiles and personas.
 * @returns Both lists and a reload function.
 */
export const useDirectory = (): Directory => {
  const value = useContext(DirectoryContext)
  if (value === null) throw new Error('useDirectory needs a DirectoryProvider')
  return value
}
