import { ExclamationTriangleIcon } from '@radix-ui/react-icons'
import { Callout } from '@radix-ui/themes'

/** Shows an error message, or nothing. */
export const ErrorCallout = ({ error }: { error: string | null }) =>
  error === null ? null : (
    <Callout.Root color="red" variant="surface">
      <Callout.Icon>
        <ExclamationTriangleIcon />
      </Callout.Icon>
      <Callout.Text>{error}</Callout.Text>
    </Callout.Root>
  )
