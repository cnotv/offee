import { Pencil2Icon } from '@radix-ui/react-icons'
import { Button, Flex, Text, TextArea, TextField } from '@radix-ui/themes'
import { useState } from 'react'
import type { WorkflowResult } from '@offee/contracts'
import { ContextPicker } from '@/components/ContextPicker'
import { ErrorCallout } from '@/components/ErrorCallout'
import { FilePickerButton } from '@/components/FilePickerButton'
import { WorkflowResultCard } from '@/components/WorkflowResultCard'
import { useAction } from '@/hooks/useAction'
import { useWorkContext } from '@/hooks/useWorkContext'
import { api } from '@/lib/api'

/** Draft a reply to an email or chat thread from what Offee knows. */
export const ReplyView = () => {
  const { profileId, personaId } = useWorkContext()
  const [thread, setThread] = useState('')
  const [guidance, setGuidance] = useState('')
  const [result, setResult] = useState<WorkflowResult | null>(null)
  const action = useAction()

  return (
    <Flex direction="column" gap="4" className="page-narrow">
      <ContextPicker />
      <Flex direction="column" gap="2">
        <Flex justify="between" align="center" gap="2" wrap="wrap">
          <Text size="2" weight="medium">
            The email or chat thread
          </Text>
          <FilePickerButton
            accept=".eml,.mbox,.txt,.md"
            disabled={action.busy}
            onPick={(file) => action.run(async () => setThread((await api.extractText(file)).text))}
          >
            Load an .eml file
          </FilePickerButton>
        </Flex>
        <TextArea size="2" rows={12} placeholder="Paste the thread here" value={thread} onChange={(event) => setThread(event.target.value)} />
      </Flex>
      <Flex direction="column" gap="2">
        <Text size="2" weight="medium">
          What the reply should say (optional)
        </Text>
        <TextField.Root placeholder="Accept the meeting, propose Thursday instead" value={guidance} onChange={(event) => setGuidance(event.target.value)} />
      </Flex>
      <Flex justify="end">
        <Button
          loading={action.busy}
          disabled={thread.trim() === ''}
          onClick={() => action.run(async () => setResult(await api.reply({ profileId, personaId, thread, guidance })))}
        >
          <Pencil2Icon /> Draft the reply
        </Button>
      </Flex>
      <ErrorCallout error={action.error} />
      {result !== null && <WorkflowResultCard title="Draft" text={result.text} model={result.model} citations={result.citations} outputFileId={null} />}
    </Flex>
  )
}
