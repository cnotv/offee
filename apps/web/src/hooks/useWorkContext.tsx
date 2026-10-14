import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { WorkflowContext } from '@offee/contracts'

type WorkContextValue = WorkflowContext & {
  setProfileId: (id: string | null) => void
  setPersonaId: (id: string | null) => void
}

const WorkContext = createContext<WorkContextValue | null>(null)

const storageKey = 'offee.workContext'

const readStored = (): WorkflowContext => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
    if (typeof parsed === 'object' && parsed !== null && 'profileId' in parsed && 'personaId' in parsed) {
      const profileId = typeof parsed.profileId === 'string' ? parsed.profileId : null
      const personaId = typeof parsed.personaId === 'string' ? parsed.personaId : null
      return { profileId, personaId }
    }
  } catch {
    // Storage can be unavailable; starting with nothing chosen is fine.
  }
  return { profileId: null, personaId: null }
}

const store = (context: WorkflowContext): void => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(context))
  } catch {
    // Remembering the choice is a convenience only.
  }
}

/** Holds the profile and persona every workflow page works with, remembered across visits. */
export const WorkContextProvider = ({ children }: { children: ReactNode }) => {
  const [context, setContext] = useState<WorkflowContext>(readStored)
  const value = useMemo<WorkContextValue>(
    () => ({
      ...context,
      setProfileId: (profileId) => {
        const next = { ...context, profileId }
        store(next)
        setContext(next)
      },
      setPersonaId: (personaId) => {
        const next = { ...context, personaId }
        store(next)
        setContext(next)
      },
    }),
    [context],
  )
  return <WorkContext.Provider value={value}>{children}</WorkContext.Provider>
}

/**
 * The profile and persona chosen for the current work.
 * @returns The ids and their setters.
 */
export const useWorkContext = (): WorkContextValue => {
  const value = useContext(WorkContext)
  if (value === null) throw new Error('useWorkContext needs a WorkContextProvider')
  return value
}
