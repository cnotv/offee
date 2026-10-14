import { PlusIcon, TrashIcon } from '@radix-ui/react-icons'
import { Badge, Button, Callout, Card, Dialog, Flex, Grid, Heading, RadioCards, Text, TextArea, TextField } from '@radix-ui/themes'
import { useState } from 'react'
import type { Persona, PersonaInput } from '@offee/contracts'
import { ErrorCallout } from '@/components/ErrorCallout'
import { useAction } from '@/hooks/useAction'
import { useDirectory } from '@/hooks/useDirectory'
import { api } from '@/lib/api'

type PersonaDialogProps = {
  persona: Persona | null
  onClose: () => void
  onSaved: () => void
}

const PersonaDialog = ({ persona, onClose, onSaved }: PersonaDialogProps) => {
  const [draft, setDraft] = useState<PersonaInput>(
    persona === null ? { name: '', instructions: '', modelPreference: 'local' } : { name: persona.name, instructions: persona.instructions, modelPreference: persona.modelPreference },
  )
  const action = useAction()

  return (
    <Dialog.Root open onOpenChange={(open) => (open ? undefined : onClose())}>
      <Dialog.Content maxWidth="640px">
        <Dialog.Title>{persona === null ? 'New persona' : `Edit ${persona.name}`}</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="4">
          An assistant role: how it works and which model it may use.
        </Dialog.Description>
        <Flex direction="column" gap="3">
          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              Name
            </Text>
            <TextField.Root value={draft.name} placeholder="Contract reviewer" onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
          </Flex>
          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              Instructions
            </Text>
            <TextArea
              rows={6}
              value={draft.instructions}
              placeholder="You review contracts for a small company. Point out unusual clauses and missing protections, briefly."
              onChange={(event) => setDraft({ ...draft, instructions: event.target.value })}
            />
          </Flex>
          <Flex direction="column" gap="1">
            <Text size="2" weight="medium">
              Model
            </Text>
            <RadioCards.Root
              columns={{ initial: '1', sm: '2' }}
              value={draft.modelPreference}
              onValueChange={(value) => setDraft({ ...draft, modelPreference: value === 'remote' ? 'remote' : 'local' })}
            >
              <RadioCards.Item value="local">
                <Flex direction="column">
                  <Text weight="medium">Local only</Text>
                  <Text size="1" color="gray">
                    Never leaves this machine.
                  </Text>
                </Flex>
              </RadioCards.Item>
              <RadioCards.Item value="remote">
                <Flex direction="column">
                  <Text weight="medium">Remote when the switch allows</Text>
                  <Text size="1" color="gray">
                    Uses Claude through the gateway; falls back to local when sealed.
                  </Text>
                </Flex>
              </RadioCards.Item>
            </RadioCards.Root>
          </Flex>
          <ErrorCallout error={action.error} />
          <Flex gap="2" justify="end">
            <Button variant="soft" color="gray" onClick={onClose}>
              Cancel
            </Button>
            <Button
              loading={action.busy}
              disabled={draft.name.trim() === ''}
              onClick={() =>
                action.run(async () => {
                  if (persona === null) await api.createPersona(draft)
                  else await api.updatePersona(persona.id, draft)
                  onSaved()
                  onClose()
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

/** The assistant roles that do the work. */
export const PersonasView = () => {
  const { personas, reload } = useDirectory()
  const [editing, setEditing] = useState<{ persona: Persona | null; key: number } | null>(null)
  const action = useAction()

  return (
    <Flex direction="column" gap="4" className="page-wide">
      <Flex justify="between" align="center" gap="2" wrap="wrap">
        <Text size="2" color="gray">
          A persona is how the assistant works. Documents can be assigned to one in the library.
        </Text>
        <Button onClick={() => setEditing({ persona: null, key: Date.now() })}>
          <PlusIcon /> New persona
        </Button>
      </Flex>
      <ErrorCallout error={action.error} />
      {personas.length === 0 && (
        <Callout.Root variant="surface">
          <Callout.Text>No personas yet. Without one, Offee works as a careful general assistant on the local model.</Callout.Text>
        </Callout.Root>
      )}
      <Grid columns={{ initial: '1', sm: '2', md: '3' }} gap="3">
        {personas.map((persona) => (
          <Card key={persona.id} size="2">
            <Flex direction="column" gap="2">
              <Flex justify="between" align="center" gap="2">
                <Heading size="3">{persona.name}</Heading>
                <Badge color={persona.modelPreference === 'remote' ? 'amber' : 'grass'} variant="soft">
                  {persona.modelPreference === 'remote' ? 'Remote allowed' : 'Local only'}
                </Badge>
              </Flex>
              <Text size="1" color="gray" className="clamp-3">
                {persona.instructions || 'No instructions'}
              </Text>
              <Flex gap="2" justify="end">
                <Button variant="soft" size="1" onClick={() => setEditing({ persona, key: Date.now() })}>
                  Edit
                </Button>
                <Button
                  variant="soft"
                  color="red"
                  size="1"
                  onClick={() => action.run(async () => {
                    await api.deletePersona(persona.id)
                    reload()
                  })}
                >
                  <TrashIcon /> Delete
                </Button>
              </Flex>
            </Flex>
          </Card>
        ))}
      </Grid>
      {editing !== null && <PersonaDialog key={editing.key} persona={editing.persona} onClose={() => setEditing(null)} onSaved={reload} />}
    </Flex>
  )
}
