import '@radix-ui/themes/styles.css'
import './styles.css'
import { Theme } from '@radix-ui/themes'
import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { AppShell } from '@/components/AppShell'
import { useColorScheme } from '@/hooks/useColorScheme'
import { DirectoryProvider } from '@/hooks/useDirectory'
import { WorkContextProvider } from '@/hooks/useWorkContext'
import { ChatView } from '@/views/ChatView'
import { FormsView } from '@/views/FormsView'
import { LibraryView } from '@/views/LibraryView'
import { PersonasView } from '@/views/PersonasView'
import { ProfilesView } from '@/views/ProfilesView'
import { ReplyView } from '@/views/ReplyView'
import { ReviewView } from '@/views/ReviewView'
import { RunsView } from '@/views/RunsView'
import { TranslateView } from '@/views/TranslateView'

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/chat" replace /> },
      { path: 'chat', element: <ChatView />, handle: { title: 'Chat' } },
      { path: 'reply', element: <ReplyView />, handle: { title: 'Draft a reply' } },
      { path: 'translate', element: <TranslateView />, handle: { title: 'Translate' } },
      { path: 'review', element: <ReviewView />, handle: { title: 'Review' } },
      { path: 'forms', element: <FormsView />, handle: { title: 'Fill and sign a form' } },
      { path: 'library', element: <LibraryView />, handle: { title: 'Library' } },
      { path: 'profiles', element: <ProfilesView />, handle: { title: 'Profiles' } },
      { path: 'personas', element: <PersonasView />, handle: { title: 'Personas' } },
      { path: 'runs', element: <RunsView />, handle: { title: 'Run log' } },
    ],
  },
])

const SystemTheme = ({ children }: { children: ReactNode }) => (
  <Theme appearance={useColorScheme()} accentColor="indigo" grayColor="slate" radius="large" panelBackground="translucent">
    {children}
  </Theme>
)

const rootElement = document.getElementById('root')
if (rootElement === null) throw new Error('The #root element is missing from index.html')

createRoot(rootElement).render(
  <StrictMode>
    <SystemTheme>
      <DirectoryProvider>
        <WorkContextProvider>
          <RouterProvider router={router} />
        </WorkContextProvider>
      </DirectoryProvider>
    </SystemTheme>
  </StrictMode>,
)
