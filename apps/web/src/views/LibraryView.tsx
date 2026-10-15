import { FileIcon, TrashIcon } from '@radix-ui/react-icons'
import { Button, Callout, Dialog, Flex, IconButton, ScrollArea, Select, Text } from '@radix-ui/themes'
import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import type { DocumentAssignment, DocumentDetail, DocumentSummary, Persona, Profile } from '@offee/contracts'
import { ErrorCallout } from '@/components/ErrorCallout'
import { FilePickerButton } from '@/components/FilePickerButton'
import { RunningOperations } from '@/components/Operations'
import { SortableTable } from '@/components/tables/SortableTable'
import type { sortableTableFeatures } from '@/components/tables/sortable-table-features'
import { useAction } from '@/hooks/useAction'
import { useDirectory } from '@/hooks/useDirectory'
import { useLoad } from '@/hooks/useLoad'
import { useOperations } from '@/hooks/useOperations'
import { api } from '@/lib/api'
import { formatTime } from '@/lib/presentation'
import { loadSample, sampleFiles } from '@/lib/samples'

const shared = '__shared'

const assignmentKey = (assignment: DocumentAssignment): string =>
  assignment.profileId !== null ? `profile:${assignment.profileId}` : assignment.personaId !== null ? `persona:${assignment.personaId}` : shared

const assignmentOf = (key: string): DocumentAssignment => {
  if (key.startsWith('profile:')) return { profileId: key.slice('profile:'.length), personaId: null }
  if (key.startsWith('persona:')) return { profileId: null, personaId: key.slice('persona:'.length) }
  return { profileId: null, personaId: null }
}

type AssignmentSelectProps = {
  value: DocumentAssignment
  profiles: Profile[]
  personas: Persona[]
  onChange: (assignment: DocumentAssignment) => void
}

const AssignmentSelect = ({ value, profiles, personas, onChange }: AssignmentSelectProps) => (
  <Select.Root value={assignmentKey(value)} onValueChange={(key) => onChange(assignmentOf(key))}>
    <Select.Trigger aria-label="Who may use it" variant="soft" />
    <Select.Content>
      <Select.Item value={shared}>Shared by all</Select.Item>
      {profiles.length > 0 && (
        <Select.Group>
          <Select.Label>Profile</Select.Label>
          {profiles.map((profile) => (
            <Select.Item key={profile.id} value={`profile:${profile.id}`}>
              {profile.label}
            </Select.Item>
          ))}
        </Select.Group>
      )}
      {personas.length > 0 && (
        <Select.Group>
          <Select.Label>Persona</Select.Label>
          {personas.map((persona) => (
            <Select.Item key={persona.id} value={`persona:${persona.id}`}>
              {persona.name}
            </Select.Item>
          ))}
        </Select.Group>
      )}
    </Select.Content>
  </Select.Root>
)

type DocumentPreviewProps = { document: DocumentSummary | null; onClose: () => void }

/** The text Offee keeps for a document: exactly what answers, replies and forms draw on. */
const DocumentPreview = ({ document, onClose }: DocumentPreviewProps) => {
  const [loaded, setLoaded] = useState<DocumentDetail | null>(null)
  const action = useAction()
  const shown = loaded !== null && loaded.id === document?.id ? loaded : null
  return (
    <Dialog.Root
      open={document !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Content
        maxWidth="760px"
        onOpenAutoFocus={() => {
          if (document !== null) action.run(async () => setLoaded(await api.document(document.id)))
        }}
      >
        <Dialog.Title>{document?.title}</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="3">
          The text Offee read from it, {document?.characterCount.toLocaleString()} characters. Answers draw on this, not on the layout.
        </Dialog.Description>
        <ErrorCallout error={action.error} />
        <ScrollArea type="auto" scrollbars="vertical" style={{ maxHeight: '60vh' }}>
          <Text as="p" size="2" className="document-preview">
            {shown === null ? 'Loading…' : shown.text}
          </Text>
        </ScrollArea>
        <Flex justify="end" mt="4">
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Close
            </Button>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  )
}

/** The documents Offee answers from, and who may use each. */
export const LibraryView = () => {
  const { profiles, personas } = useDirectory()
  const documents = useLoad(api.documents)
  const [uploadAssignment, setUploadAssignment] = useState<DocumentAssignment>({ profileId: null, personaId: null })
  const [previewed, setPreviewed] = useState<DocumentSummary | null>(null)
  const action = useAction()
  const { start } = useOperations()
  const reload = documents.reload

  // Runs as an operation, so adding a long scan goes on while the person works elsewhere.
  const add = (fileName: string, choose: (signal: AbortSignal) => Promise<File>) =>
    action.run(() =>
      start('document', `Adding ${fileName} to the Library`, async (signal) => {
        await api.uploadDocument(await choose(signal), uploadAssignment, signal)
        reload()
      }),
    )

  const columns = useMemo<ColumnDef<typeof sortableTableFeatures, DocumentSummary, unknown>[]>(
    () => [
      {
        id: 'title',
        accessorFn: (row) => row.title,
        header: 'Document',
        sortFn: 'alphanumeric',
        cell: (context) => (
          <Button variant="ghost" onClick={() => setPreviewed(context.row.original)} aria-label={`Preview ${context.row.original.title}`}>
            {context.row.original.title}
          </Button>
        ),
      },
      {
        id: 'size',
        accessorFn: (row) => row.characterCount,
        header: 'Characters',
        sortFn: 'basic',
        cell: (context) => context.row.original.characterCount.toLocaleString(),
      },
      {
        id: 'assignment',
        header: 'Used by',
        enableSorting: false,
        cell: (context) => (
          <AssignmentSelect
            value={context.row.original}
            profiles={profiles}
            personas={personas}
            onChange={(assignment) => action.run(async () => {
              await api.assignDocument(context.row.original.id, assignment)
              reload()
            })}
          />
        ),
      },
      { id: 'added', accessorFn: (row) => row.createdAt, header: 'Added', sortFn: 'basic', cell: (context) => formatTime(context.row.original.createdAt) },
      {
        id: 'remove',
        header: '',
        enableSorting: false,
        cell: (context) => (
          <IconButton
            variant="ghost"
            color="red"
            aria-label={`Remove ${context.row.original.title}`}
            onClick={() => action.run(async () => {
              await api.deleteDocument(context.row.original.id)
              reload()
            })}
          >
            <TrashIcon />
          </IconButton>
        ),
      },
    ],
    [profiles, personas, action, reload],
  )

  return (
    <Flex direction="column" gap="4" className="page-wide">
      <Flex gap="3" align="center" wrap="wrap">
        <FilePickerButton
          accept=".pdf,.docx,.txt,.md,.eml,.csv,.json,.png,.jpg,.jpeg,.tif,.tiff"
          disabled={action.busy}
          onPick={(file) => add(file.name, async () => file)}
        >
          Add a document
        </FilePickerButton>
        <Text size="2" color="gray">
          for
        </Text>
        <AssignmentSelect value={uploadAssignment} profiles={profiles} personas={personas} onChange={setUploadAssignment} />
        <Button variant="ghost" disabled={action.busy} onClick={() => add(sampleFiles.document.name, (signal) => loadSample(sampleFiles.document, signal))}>
          <FileIcon /> Try the sample document
        </Button>
      </Flex>
      <RunningOperations kinds={['document']} />
      <ErrorCallout error={action.error ?? documents.error} />
      {documents.value !== null && documents.value.length === 0 ? (
        <Callout.Root variant="surface">
          <Callout.Text>
            No documents yet. Add PDFs, Word files, emails or notes: answers, replies and forms draw on them. A document shared by all is
            used everywhere; one assigned to a profile or persona only when that one is chosen.
          </Callout.Text>
        </Callout.Root>
      ) : (
        <SortableTable columns={columns} rows={documents.value ?? []} rowKeyOf={(row) => row.id} numericColumnIds={['size']} />
      )}
      <DocumentPreview document={previewed} onClose={() => setPreviewed(null)} />
    </Flex>
  )
}
