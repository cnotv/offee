import { DownloadIcon, EyeOpenIcon } from '@radix-ui/react-icons'
import { Button, Dialog, Flex, ScrollArea } from '@radix-ui/themes'
import type { SampleFile } from '@/lib/types'

/** Shows a bundled sample's page before trying it, with the PDF itself to download. */
export const SamplePreviewButton = ({ sample }: { sample: SampleFile }) => {
  if (sample.pageImagePath === null) return null
  return (
    <Dialog.Root>
      <Dialog.Trigger>
        <Button variant="ghost">
          <EyeOpenIcon /> View it
        </Button>
      </Dialog.Trigger>
      <Dialog.Content maxWidth="760px">
        <Dialog.Title>{sample.name}</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="3">
          A made up sample shipped with Offee. Every name and number in it is fictional.
        </Dialog.Description>
        <ScrollArea type="auto" scrollbars="vertical" style={{ maxHeight: '65vh' }}>
          <img src={sample.pageImagePath} alt={`The page of ${sample.name}`} className="sample-page" />
        </ScrollArea>
        <Flex justify="end" gap="2" mt="4">
          <Button asChild variant="soft">
            <a href={sample.path} download={sample.name}>
              <DownloadIcon /> Download the PDF
            </a>
          </Button>
          <Dialog.Close>
            <Button variant="soft" color="gray">
              Close
            </Button>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  )
}
