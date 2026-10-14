import { PaperPlaneIcon, PlusIcon } from '@radix-ui/react-icons'
import { Box, Button, Card, Flex, Spinner, Text, TextArea } from '@radix-ui/themes'
import type { ChatTurn } from '@offee/contracts'
import { ContextPicker } from '@/components/ContextPicker'
import { ErrorCallout } from '@/components/ErrorCallout'
import { CitationList, ModelBadge } from '@/components/WorkflowResultCard'
import { useContinuation, useWorkflowPage } from '@/hooks/useWorkflowPages'
import { useWorkContext } from '@/hooks/useWorkContext'
import { api } from '@/lib/api'

const historyTurns = 6

/** Ask questions answered from the documents the chosen profile and persona may use. */
export const ChatView = () => {
  const { profileId, personaId } = useWorkContext()
  const page = useWorkflowPage('chat')
  const { empty } = useContinuation()
  const { conversationId, exchanges, message, pendingQuestion } = page.state

  const send = () => {
    const question = message.trim()
    if (question === '') return
    const history: ChatTurn[] = exchanges.slice(-historyTurns).flatMap((exchange) => [
      { role: 'user', content: exchange.question },
      { role: 'assistant', content: exchange.answer.text },
    ])
    page.set({ message: '', pendingQuestion: question })
    page.run(async () => {
      try {
        const answer = await api.chat({ profileId, personaId, conversationId, history, message: question })
        page.change((current) => ({ exchanges: [...current.exchanges, { question, answer }], pendingQuestion: null }))
      } catch (error) {
        // The question goes back into the box, so nothing typed is lost.
        page.change((current) => ({ message: current.message === '' ? question : current.message, pendingQuestion: null }))
        throw error
      }
    })
  }

  return (
    <Flex direction="column" gap="4" className="page-narrow">
      <Flex justify="between" align="end" gap="3" wrap="wrap">
        <ContextPicker />
        {exchanges.length > 0 && (
          <Button variant="soft" color="gray" disabled={page.busy} onClick={() => page.set(empty().chat)}>
            <PlusIcon /> New conversation
          </Button>
        )}
      </Flex>
      {exchanges.length === 0 && pendingQuestion === null && (
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
              {exchange.answer.model !== null && (
                <Flex justify="end">
                  <ModelBadge model={exchange.answer.model} />
                </Flex>
              )}
              <Text as="div" size="2" className="result-text">
                {exchange.answer.text}
              </Text>
              <CitationList citations={exchange.answer.citations} />
            </Flex>
          </Card>
        </Flex>
      ))}
      {pendingQuestion !== null && (
        <Flex direction="column" gap="2">
          <Box className="chat-question">
            <Text size="2">{pendingQuestion}</Text>
          </Box>
          <Flex gap="2" align="center">
            <Spinner />
            <Text size="2" color="gray">
              Writing… a local model can take a minute or more. You can leave this page; the answer will be here.
            </Text>
          </Flex>
        </Flex>
      )}
      <ErrorCallout error={page.error} />
      <Flex direction="column" gap="2">
        <TextArea
          size="3"
          rows={3}
          placeholder={exchanges.length === 0 ? 'Ask a question…' : 'Ask a follow-up…'}
          value={message}
          onChange={(event) => page.set({ message: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) send()
          }}
        />
        <Flex justify="between" align="center">
          <Text size="1" color="gray">
            Ctrl or Cmd + Enter to send
          </Text>
          <Button onClick={send} loading={page.busy} disabled={message.trim() === ''}>
            <PaperPlaneIcon /> Send
          </Button>
        </Flex>
      </Flex>
    </Flex>
  )
}
