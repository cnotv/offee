import { Pencil2Icon } from '@radix-ui/react-icons'
import { Button, Flex, Text, TextArea, TextField } from '@radix-ui/themes'
import { ContextPicker } from '@/components/ContextPicker'
import { ErrorCallout } from '@/components/ErrorCallout'
import { FilePickerButton } from '@/components/FilePickerButton'
import { WorkflowResultCard } from '@/components/WorkflowResultCard'
import { useWorkContext } from '@/hooks/useWorkContext'
import { useWorkflowPage } from '@/hooks/useWorkflowPages'
import { api } from '@/lib/api'

/** Draft a reply to an email or chat thread from what Offee knows. */
export const ReplyView = () => {
  const { profileId, personaId } = useWorkContext()
  const page = useWorkflowPage('reply')
  const { thread, guidance, result } = page.state

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
            disabled={page.busy}
            onPick={(file) => page.run({ kind: 'extract', label: `Reading ${file.name}` }, async (signal) => page.set({ thread: (await api.extractText(file, signal)).text }))}
          >
            Load an .eml file
          </FilePickerButton>
        </Flex>
        <TextArea size="2" rows={12} placeholder="Paste the thread here" value={thread} onChange={(event) => page.set({ thread: event.target.value })} />
      </Flex>
      <Flex direction="column" gap="2">
        <Text size="2" weight="medium">
          What the reply should say (optional)
        </Text>
        <TextField.Root placeholder="Accept the meeting, propose Thursday instead" value={guidance} onChange={(event) => page.set({ guidance: event.target.value })} />
      </Flex>
      <Flex justify="end">
        <Button
          loading={page.busy}
          disabled={thread.trim() === ''}
          onClick={() => page.run({ kind: 'reply', label: 'Drafting a reply' }, async (signal) => page.set({ result: await api.reply({ profileId, personaId, thread, guidance }, signal) }))}
        >
          <Pencil2Icon /> Draft the reply
        </Button>
      </Flex>
      <ErrorCallout error={page.error} />
      {result !== null && <WorkflowResultCard title="Draft" text={result.text} model={result.model} citations={result.citations} outputFileId={null} />}
    </Flex>
  )
}
