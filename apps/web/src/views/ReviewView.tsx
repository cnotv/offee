import { ReaderIcon } from '@radix-ui/react-icons'
import { Button, Flex, Select, Text, TextArea } from '@radix-ui/themes'
import { useState } from 'react'
import type { WorkflowResult } from '@offee/contracts'
import { ContextPicker } from '@/components/ContextPicker'
import { ErrorCallout } from '@/components/ErrorCallout'
import { FilePickerButton } from '@/components/FilePickerButton'
import { WorkflowResultCard } from '@/components/WorkflowResultCard'
import { useAction } from '@/hooks/useAction'
import { useLoad } from '@/hooks/useLoad'
import { useWorkContext } from '@/hooks/useWorkContext'
import { api } from '@/lib/api'

/** Write a structured review from notes, text, or a recording transcribed on this machine. */
export const ReviewView = () => {
  const { profileId, personaId } = useWorkContext()
  const templates = useLoad(api.reviewTemplates)
  const [templateId, setTemplateId] = useState('meeting')
  const [source, setSource] = useState('')
  const [result, setResult] = useState<WorkflowResult | null>(null)
  const action = useAction()

  return (
    <Flex direction="column" gap="4" className="page-narrow">
      <ContextPicker />
      <Flex direction="column" gap="2">
        <Flex justify="between" align="center" gap="2" wrap="wrap">
          <Text size="2" weight="medium">
            Notes, text or a transcript
          </Text>
          <Flex gap="2" wrap="wrap">
            <FilePickerButton
              accept="audio/*,video/*,.m4a,.mp3,.wav,.ogg,.webm,.mp4"
              disabled={action.busy}
              onPick={(file) => action.run(async () => setSource((await api.transcribe(file)).text))}
            >
              Transcribe a recording
            </FilePickerButton>
            <FilePickerButton
              accept=".pdf,.docx,.txt,.md"
              disabled={action.busy}
              onPick={(file) => action.run(async () => setSource((await api.extractText(file)).text))}
            >
              Load a document
            </FilePickerButton>
          </Flex>
        </Flex>
        <TextArea size="2" rows={14} value={source} onChange={(event) => setSource(event.target.value)} placeholder="Paste notes, or transcribe a recording" />
        {action.busy && (
          <Text size="1" color="gray">
            Working… a long recording can take several minutes.
          </Text>
        )}
      </Flex>
      <Flex gap="3" align="end" justify="between" wrap="wrap">
        <Flex direction="column" gap="1">
          <Text size="2" weight="medium">
            Template
          </Text>
          <Select.Root value={templateId} onValueChange={setTemplateId}>
            <Select.Trigger aria-label="Template" />
            <Select.Content>
              {(templates.value ?? []).map((template) => (
                <Select.Item key={template.id} value={template.id}>
                  {template.name}
                </Select.Item>
              ))}
            </Select.Content>
          </Select.Root>
        </Flex>
        <Button
          loading={action.busy}
          disabled={source.trim() === ''}
          onClick={() => action.run(async () => setResult(await api.review({ profileId, personaId, source, templateId })))}
        >
          <ReaderIcon /> Write the review
        </Button>
      </Flex>
      <ErrorCallout error={action.error ?? templates.error} />
      {result !== null && <WorkflowResultCard title="Review" text={result.text} model={result.model} citations={[]} outputFileId={result.outputFileId} />}
    </Flex>
  )
}
