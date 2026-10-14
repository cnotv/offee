import { CopyIcon, DownloadIcon } from '@radix-ui/react-icons'
import { Badge, Box, Button, Card, Flex, Heading, Separator, Text, Tooltip } from '@radix-ui/themes'
import type { Citation, ModelUsed } from '@offee/contracts'
import { api } from '@/lib/api'

/** Which model wrote an answer, and why the local one did when a remote one was asked for. */
export const ModelBadge = ({ model }: { model: ModelUsed }) => {
  const badge = (
    <Badge color={model.kind === 'remote' ? 'amber' : model.fallbackReason === null ? 'grass' : 'orange'} variant="soft">
      {model.kind === 'remote' ? 'Remote' : 'Local'}: {model.name}
    </Badge>
  )
  return model.fallbackReason === null ? badge : <Tooltip content={`Fell back to the local model: ${model.fallbackReason}`}>{badge}</Tooltip>
}

/** The passages an answer drew on. */
export const CitationList = ({ citations }: { citations: Citation[] }) =>
  citations.length === 0 ? null : (
    <Flex direction="column" gap="2">
      <Text size="2" weight="medium">
        Sources
      </Text>
      {citations.map((citation, index) => (
        <Box key={`${citation.documentId}-${index}`} className="citation">
          <Text size="1" color="gray">
            [{index + 1}] {citation.documentTitle}
          </Text>
          <Text as="p" size="1" className="citation-excerpt">
            {citation.excerpt}
          </Text>
        </Box>
      ))}
    </Flex>
  )

type WorkflowResultCardProps = {
  title: string
  text: string
  model: ModelUsed | null
  citations: Citation[]
  outputFileId: string | null
}

/** A workflow's output: the text, who wrote it, its sources, and the file to download. */
export const WorkflowResultCard = ({ title, text, model, citations, outputFileId }: WorkflowResultCardProps) => (
  <Card size="3">
    <Flex direction="column" gap="3">
      <Flex justify="between" align="center" gap="2" wrap="wrap">
        <Heading size="3">{title}</Heading>
        <Flex gap="2" align="center" wrap="wrap">
          {model !== null && <ModelBadge model={model} />}
          <Button variant="soft" size="1" onClick={() => void navigator.clipboard.writeText(text)}>
            <CopyIcon /> Copy
          </Button>
          {outputFileId !== null && (
            <Button asChild variant="soft" size="1">
              <a href={api.fileUrl(outputFileId)} download>
                <DownloadIcon /> Download DOCX
              </a>
            </Button>
          )}
        </Flex>
      </Flex>
      <Text as="div" size="2" className="result-text">
        {text}
      </Text>
      {citations.length > 0 && <Separator size="4" />}
      <CitationList citations={citations} />
    </Flex>
  </Card>
)
