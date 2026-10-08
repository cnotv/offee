import { GlobeIcon } from '@radix-ui/react-icons'
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

/** Translate text or a document, keeping its paragraphs, with a glossary of fixed terms. */
export const TranslateView = () => {
  const { profileId, personaId } = useWorkContext()
  const [text, setText] = useState('')
  const [targetLanguage, setTargetLanguage] = useState('English')
  const [glossary, setGlossary] = useState('')
  const [result, setResult] = useState<WorkflowResult | null>(null)
  const action = useAction()

  return (
    <Flex direction="column" gap="4" className="page-narrow">
      <ContextPicker />
      <Flex direction="column" gap="2">
        <Flex justify="between" align="center" gap="2" wrap="wrap">
          <Text size="2" weight="medium">
            Text to translate
          </Text>
          <FilePickerButton
            accept=".pdf,.docx,.txt,.md,.eml"
            disabled={action.busy}
            onPick={(file) => action.run(async () => setText((await api.extractText(file)).text))}
          >
            Load a document
          </FilePickerButton>
        </Flex>
        <TextArea size="2" rows={12} value={text} onChange={(event) => setText(event.target.value)} placeholder="Paste text, or load a PDF or DOCX" />
      </Flex>
      <Flex gap="3" wrap="wrap">
        <Flex direction="column" gap="1" className="field-medium">
          <Text size="2" weight="medium">
            Into
          </Text>
          <TextField.Root value={targetLanguage} onChange={(event) => setTargetLanguage(event.target.value)} />
        </Flex>
        <Flex direction="column" gap="1" className="field-grow">
          <Text size="2" weight="medium">
            Glossary (one "term = translation" per line)
          </Text>
          <TextArea rows={2} value={glossary} onChange={(event) => setGlossary(event.target.value)} />
        </Flex>
      </Flex>
      <Flex justify="end">
        <Button
          loading={action.busy}
          disabled={text.trim() === '' || targetLanguage.trim() === ''}
          onClick={() => action.run(async () => setResult(await api.translate({ profileId, personaId, text, targetLanguage, glossary })))}
        >
          <GlobeIcon /> Translate
        </Button>
      </Flex>
      <ErrorCallout error={action.error} />
      {result !== null && (
        <WorkflowResultCard title="Translation" text={result.text} model={result.model} citations={[]} outputFileId={result.outputFileId} />
      )}
    </Flex>
  )
}
