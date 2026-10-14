import { ResumeIcon } from '@radix-ui/react-icons'
import { Badge, Button, Callout, Dialog, Flex, Text } from '@radix-ui/themes'
import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import type { ColumnDef } from '@tanstack/react-table'
import type { RunDetail, RunSummary } from '@offee/contracts'
import { ErrorCallout } from '@/components/ErrorCallout'
import { SortableTable } from '@/components/tables/SortableTable'
import type { sortableTableFeatures } from '@/components/tables/sortable-table-features'
import { ModelBadge } from '@/components/WorkflowResultCard'
import { useAction } from '@/hooks/useAction'
import { useLoad } from '@/hooks/useLoad'
import { useContinuation } from '@/hooks/useWorkflowPages'
import { api } from '@/lib/api'
import { canContinue, continuationOf } from '@/lib/continue-run'
import { formatTime, workflowName } from '@/lib/presentation'

type RunDialogProps = { run: RunDetail; onClose: () => void; onContinue: () => void }

const RunDialog = ({ run, onClose, onContinue }: RunDialogProps) => (
  <Dialog.Root open onOpenChange={(open) => (open ? undefined : onClose())}>
    <Dialog.Content maxWidth="820px">
      <Dialog.Title>{run.title}</Dialog.Title>
      <Flex direction="column" gap="3">
        <Flex gap="2" wrap="wrap" align="center">
          <Badge variant="soft">{workflowName(run.workflow)}</Badge>
          {run.model !== null && <ModelBadge model={run.model} />}
          <Text size="1" color="gray">
            {formatTime(run.createdAt)}
          </Text>
        </Flex>
        <Flex direction="column" gap="1">
          <Text size="2" weight="medium">
            What left the machine
          </Text>
          {run.outbound.length === 0 ? (
            <Text size="2" color="gray">
              Nothing. This run stayed on the machine.
            </Text>
          ) : (
            run.outbound.map((record) => (
              <Text key={`${record.sentAt}-${record.detail}`} size="2">
                {formatTime(record.sentAt)}: {record.outcome === 'sent' ? 'sent to' : 'refused for'} {record.destination}. {record.detail}
              </Text>
            ))
          )}
        </Flex>
        <Flex direction="column" gap="1">
          <Text size="2" weight="medium">
            Input
          </Text>
          <Text as="div" size="1" className="run-text">
            {run.input}
          </Text>
        </Flex>
        <Flex direction="column" gap="1">
          <Text size="2" weight="medium">
            Output
          </Text>
          <Text as="div" size="1" className="run-text">
            {run.output}
          </Text>
        </Flex>
        <Flex justify="end" gap="2">
          <Button variant="soft" color="gray" onClick={onClose}>
            Close
          </Button>
          {canContinue(run.workflow) && (
            <Button onClick={onContinue}>
              <ResumeIcon /> Continue
            </Button>
          )}
        </Flex>
      </Flex>
    </Dialog.Content>
  </Dialog.Root>
)

/** Every run: what went in, which model answered, and whether anything left the machine. */
export const RunsView = () => {
  const runs = useLoad(api.runs)
  const [open, setOpen] = useState<RunDetail | null>(null)
  const action = useAction()
  const runAction = action.run
  const { open: openPage, empty } = useContinuation()
  const navigate = useNavigate()

  // A chat brings back its whole conversation; any other run, itself.
  const continueRun = useCallback(
    (id: string) =>
      runAction(async () => {
        const next = continuationOf(await api.runConversation(id), empty())
        if (next === null) return
        openPage(next)
        await navigate(`/${next.page}`)
      }),
    [runAction, empty, openPage, navigate],
  )

  const columns = useMemo<ColumnDef<typeof sortableTableFeatures, RunSummary, unknown>[]>(
    () => [
      { id: 'when', accessorFn: (row) => row.createdAt, header: 'When', sortFn: 'basic', cell: (context) => formatTime(context.row.original.createdAt) },
      { id: 'workflow', accessorFn: (row) => workflowName(row.workflow), header: 'Workflow', sortFn: 'alphanumeric' },
      {
        id: 'title',
        accessorFn: (row) => row.title,
        header: 'Title',
        sortFn: 'alphanumeric',
        cell: (context) => (
          <Button variant="ghost" size="1" onClick={() => action.run(async () => setOpen(await api.run(context.row.original.id)))}>
            {context.row.original.title}
          </Button>
        ),
      },
      {
        id: 'model',
        header: 'Model',
        enableSorting: false,
        cell: (context) => (context.row.original.model === null ? '—' : <ModelBadge model={context.row.original.model} />),
      },
      {
        id: 'continue',
        header: '',
        enableSorting: false,
        cell: (context) =>
          canContinue(context.row.original.workflow) ? (
            <Button variant="soft" size="1" onClick={() => continueRun(context.row.original.id)}>
              <ResumeIcon /> Continue
            </Button>
          ) : null,
      },
      {
        id: 'left',
        accessorFn: (row) => (row.leftMachine ? 1 : 0),
        header: 'Left the machine',
        sortFn: 'basic',
        cell: (context) =>
          context.row.original.leftMachine ? (
            <Badge color="amber" variant="soft">
              Yes
            </Badge>
          ) : (
            <Badge color="grass" variant="soft">
              No
            </Badge>
          ),
      },
    ],
    [action, continueRun],
  )

  return (
    <Flex direction="column" gap="4" className="page-wide">
      <ErrorCallout error={action.error ?? runs.error} />
      {runs.value !== null && runs.value.length === 0 ? (
        <Callout.Root variant="surface">
          <Callout.Text>No runs yet. Every chat, reply, translation, review, transcript and form is recorded here.</Callout.Text>
        </Callout.Root>
      ) : (
        <SortableTable columns={columns} rows={runs.value ?? []} rowKeyOf={(row) => row.id} numericColumnIds={[]} />
      )}
      {open !== null && <RunDialog run={open} onClose={() => setOpen(null)} onContinue={() => continueRun(open.id)} />}
    </Flex>
  )
}
