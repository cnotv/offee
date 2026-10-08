import { UploadIcon } from '@radix-ui/react-icons'
import { Button } from '@radix-ui/themes'
import { useRef, type ReactNode } from 'react'

type FilePickerButtonProps = {
  accept: string
  onPick: (file: File) => void
  disabled?: boolean
  children: ReactNode
}

/** A button that opens the file chooser. The file reaches Offee only through this upload. */
export const FilePickerButton = ({ accept, onPick, disabled = false, children }: FilePickerButtonProps) => {
  const inputReference = useRef<HTMLInputElement>(null)
  return (
    <>
      <input
        ref={inputReference}
        type="file"
        accept={accept}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = ''
          if (file !== undefined) onPick(file)
        }}
      />
      <Button variant="surface" disabled={disabled} onClick={() => inputReference.current?.click()}>
        <UploadIcon /> {children}
      </Button>
    </>
  )
}
