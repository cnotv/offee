import { Flex, Select, Text } from '@radix-ui/themes'
import { useDirectory } from '@/hooks/useDirectory'
import { useWorkContext } from '@/hooks/useWorkContext'

const none = '__none'

/** Chooses the profile the work is for and the persona that does it. */
export const ContextPicker = () => {
  const { profiles, personas } = useDirectory()
  const { profileId, personaId, setProfileId, setPersonaId } = useWorkContext()
  const knownProfileId = profiles.some((profile) => profile.id === profileId) ? profileId : null
  const knownPersonaId = personas.some((persona) => persona.id === personaId) ? personaId : null

  return (
    <Flex gap="3" wrap="wrap" align="center">
      <Flex gap="2" align="center">
        <Text size="2" color="gray">
          For
        </Text>
        <Select.Root value={knownProfileId ?? none} onValueChange={(value) => setProfileId(value === none ? null : value)}>
          <Select.Trigger placeholder="Profile" aria-label="Profile" />
          <Select.Content>
            <Select.Item value={none}>No profile</Select.Item>
            {profiles.map((profile) => (
              <Select.Item key={profile.id} value={profile.id}>
                {profile.label}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </Flex>
      <Flex gap="2" align="center">
        <Text size="2" color="gray">
          as
        </Text>
        <Select.Root value={knownPersonaId ?? none} onValueChange={(value) => setPersonaId(value === none ? null : value)}>
          <Select.Trigger placeholder="Persona" aria-label="Persona" />
          <Select.Content>
            <Select.Item value={none}>Default assistant</Select.Item>
            {personas.map((persona) => (
              <Select.Item key={persona.id} value={persona.id}>
                {persona.name}
                {persona.modelPreference === 'remote' ? ' (remote)' : ''}
              </Select.Item>
            ))}
          </Select.Content>
        </Select.Root>
      </Flex>
    </Flex>
  )
}
