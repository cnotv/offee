import { StopIcon } from '@radix-ui/react-icons'
import { Button, Flex, Popover, Spinner, Text } from '@radix-ui/themes'
import { useNow, useOperations } from '@/hooks/useOperations'
import { describeEstimate, estimateOf, formatElapsed } from '@/lib/estimates'
import type { Operation, OperationKind } from '@/lib/types'

type OperationRowProps = { operation: Operation; now: number }

const OperationRow = ({ operation, now }: OperationRowProps) => {
  const { history, stop } = useOperations()
  return (
    <Flex align="center" justify="between" gap="3">
      <Flex direction="column" gap="1" minWidth="0">
        <Text size="2" weight="medium" truncate>
          {operation.label}
        </Text>
        <Text size="1" color="gray">
          {formatElapsed(now - operation.startedAt)} so far, {describeEstimate(estimateOf(history, operation.kind))}
        </Text>
      </Flex>
      <Button size="1" variant="soft" color="red" onClick={() => stop(operation.id)}>
        <StopIcon /> Stop
      </Button>
    </Flex>
  )
}

/** The operations of the given kinds that run now, each with its clock, estimate and a stop button. */
export const RunningOperations = ({ kinds }: { kinds: OperationKind[] }) => {
  const { operations } = useOperations()
  const running = operations.filter((operation) => kinds.includes(operation.kind))
  const now = useNow(running.length > 0)
  if (running.length === 0) return null
  return (
    <Flex direction="column" gap="2" className="running-operations">
      {running.map((operation) => (
        <OperationRow key={operation.id} operation={operation} now={now} />
      ))}
    </Flex>
  )
}

/** A small indicator on every page while anything runs; it opens the list of operations. */
export const OperationsIndicator = () => {
  const { operations } = useOperations()
  const now = useNow(operations.length > 0)
  const [current] = operations
  if (current === undefined) return null
  const others = operations.length - 1
  return (
    <Popover.Root>
      <Popover.Trigger>
        <Button variant="soft" size="2" className="operations-indicator" aria-label={`${operations.length} running, show them`}>
          <Spinner size="1" />
          <Text truncate>{current.label}</Text>
          <Text color="gray">{formatElapsed(now - current.startedAt)}</Text>
          {others > 0 && <Text color="gray">+{others}</Text>}
        </Button>
      </Popover.Trigger>
      <Popover.Content width="360px" maxWidth="calc(100vw - 32px)">
        <Flex direction="column" gap="3">
          <Text size="1" color="gray">
            Offee keeps working while you use the rest of the app; each result lands on its page.
          </Text>
          {operations.map((operation) => (
            <OperationRow key={operation.id} operation={operation} now={now} />
          ))}
        </Flex>
      </Popover.Content>
    </Popover.Root>
  )
}
