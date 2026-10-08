import {
  ActivityLogIcon,
  ChatBubbleIcon,
  FileTextIcon,
  GlobeIcon,
  IdCardIcon,
  LockClosedIcon,
  LockOpen1Icon,
  Pencil2Icon,
  PersonIcon,
  ReaderIcon,
  StackIcon,
} from '@radix-ui/react-icons'
import { Badge, Box, Flex, Heading, Text, Tooltip } from '@radix-ui/themes'
import { useEffect } from 'react'
import { NavLink, Outlet, useMatches } from 'react-router'
import type { AppStatus } from '@offee/contracts'
import { useLoad } from '@/hooks/useLoad'
import { api } from '@/lib/api'
import { describeSwitch } from '@/lib/presentation'

const navigationItems = [
  { title: 'Chat', path: '/chat', Icon: ChatBubbleIcon },
  { title: 'Reply', path: '/reply', Icon: Pencil2Icon },
  { title: 'Translate', path: '/translate', Icon: GlobeIcon },
  { title: 'Review', path: '/review', Icon: ReaderIcon },
  { title: 'Forms', path: '/forms', Icon: FileTextIcon },
  { title: 'Library', path: '/library', Icon: StackIcon },
  { title: 'Profiles', path: '/profiles', Icon: IdCardIcon },
  { title: 'Personas', path: '/personas', Icon: PersonIcon },
  { title: 'Run log', path: '/runs', Icon: ActivityLogIcon },
]

const readPageTitle = (handle: unknown): string | null =>
  typeof handle === 'object' && handle !== null && 'title' in handle && typeof handle.title === 'string' ? handle.title : null

type LoadedStatus = { status: AppStatus; loadedAt: number }

// The time is taken when the status arrives, so rendering stays pure.
const loadStatus = async (): Promise<LoadedStatus> => ({ status: await api.status(), loadedAt: Date.now() })

const StatusBadges = ({ loaded }: { loaded: LoadedStatus | null }) => {
  if (loaded === null) return null
  const { status } = loaded
  const switchState = describeSwitch(status.gateway, loaded.loadedAt)
  return (
    <Flex direction="column" gap="2" className="sidebar-status">
      <Tooltip content={switchState.hint}>
        <Badge color={switchState.color} variant="soft" size="2">
          {switchState.open ? <LockOpen1Icon /> : <LockClosedIcon />} {switchState.label}
        </Badge>
      </Tooltip>
      <Text size="1" color="gray">
        {status.chatModel === null ? 'Local model starting…' : `Model: ${status.chatModel}`}
      </Text>
      <Text size="1" color="gray">
        {status.transcriptionReady ? 'Transcription ready' : 'Transcription starting…'}
      </Text>
    </Flex>
  )
}

/** The page frame: navigation, the switch's state, and the current view. */
export const AppShell = () => {
  const pageTitle = useMatches()
    .map((match) => readPageTitle(match.handle))
    .filter((title): title is string => title !== null)
    .at(-1)
  const status = useLoad(loadStatus)
  const reloadStatus = status.reload

  useEffect(() => {
    const timer = setInterval(reloadStatus, 5000)
    return () => clearInterval(timer)
  }, [reloadStatus])

  return (
    <div className="app-shell">
      <nav className="app-sidebar" aria-label="Main">
        <Flex align="center" gap="2" className="app-sidebar-title">
          <img src="/favicon.svg" width={24} height={24} alt="" />
          <Text size="3" weight="bold">
            Offee
          </Text>
        </Flex>
        <Flex direction={{ initial: 'row', sm: 'column' }} wrap={{ initial: 'wrap', sm: 'nowrap' }} gap="1">
          {navigationItems.map(({ title, path, Icon }) => (
            <NavLink key={path} to={path} className="app-nav-link">
              <Icon />
              <Text size="2">{title}</Text>
            </NavLink>
          ))}
        </Flex>
        <StatusBadges loaded={status.value} />
      </nav>
      <Box className="app-content">
        <header className="app-header">
          <Heading size="5" weight="medium">
            {pageTitle}
          </Heading>
        </header>
        <main className="app-main">
          <Outlet />
        </main>
      </Box>
    </div>
  )
}
