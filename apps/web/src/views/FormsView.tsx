import { DownloadIcon, Pencil1Icon } from '@radix-ui/react-icons'
import { Badge, Button, Callout, Card, Checkbox, Flex, Heading, Select, Table, Text, TextField } from '@radix-ui/themes'
import { useState } from 'react'
import type { FieldSuggestion, FormFillResult, FormInspection } from '@offee/contracts'
import { ContextPicker } from '@/components/ContextPicker'
import { ErrorCallout } from '@/components/ErrorCallout'
import { FilePickerButton } from '@/components/FilePickerButton'
import { ModelBadge } from '@/components/WorkflowResultCard'
import { useAction } from '@/hooks/useAction'
import { useDirectory } from '@/hooks/useDirectory'
import { useWorkContext } from '@/hooks/useWorkContext'
import { api } from '@/lib/api'

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

/** Fill a PDF form from a profile, check every value, then save it filled or signed. */
export const FormsView = () => {
  const { profileId, personaId } = useWorkContext()
  const { profiles } = useDirectory()
  const [inspection, setInspection] = useState<FormInspection | null>(null)
  const [values, setValues] = useState<FieldSuggestion[]>([])
  const [result, setResult] = useState<FormFillResult | null>(null)
  const action = useAction()
  const profile = profiles.find((candidate) => candidate.id === profileId)

  const setValue = (name: string, value: string) =>
    setValues((current) => current.map((entry) => (entry.name === name ? { ...entry, value } : entry)))

  const fill = (sign: boolean) => {
    if (inspection === null || profileId === null) return
    action.run(async () => setResult(await api.fillForm({ formFileId: inspection.formFileId, profileId, values, sign })))
  }

  return (
    <Flex direction="column" gap="4" className="page-wide">
      <ContextPicker />
      {profile === undefined && (
        <Callout.Root variant="surface">
          <Callout.Text>Choose a profile above: its details fill the form and its certificate signs it.</Callout.Text>
        </Callout.Root>
      )}
      <Flex gap="2" align="center" wrap="wrap">
        <FilePickerButton
          accept=".pdf,application/pdf"
          disabled={action.busy || profileId === null}
          onPick={(file) =>
            action.run(async () => {
              const inspected = await api.inspectForm(file, { profileId, personaId })
              setInspection(inspected)
              setValues(inspected.suggestions)
              setResult(null)
            })
          }
        >
          Open a PDF form
        </FilePickerButton>
        {action.busy && (
          <Text size="1" color="gray">
            Reading the form and suggesting values…
          </Text>
        )}
      </Flex>
      <ErrorCallout error={action.error} />
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
              <Button variant="soft" loading={action.busy} onClick={() => fill(false)}>
                <Pencil1Icon /> Save filled
              </Button>
              <Button loading={action.busy} onClick={() => fill(true)}>
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
