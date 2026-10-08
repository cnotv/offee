import { PaperPlaneIcon } from '@radix-ui/react-icons'
import { Box, Button, Card, Flex, Text, TextArea } from '@radix-ui/themes'
import { useState } from 'react'
import type { ChatTurn, WorkflowResult } from '@offee/contracts'
import { ContextPicker } from '@/components/ContextPicker'
import { ErrorCallout } from '@/components/ErrorCallout'
import { CitationList, ModelBadge } from '@/components/WorkflowResultCard'
import { useAction } from '@/hooks/useAction'
import { useWorkContext } from '@/hooks/useWorkContext'
import { api } from '@/lib/api'

type Exchange = { question: string; answer: WorkflowResult }

/** Ask questions answered from the documents the chosen profile and persona may use. */
export const ChatView = () => {
  const { profileId, personaId } = useWorkContext()
  const [message, setMessage] = useState('')
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const action = useAction()

  const send = () => {
    const question = message.trim()
    if (question === '') return
    const history: ChatTurn[] = exchanges.slice(-6).flatMap((exchange) => [
      { role: 'user', content: exchange.question },
      { role: 'assistant', content: exchange.answer.text },
    ])
    action.run(async () => {
      const answer = await api.chat({ profileId, personaId, history, message: question })
      setExchanges((previous) => [...previous, { question, answer }])
      setMessage('')
    })
  }

  return (
    <Flex direction="column" gap="4" className="page-narrow">
      <ContextPicker />
      {exchanges.length === 0 && (
        <Text size="2" color="gray">
          Ask anything. Answers draw on the documents in your library that are shared or assigned to the chosen profile or persona.
        </Text>
      )}
      {exchanges.map((exchange) => (
        <Flex key={exchange.answer.runId} direction="column" gap="2">
          <Box className="chat-question">
            <Text size="2">{exchange.question}</Text>
          </Box>
          <Card>
            <Flex direction="column" gap="3">
              <Flex justify="end">
                <ModelBadge model={exchange.answer.model} />
              </Flex>
              <Text as="div" size="2" className="result-text">
                {exchange.answer.text}
              </Text>
              <CitationList citations={exchange.answer.citations} />
            </Flex>
          </Card>
        </Flex>
      ))}
      <ErrorCallout error={action.error} />
      <Flex direction="column" gap="2">
        <TextArea
          size="3"
          rows={3}
          placeholder="Ask a question…"
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) send()
          }}
        />
        <Flex justify="between" align="center">
          <Text size="1" color="gray">
            Ctrl or Cmd + Enter to send
          </Text>
          <Button onClick={send} loading={action.busy} disabled={message.trim() === ''}>
            <PaperPlaneIcon /> Send
          </Button>
        </Flex>
      </Flex>
    </Flex>
  )
}
