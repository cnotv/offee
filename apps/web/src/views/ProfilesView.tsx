import { PlusIcon, TrashIcon } from '@radix-ui/react-icons'
import { AlertDialog, Badge, Box, Button, Callout, Card, Dialog, Flex, Grid, Heading, Text, TextArea, TextField } from '@radix-ui/themes'
import { useState } from 'react'
import type { Profile, ProfileInput, ProfileReading } from '@offee/contracts'
import { ErrorCallout } from '@/components/ErrorCallout'
import { FilePickerButton } from '@/components/FilePickerButton'
import { ModelBadge } from '@/components/WorkflowResultCard'
import { useAction } from '@/hooks/useAction'
import { useDirectory } from '@/hooks/useDirectory'
import { api } from '@/lib/api'
import { mergeProfileDetails } from '@/lib/merge-profile-details'

const emptyProfile: ProfileInput = {
  label: '',
  firstName: '',
  lastName: '',
  role: '',
  organization: '',
  email: '',
  phone: '',
  street: '',
  postalCode: '',
  city: '',
  country: '',
  languages: [],
  tone: '',
  facts: '',
  signatureImage: null,
}

const toInput = (profile: Profile): ProfileInput => ({
  label: profile.label,
  firstName: profile.firstName,
  lastName: profile.lastName,
  role: profile.role,
  organization: profile.organization,
  email: profile.email,
  phone: profile.phone,
  street: profile.street,
  postalCode: profile.postalCode,
  city: profile.city,
  country: profile.country,
  languages: profile.languages,
  tone: profile.tone,
  facts: profile.facts,
  signatureImage: profile.signatureImage,
})

type TextKey = Exclude<keyof ProfileInput, 'languages' | 'signatureImage' | 'facts'>

const textFields: { key: TextKey; label: string; placeholder?: string }[] = [
  { key: 'label', label: 'Profile name', placeholder: 'Work, Personal, Company director…' },
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'role', label: 'Role' },
  { key: 'organization', label: 'Organization' },
  { key: 'email', label: 'Email' },
  { key: 'phone', label: 'Phone' },
  { key: 'street', label: 'Street and number' },
  { key: 'postalCode', label: 'Postal code' },
  { key: 'city', label: 'City' },
  { key: 'country', label: 'Country' },
  { key: 'tone', label: 'Tone', placeholder: 'Warm but brief' },
]

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => (typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read the image')))
    reader.onerror = () => reject(new Error('Could not read the image'))
    reader.readAsDataURL(file)
  })

type ProfileDialogProps = {
  profile: Profile | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

const ProfileDialog = ({ profile, open, onOpenChange, onSaved }: ProfileDialogProps) => {
  const [draft, setDraft] = useState<ProfileInput>(profile === null ? emptyProfile : toInput(profile))
  const [reading, setReading] = useState<ProfileReading | null>(null)
  const action = useAction()
  const documentReading = useAction()
  const set = <Key extends keyof ProfileInput>(key: Key, value: ProfileInput[Key]) => setDraft((current) => ({ ...current, [key]: value }))

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content maxWidth="720px">
        <Dialog.Title>{profile === null ? 'New profile' : `Edit ${profile.label}`}</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="4">
          An identity you act as. Its details fill forms; its tone and facts shape what Offee writes for it.
        </Dialog.Description>
        <Flex direction="column" gap="3">
          <Flex gap="2" align="center" wrap="wrap">
            <FilePickerButton
              accept=".pdf,.docx,.txt,.png,.jpg,.jpeg,.tif,.tiff"
              disabled={documentReading.busy}
              onPick={(file) =>
                documentReading.run(async () => {
                  const read = await api.readProfileDocument(file)
                  setDraft((current) => mergeProfileDetails(current, read.details))
                  setReading(read)
                })
              }
            >
              Read from a document
            </FilePickerButton>
            <Text size="1" color="gray">
              {documentReading.busy ? 'Reading the document on this machine…' : 'An ID, a CV or a scan: the local model fills in what it says.'}
            </Text>
          </Flex>
          <ErrorCallout error={documentReading.error} />
          {reading !== null && (
            <Callout.Root color="grass" variant="surface">
              <Callout.Text>
                <Flex gap="2" align="center" wrap="wrap">
                  <Text>Read from {reading.fileName}. Check every value, then save.</Text>
                  <ModelBadge model={reading.model} />
                </Flex>
              </Callout.Text>
            </Callout.Root>
          )}
          <Grid columns={{ initial: '1', sm: '2' }} gap="3">
            {textFields.map((field) => (
              <Flex key={field.key} direction="column" gap="1">
                <Text size="2" weight="medium">
                  {field.label}
                </Text>
                <TextField.Root value={draft[field.key]} placeholder={field.placeholder} onChange={(event) => set(field.key, event.target.value)} />
              </Flex>
            ))}
            <Flex direction="column" gap="1">
              <Text size="2" weight="medium">
                Languages (comma separated)
              </Text>
              <TextField.Root
                value={draft.languages.join(', ')}
                onChange={(event) =>
                  set(
                    'languages',
                    event.target.value
                      .split(',')
                      .map((language) => language.trim())
                      .filter((language) => language !== ''),
                  )
                }
              />
            </Flex>
          </Grid>
          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              Facts Offee may use (IDs, preferences, anything forms ask for)
            </Text>
            <TextArea rows={4} value={draft.facts} onChange={(event) => set('facts', event.target.value)} />
          </Flex>
          <Flex direction="column" gap="2">
            <Text size="2" weight="medium">
              Signature image
            </Text>
            <Flex gap="3" align="center" wrap="wrap">
              {draft.signatureImage !== null && (
                <Box className="signature-preview">
                  <img src={draft.signatureImage} alt="Signature" />
                </Box>
              )}
              <FilePickerButton accept="image/png,image/jpeg" onPick={(file) => action.run(async () => set('signatureImage', await readAsDataUrl(file)))}>
                {draft.signatureImage === null ? 'Add a PNG or JPEG' : 'Replace'}
              </FilePickerButton>
              {draft.signatureImage !== null && (
                <Button variant="ghost" color="red" onClick={() => set('signatureImage', null)}>
                  Remove
                </Button>
              )}
            </Flex>
          </Flex>
          <ErrorCallout error={action.error} />
          <Flex gap="2" justify="end">
            <Dialog.Close>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              loading={action.busy}
              disabled={draft.label.trim() === ''}
              onClick={() =>
                action.run(async () => {
                  if (profile === null) await api.createProfile(draft)
                  else await api.updateProfile(profile.id, draft)
                  onSaved()
                  onOpenChange(false)
                })
              }
            >
              Save
            </Button>
          </Flex>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  )
}

/** The identities the person acts as. */
export const ProfilesView = () => {
  const { profiles, reload } = useDirectory()
  const [editing, setEditing] = useState<{ profile: Profile | null; key: number } | null>(null)
  const action = useAction()

  return (
    <Flex direction="column" gap="4" className="page-wide">
      <Flex justify="between" align="center" gap="2" wrap="wrap">
        <Text size="2" color="gray">
          One person can keep several profiles. A signing certificate is created the first time a profile signs.
        </Text>
        <Button onClick={() => setEditing({ profile: null, key: Date.now() })}>
          <PlusIcon /> New profile
        </Button>
      </Flex>
      <ErrorCallout error={action.error} />
      {profiles.length === 0 && (
        <Callout.Root variant="surface">
          <Callout.Text>No profiles yet. Create one to fill forms and give replies your name and tone.</Callout.Text>
        </Callout.Root>
      )}
      <Grid columns={{ initial: '1', sm: '2', md: '3' }} gap="3">
        {profiles.map((profile) => (
          <Card key={profile.id} size="2">
            <Flex direction="column" gap="2">
              <Flex justify="between" align="center">
                <Heading size="3">{profile.label}</Heading>
                {profile.hasCertificate && (
                  <Badge color="grass" variant="soft">
                    Certificate
                  </Badge>
                )}
              </Flex>
              <Text size="2">{`${profile.firstName} ${profile.lastName}`.trim() || 'No name yet'}</Text>
              <Text size="1" color="gray">
                {[profile.role, profile.organization, profile.email].filter((part) => part !== '').join(' · ') || ' '}
              </Text>
              <Flex gap="2" justify="end">
                <Button variant="soft" size="1" onClick={() => setEditing({ profile, key: Date.now() })}>
                  Edit
                </Button>
                <AlertDialog.Root>
                  <AlertDialog.Trigger>
                    <Button variant="soft" color="red" size="1">
                      <TrashIcon /> Delete
                    </Button>
                  </AlertDialog.Trigger>
                  <AlertDialog.Content maxWidth="420px">
                    <AlertDialog.Title>Delete {profile.label}?</AlertDialog.Title>
                    <AlertDialog.Description size="2">Its details and signing certificate are removed. Documents stay in the library.</AlertDialog.Description>
                    <Flex gap="2" justify="end" mt="4">
                      <AlertDialog.Cancel>
                        <Button variant="soft" color="gray">
                          Cancel
                        </Button>
                      </AlertDialog.Cancel>
                      <AlertDialog.Action>
                        <Button color="red" onClick={() => action.run(async () => {
                          await api.deleteProfile(profile.id)
                          reload()
                        })}>
                          Delete
                        </Button>
                      </AlertDialog.Action>
                    </Flex>
                  </AlertDialog.Content>
                </AlertDialog.Root>
              </Flex>
            </Flex>
          </Card>
        ))}
      </Grid>
      {editing !== null && (
        <ProfileDialog key={editing.key} profile={editing.profile} open onOpenChange={(open) => (open ? undefined : setEditing(null))} onSaved={reload} />
      )}
    </Flex>
  )
}
