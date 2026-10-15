import { MagnifyingGlassIcon, TrashIcon } from '@radix-ui/react-icons'
import { AlertDialog, Badge, Button, Callout, Card, Checkbox, Code, Flex, IconButton, Select, Text, TextField } from '@radix-ui/themes'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import type { StoredItem, StoredItemKey, StoredItemKind } from '@offee/contracts'
import { ErrorCallout } from '@/components/ErrorCallout'
import { SortableTable } from '@/components/tables/SortableTable'
import type { sortableTableFeatures } from '@/components/tables/sortable-table-features'
import { useAction } from '@/hooks/useAction'
import { useDirectory } from '@/hooks/useDirectory'
import { useLoad } from '@/hooks/useLoad'
import { api } from '@/lib/api'
import { formatBytes, formatTime } from '@/lib/presentation'

const kinds: StoredItemKind[] = ['profile', 'persona', 'document', 'file', 'run']

const kindNames: Record<StoredItemKind, string> = { profile: 'Profile', persona: 'Persona', document: 'Document', file: 'File', run: 'Run' }

const allKinds = 'all'

const keyOf = (item: StoredItemKey): string => `${item.kind}:${item.id}`

const keysOf = (items: StoredItem[]): StoredItemKey[] => items.map(({ kind, id }) => ({ kind, id }))

const totalBytes = (items: StoredItem[]): number => items.reduce((sum, item) => sum + item.bytes, 0)

// The browser keeps this window's chosen profile and persona and its operation timings.
const forgetBrowserData = (): void => {
  try {
    localStorage.clear()
  } catch {
    // Storage can be unavailable, in which case nothing was kept.
  }
}

type ConfirmDeletionProps = { trigger: ReactNode; title: string; description: string; onConfirm: () => void }

/** Asks before a deletion that removes more than the one row the person pointed at. */
const ConfirmDeletion = ({ trigger, title, description, onConfirm }: ConfirmDeletionProps) => (
  <AlertDialog.Root>
    <AlertDialog.Trigger>{trigger}</AlertDialog.Trigger>
    <AlertDialog.Content maxWidth="440px">
      <AlertDialog.Title>{title}</AlertDialog.Title>
      <AlertDialog.Description size="2">{description}</AlertDialog.Description>
      <Flex gap="2" justify="end" mt="4">
        <AlertDialog.Cancel>
          <Button variant="soft" color="gray">
            Cancel
          </Button>
        </AlertDialog.Cancel>
        <AlertDialog.Action>
          <Button color="red" onClick={onConfirm}>
            Delete
          </Button>
        </AlertDialog.Action>
      </Flex>
    </AlertDialog.Content>
  </AlertDialog.Root>
)

/** Everything Offee keeps, to delete one item, a selection, a whole kind or all of it. */
export const DataView = () => {
  const items = useLoad(api.storedData)
  const directory = useDirectory()
  const action = useAction()
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [nameFilter, setNameFilter] = useState('')
  const [kindFilter, setKindFilter] = useState<StoredItemKind | typeof allKinds>(allKinds)
  const reload = items.reload
  const reloadDirectory = directory.reload

  const stored = useMemo(() => items.value ?? [], [items.value])
  const shown = useMemo(
    () =>
      stored.filter(
        (item) => (kindFilter === allKinds || item.kind === kindFilter) && item.title.toLocaleLowerCase().includes(nameFilter.trim().toLocaleLowerCase()),
      ),
    [stored, kindFilter, nameFilter],
  )
  const selectedItems = stored.filter((item) => selected.has(keyOf(item)))

  const deleteItems = useCallback(
    (keys: StoredItemKey[]) =>
      action.run(async () => {
        await api.deleteStoredItems(keys)
        setSelected(new Set())
        reload()
        reloadDirectory()
      }),
    [action, reload, reloadDirectory],
  )

  const deleteEverything = () =>
    action.run(async () => {
      await api.deleteAllStoredData()
      forgetBrowserData()
      // Open pages still hold answers and choices in memory; a fresh start drops them too.
      window.location.reload()
    })

  const columns = useMemo<ColumnDef<typeof sortableTableFeatures, StoredItem, unknown>[]>(() => {
    const shownSelectedCount = shown.filter((item) => selected.has(keyOf(item))).length
    const toggle = (item: StoredItem) =>
      setSelected((current) => (current.has(keyOf(item)) ? new Set([...current].filter((key) => key !== keyOf(item))) : new Set([...current, keyOf(item)])))
    const toggleShown = () =>
      setSelected((current) => {
        const shownKeys = new Set(shown.map(keyOf))
        return shownSelectedCount === shown.length ? new Set([...current].filter((key) => !shownKeys.has(key))) : new Set([...current, ...shownKeys])
      })
    return [
      {
        id: 'select',
        enableSorting: false,
        header: () => (
          <Checkbox
            aria-label="Select every item shown"
            disabled={shown.length === 0}
            checked={shownSelectedCount === 0 ? false : shownSelectedCount === shown.length ? true : 'indeterminate'}
            onCheckedChange={toggleShown}
          />
        ),
        cell: (context) => (
          <Checkbox aria-label={`Select ${context.row.original.title}`} checked={selected.has(keyOf(context.row.original))} onCheckedChange={() => toggle(context.row.original)} />
        ),
      },
      { id: 'kind', accessorFn: (row) => kindNames[row.kind], header: 'Kind', sortFn: 'alphanumeric', cell: (context) => <Badge variant="soft">{kindNames[context.row.original.kind]}</Badge> },
      { id: 'title', accessorFn: (row) => row.title, header: 'Name', sortFn: 'alphanumeric', cell: (context) => context.row.original.title || 'Untitled' },
      { id: 'size', accessorFn: (row) => row.bytes, header: 'Size', sortFn: 'basic', cell: (context) => formatBytes(context.row.original.bytes) },
      { id: 'added', accessorFn: (row) => row.createdAt, header: 'Added', sortFn: 'basic', cell: (context) => formatTime(context.row.original.createdAt) },
      {
        id: 'remove',
        header: '',
        enableSorting: false,
        cell: (context) => (
          <IconButton variant="ghost" color="gray" size="1" aria-label={`Delete ${context.row.original.title}`} onClick={() => deleteItems(keysOf([context.row.original]))}>
            <TrashIcon />
          </IconButton>
        ),
      },
    ]
  }, [shown, selected, deleteItems])

  return (
    <Flex direction="column" gap="4" className="page-wide">
      <Text size="2" color="gray">
        Everything Offee keeps in its database. Deleting removes it for good. Before uninstalling, delete everything, then run{' '}
        <Code>offee destroy</Code> on the host to remove the VM and the downloaded models.
      </Text>
      <Flex gap="2" wrap="wrap">
        {kinds.map((kind) => {
          const ofKind = stored.filter((item) => item.kind === kind)
          return (
            <Card key={kind} size="1">
              <Flex align="center" gap="3">
                <Flex direction="column">
                  <Text size="2" weight="medium">
                    {kindNames[kind]}s
                  </Text>
                  <Text size="1" color="gray">
                    {ofKind.length}, {formatBytes(totalBytes(ofKind))}
                  </Text>
                </Flex>
                <ConfirmDeletion
                  title={`Delete every ${kindNames[kind].toLocaleLowerCase()}?`}
                  description={`All ${ofKind.length} are removed and cannot be brought back.`}
                  onConfirm={() => deleteItems(keysOf(ofKind))}
                  trigger={
                    <IconButton variant="ghost" color="gray" size="1" disabled={action.busy || ofKind.length === 0} aria-label={`Delete every ${kindNames[kind].toLocaleLowerCase()}`}>
                      <TrashIcon />
                    </IconButton>
                  }
                />
              </Flex>
            </Card>
          )
        })}
      </Flex>
      <Flex gap="3" align="center" wrap="wrap">
        <TextField.Root placeholder="Filter by name" aria-label="Filter by name" value={nameFilter} onChange={(event) => setNameFilter(event.target.value)}>
          <TextField.Slot>
            <MagnifyingGlassIcon />
          </TextField.Slot>
        </TextField.Root>
        <Select.Root value={kindFilter} onValueChange={(value) => setKindFilter(kinds.find((kind) => kind === value) ?? allKinds)}>
          <Select.Trigger aria-label="Filter by kind" variant="soft" />
          <Select.Content>
            <Select.Item value={allKinds}>All kinds</Select.Item>
            {kinds.map((kind) => (
              <Select.Item key={kind} value={kind}>
                {kindNames[kind]}s
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
        <Flex gap="4" align="center" ml="auto">
          <ConfirmDeletion
            title={`Delete ${selectedItems.length} selected?`}
            description={`${formatBytes(totalBytes(selectedItems))} in all, removed for good, including selected items the filter hides.`}
            onConfirm={() => deleteItems(keysOf(selectedItems))}
            trigger={
              <Button variant="ghost" color="gray" disabled={action.busy || selectedItems.length === 0}>
                <TrashIcon /> Delete selected ({selectedItems.length})
              </Button>
            }
          />
          <ConfirmDeletion
            title="Delete everything Offee keeps?"
            description="Every profile, persona, document, file and run is removed and cannot be brought back. This window also forgets its chosen profile and persona."
            onConfirm={deleteEverything}
            trigger={
              <Button variant="ghost" color="gray" disabled={action.busy || stored.length === 0}>
                <TrashIcon /> Delete everything
              </Button>
            }
          />
        </Flex>
      </Flex>
      <ErrorCallout error={action.error ?? items.error} />
      {items.value !== null && stored.length === 0 ? (
        <Callout.Root variant="surface">
          <Callout.Text>Offee keeps nothing yet.</Callout.Text>
        </Callout.Root>
      ) : (
        <>
          <SortableTable columns={columns} rows={shown} rowKeyOf={keyOf} numericColumnIds={['size']} />
          {shown.length === 0 && (
            <Text size="2" color="gray">
              Nothing matches the filter.
            </Text>
          )}
        </>
      )}
    </Flex>
  )
}
