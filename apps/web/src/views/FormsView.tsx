import { ClockIcon, DownloadIcon, FileIcon, Pencil1Icon } from '@radix-ui/react-icons'
import { Badge, Button, Callout, Card, Checkbox, Flex, Heading, Select, Table, Text, TextField } from '@radix-ui/themes'
import type { FormInspection } from '@offee/contracts'
import { ContextPicker } from '@/components/ContextPicker'
import { ErrorCallout } from '@/components/ErrorCallout'
import { FilePickerButton } from '@/components/FilePickerButton'
import { RunningOperations } from '@/components/Operations'
import { ModelBadge } from '@/components/WorkflowResultCard'
import { useDirectory } from '@/hooks/useDirectory'
import { useOperations } from '@/hooks/useOperations'
import { useWorkContext } from '@/hooks/useWorkContext'
import { useWorkflowPage } from '@/hooks/useWorkflowPages'
import { api } from '@/lib/api'
import { describeEstimate, estimateOf } from '@/lib/estimates'
import { loadSample, sampleFiles } from '@/lib/samples'

const sourceColor = { profile: 'grass', model: 'amber', none: 'gray' } as const
const sourceLabel = { profile: 'Profile', model: 'Model', none: 'Empty' } as const
const noChoice = '__none'

type FieldEditorProps = {
  field: FormInspection['fields'][number]
  value: string
  onChange: (value: string) => void
}

const FieldEditor = ({ field, value, onChange }: FieldEditorProps) => {
  if (field.kind === 'signature') {
    return (
      <Text size="1" color="gray">
        Signed with the profile when you choose to sign
      </Text>
    )
  }
  if (field.kind === 'checkbox') {
    return <Checkbox checked={value !== '' && value !== 'no'} onCheckedChange={(checked) => onChange(checked === true ? 'yes' : '')} />
  }
  if (field.options.length > 0) {
    return (
      <Select.Root value={field.options.includes(value) ? value : noChoice} onValueChange={(next) => onChange(next === noChoice ? '' : next)}>
        <Select.Trigger aria-label={field.name} />
        <Select.Content>
          <Select.Item value={noChoice}>Not chosen</Select.Item>
          {field.options.map((option) => (
            <Select.Item key={option} value={option}>
              {option}
            </Select.Item>
          ))}
        </Select.Content>
      </Select.Root>
    )
  }
  return <TextField.Root aria-label={field.name} value={value} onChange={(event) => onChange(event.target.value)} />
}

/**
 * Fill a PDF form from a profile, check every value, then save it filled or signed. The form and
 * its values live above the router, so the model can read it while the person works elsewhere.
 */
export const FormsView = () => {
  const { profileId, personaId } = useWorkContext()
  const { profiles } = useDirectory()
  const { history } = useOperations()
  const page = useWorkflowPage('forms')
  const { inspection, values, result } = page.state
  const profile = profiles.find((candidate) => candidate.id === profileId)

  const setValue = (name: string, value: string) =>
    page.change((current) => ({ values: current.values.map((entry) => (entry.name === name ? { ...entry, value } : entry)) }))

  const open = (fileName: string, choose: (signal: AbortSignal) => Promise<File>) => {
    if (profileId === null) return
    page.run({ kind: 'form', label: `Reading ${fileName}` }, async (signal) => {
      const inspected = await api.inspectForm(await choose(signal), { profileId, personaId }, signal)
      page.set({ inspection: inspected, values: inspected.suggestions, result: null })
    })
  }

  const fill = (sign: boolean) => {
    if (inspection === null || profileId === null) return
    page.run({ kind: 'form-save', label: `${sign ? 'Signing' : 'Filling'} ${inspection.fileName}` }, async () =>
      page.set({ result: await api.fillForm({ formFileId: inspection.formFileId, profileId, values, sign }) }),
    )
  }

  return (
    <Flex direction="column" gap="4" className="page-wide">
      <ContextPicker />
      {profile === undefined && (
        <Callout.Root variant="surface">
          <Callout.Text>Choose a profile above: its details fill the form and its certificate signs it.</Callout.Text>
        </Callout.Root>
      )}
      <Callout.Root variant="surface" color="gray">
        <Callout.Icon>
          <ClockIcon />
        </Callout.Icon>
        <Callout.Text>
          The AI that reads the form and suggests values runs on this machine, not in the cloud, so it takes a while: reading a form
          takes {describeEstimate(estimateOf(history, 'form'))}, then saving it filled or signed takes{' '}
          {describeEstimate(estimateOf(history, 'form-save'))}. You can use the rest of Offee meanwhile; the indicator at the top shows
          what runs and stops it.
        </Callout.Text>
      </Callout.Root>
      <Flex gap="2" align="center" wrap="wrap">
        <FilePickerButton accept=".pdf,application/pdf" disabled={page.busy || profileId === null} onPick={(file) => open(file.name, async () => file)}>
          Open a PDF form
        </FilePickerButton>
        <Button
          variant="ghost"
          disabled={page.busy || profileId === null}
          onClick={() => open(sampleFiles.form.name, (signal) => loadSample(sampleFiles.form, signal))}
        >
          <FileIcon /> Try the sample form
        </Button>
      </Flex>
      <RunningOperations kinds={['form', 'form-save']} />
      <ErrorCallout error={page.error} />
      {inspection !== null && inspection.fields.length === 0 && (
        <Callout.Root color="amber" variant="surface">
          <Callout.Text>
            {inspection.fileName} has no fillable fields. Forms without fields are not supported in this build yet.
          </Callout.Text>
        </Callout.Root>
      )}
      {inspection !== null && inspection.fields.length > 0 && (
        <Card size="3">
          <Flex direction="column" gap="3">
            <Flex justify="between" align="center" gap="2" wrap="wrap">
              <Heading size="3">{inspection.fileName}</Heading>
              {inspection.model !== null && <ModelBadge model={inspection.model} />}
            </Flex>
            <Text size="2" color="gray">
              Check every value. Nothing is written until you save.
            </Text>
            <Table.Root variant="ghost" size="1">
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell>Field</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Value</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>From</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {inspection.fields.map((field) => {
                  const entry = values.find((candidate) => candidate.name === field.name)
                  return (
                    <Table.Row key={field.name} align="center">
                      <Table.RowHeaderCell>
                        <Text size="2">{field.name}</Text>
                      </Table.RowHeaderCell>
                      <Table.Cell className="form-value-cell">
                        <FieldEditor field={field} value={entry?.value ?? ''} onChange={(value) => setValue(field.name, value)} />
                      </Table.Cell>
                      <Table.Cell>
                        <Badge color={sourceColor[entry?.source ?? 'none']} variant="soft">
                          {sourceLabel[entry?.source ?? 'none']}
                        </Badge>
                      </Table.Cell>
                    </Table.Row>
                  )
                })}
              </Table.Body>
            </Table.Root>
            <Flex gap="2" justify="end" wrap="wrap">
              <Button variant="soft" loading={page.busy} onClick={() => fill(false)}>
                <Pencil1Icon /> Save filled
              </Button>
              <Button loading={page.busy} onClick={() => fill(true)}>
                <Pencil1Icon /> Save filled and signed
              </Button>
            </Flex>
          </Flex>
        </Card>
      )}
      {result !== null && (
        <Callout.Root color="grass" variant="surface">
          <Callout.Text>
            <Flex gap="3" align="center" wrap="wrap">
              <Text>{result.signed ? 'Filled and signed with the profile’s certificate.' : 'Filled.'}</Text>
              <Button asChild size="1">
                <a href={api.fileUrl(result.outputFileId)} download>
                  <DownloadIcon /> Download the PDF
                </a>
              </Button>
            </Flex>
          </Callout.Text>
        </Callout.Root>
      )}
    </Flex>
  )
}
