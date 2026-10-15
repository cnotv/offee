import { TrashIcon } from '@radix-ui/react-icons'
import { AlertDialog, Badge, Button, Callout, Code, Flex, IconButton, Text } from '@radix-ui/themes'
import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import type { StoredItem, StoredItemKind } from '@offee/contracts'
import { ErrorCallout } from '@/components/ErrorCallout'
import { SortableTable } from '@/components/tables/SortableTable'
import type { sortableTableFeatures } from '@/components/tables/sortable-table-features'
import { useAction } from '@/hooks/useAction'
import { useDirectory } from '@/hooks/useDirectory'
import { useLoad } from '@/hooks/useLoad'
import { api } from '@/lib/api'
import { formatBytes, formatTime } from '@/lib/presentation'

const kindNames: Record<StoredItemKind, string> = { profile: 'Profile', persona: 'Persona', document: 'Document', file: 'File', run: 'Run' }

const kinds: StoredItemKind[] = ['profile', 'persona', 'document', 'file', 'run']

const totalsByKind = (items: StoredItem[]): { kind: StoredItemKind; count: number; bytes: number }[] =>
  kinds.map((kind) => {
    const ofKind = items.filter((item) => item.kind === kind)
    return { kind, count: ofKind.length, bytes: ofKind.reduce((sum, item) => sum + item.bytes, 0) }
  })

// The browser keeps this window's chosen profile and persona and its operation timings.
const forgetBrowserData = (): void => {
  try {
    localStorage.clear()
  } catch {
    // Storage can be unavailable, in which case nothing was kept.
  }
}

/** Everything Offee keeps, to delete one item at a time or all at once. */
export const DataView = () => {
  const items = useLoad(api.storedData)
  const directory = useDirectory()
  const action = useAction()
  const reload = items.reload
  const reloadDirectory = directory.reload

  const columns = useMemo<ColumnDef<typeof sortableTableFeatures, StoredItem, unknown>[]>(
    () => [
      { id: 'kind', accessorFn: (row) => kindNames[row.kind], header: 'Kind', sortFn: 'alphanumeric', cell: (context) => <Badge variant="soft">{kindNames[context.row.original.kind]}</Badge> },
      { id: 'title', accessorFn: (row) => row.title, header: 'Name', sortFn: 'alphanumeric', cell: (context) => context.row.original.title || 'Untitled' },
      { id: 'size', accessorFn: (row) => row.bytes, header: 'Size', sortFn: 'basic', cell: (context) => formatBytes(context.row.original.bytes) },
      { id: 'added', accessorFn: (row) => row.createdAt, header: 'Added', sortFn: 'basic', cell: (context) => formatTime(context.row.original.createdAt) },
      {
        id: 'remove',
        header: '',
        enableSorting: false,
        cell: (context) => (
          <IconButton
            variant="ghost"
            color="red"
            aria-label={`Delete ${context.row.original.title}`}
            onClick={() => action.run(async () => {
              await api.deleteStoredItem(context.row.original.kind, context.row.original.id)
              reload()
              reloadDirectory()
            })}
          >
            <TrashIcon />
          </IconButton>
        ),
      },
    ],
    [action, reload, reloadDirectory],
  )

  const deleteEverything = () =>
    action.run(async () => {
      await api.deleteAllStoredData()
      forgetBrowserData()
      // Open pages still hold answers and choices in memory; a fresh start drops them too.
      window.location.reload()
    })

  const stored = items.value ?? []

  return (
    <Flex direction="column" gap="4" className="page-wide">
      <Text size="2" color="gray">
        Everything Offee keeps in its database. Deleting an item here removes it for good. Before uninstalling, delete everything, then
        run <Code>offee destroy</Code> on the host to remove the VM and the downloaded models.
      </Text>
      <Flex gap="2" align="center" wrap="wrap">
        {totalsByKind(stored).map(({ kind, count, bytes }) => (
          <Badge key={kind} color="gray" variant="surface" size="2">
            {kindNames[kind]}s: {count}, {formatBytes(bytes)}
          </Badge>
        ))}
        <AlertDialog.Root>
          <AlertDialog.Trigger>
            <Button color="red" variant="soft" disabled={action.busy || stored.length === 0} ml="auto">
              <TrashIcon /> Delete everything
            </Button>
          </AlertDialog.Trigger>
          <AlertDialog.Content maxWidth="440px">
            <AlertDialog.Title>Delete everything Offee keeps?</AlertDialog.Title>
            <AlertDialog.Description size="2">
              Every profile, persona, document, file and run is removed and cannot be brought back. This window also forgets its chosen
              profile and persona.
            </AlertDialog.Description>
            <Flex gap="2" justify="end" mt="4">
              <AlertDialog.Cancel>
                <Button variant="soft" color="gray">
                  Cancel
                </Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action>
                <Button color="red" onClick={deleteEverything}>
                  Delete everything
                </Button>
              </AlertDialog.Action>
            </Flex>
          </AlertDialog.Content>
        </AlertDialog.Root>
      </Flex>
      <ErrorCallout error={action.error ?? items.error} />
      {items.value !== null && stored.length === 0 ? (
        <Callout.Root variant="surface">
          <Callout.Text>Offee keeps nothing yet.</Callout.Text>
        </Callout.Root>
      ) : (
        <SortableTable columns={columns} rows={stored} rowKeyOf={(row) => `${row.kind}:${row.id}`} numericColumnIds={['size']} />
      )}
    </Flex>
  )
}
