import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { emptyWorkflowPages } from '@/lib/continue-run'
import type { Continuation, PageActivity, WorkflowPage, WorkflowPages } from '@/lib/types'

type PageChange<Page extends WorkflowPage> = (current: WorkflowPages[Page]) => Partial<WorkflowPages[Page]>

type WorkflowPagesValue = {
  pages: WorkflowPages
  activity: Record<WorkflowPage, PageActivity>
  change: <Page extends WorkflowPage>(page: Page, pageChange: PageChange<Page>) => void
  run: (page: WorkflowPage, work: () => Promise<void>) => void
  open: (continuation: Continuation) => void
  empty: () => WorkflowPages
}

const WorkflowPagesContext = createContext<WorkflowPagesValue | null>(null)

const newConversationId = (): string => crypto.randomUUID()

const idle: PageActivity = { busy: false, error: null }

const noActivity: Record<WorkflowPage, PageActivity> = { chat: idle, reply: idle, translate: idle, review: idle }

const withPage = <Page extends WorkflowPage>(pages: WorkflowPages, page: Page, state: WorkflowPages[Page]): WorkflowPages => ({ ...pages, [page]: state })

/**
 * Holds every workflow page's input, result and running work above the router, so leaving a
 * page while the model writes loses nothing: the answer lands in its page when it arrives.
 */
export const WorkflowPagesProvider = ({ children }: { children: ReactNode }) => {
  const [pages, setPages] = useState<WorkflowPages>(() => emptyWorkflowPages(newConversationId))
  const [activity, setActivity] = useState(noActivity)
  // Read inside run() so a second click while a page works is ignored, without re-creating run.
  const busyPages = useRef(new Set<WorkflowPage>())

  const change = useCallback(<Page extends WorkflowPage>(page: Page, pageChange: PageChange<Page>) => {
    setPages((current) => withPage(current, page, { ...current[page], ...pageChange(current[page]) }))
  }, [])

  const run = useCallback((page: WorkflowPage, work: () => Promise<void>) => {
    if (busyPages.current.has(page)) return
    busyPages.current.add(page)
    setActivity((current) => ({ ...current, [page]: { busy: true, error: null } }))
    work()
      .then(() => setActivity((current) => ({ ...current, [page]: idle })))
      .catch((caught: unknown) =>
        setActivity((current) => ({ ...current, [page]: { busy: false, error: caught instanceof Error ? caught.message : 'Something went wrong' } })),
      )
      .finally(() => busyPages.current.delete(page))
  }, [])

  const open = useCallback((continuation: Continuation) => {
    setPages((current) => withPage(current, continuation.page, continuation.state))
    setActivity((current) => ({ ...current, [continuation.page]: idle }))
  }, [])

  const empty = useCallback(() => emptyWorkflowPages(newConversationId), [])

  const value = useMemo<WorkflowPagesValue>(() => ({ pages, activity, change, run, open, empty }), [pages, activity, change, run, open, empty])
  return <WorkflowPagesContext.Provider value={value}>{children}</WorkflowPagesContext.Provider>
}

const useWorkflowPages = (): WorkflowPagesValue => {
  const value = useContext(WorkflowPagesContext)
  if (value === null) throw new Error('Workflow pages need a WorkflowPagesProvider')
  return value
}

/**
 * One workflow page's state, its running work and the way to change both.
 * @param page Which page.
 * @returns The state, whether work runs and its error, and the setters.
 */
export const useWorkflowPage = <Page extends WorkflowPage>(page: Page) => {
  const { pages, activity, change, run } = useWorkflowPages()
  return {
    state: pages[page],
    busy: activity[page].busy,
    error: activity[page].error,
    set: (values: Partial<WorkflowPages[Page]>) => change(page, () => values),
    change: (pageChange: PageChange<Page>) => change(page, pageChange),
    run: (work: () => Promise<void>) => run(page, work),
  }
}

/**
 * Whether each page has work running, for the navigation.
 * @returns The activity of every page.
 */
export const useWorkflowActivity = (): Record<WorkflowPage, PageActivity> => useWorkflowPages().activity

/**
 * Opens a page as a run left it, and the pages' empty state for what a run does not record.
 * @returns The opener and the empty pages.
 */
export const useContinuation = () => {
  const { open, empty } = useWorkflowPages()
  return { open, empty }
}
