import { readFileSync } from 'node:fs'
import { z } from 'zod'

const destinationSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  baseUrl: z.url({ protocol: /^https$/ }),
  allowedPaths: z.array(z.string().startsWith('/')).min(1),
  forwardedHeaders: z.array(z.string().toLowerCase()),
  keyHeader: z.string().min(1),
  keyEnvironmentVariable: z.string().min(1),
})

const destinationListSchema = z.array(destinationSchema)

export type Destination = z.infer<typeof destinationSchema>

/**
 * Parses the list of places the gateway may send to.
 * @param rawJson The file's contents.
 * @returns The destinations; throws when the file is malformed.
 */
export const parseDestinations = (rawJson: string): Destination[] => destinationListSchema.parse(JSON.parse(rawJson))

/**
 * Reads the list of destinations from disk.
 * @param filePath The JSON file.
 * @returns The destinations.
 */
export const loadDestinations = (filePath: string): Destination[] => parseDestinations(readFileSync(filePath, 'utf8'))

/**
 * Finds a destination by the id the app names. The app never chooses a host.
 * @param destinations The allowed destinations.
 * @param id The id requested.
 * @returns The destination, or undefined when it is not listed.
 */
export const findDestination = (destinations: Destination[], id: string): Destination | undefined =>
  destinations.find((destination) => destination.id === id)

/**
 * Whether a path is one the destination allows, compared exactly so no other endpoint of the
 * same host is reachable.
 * @param destination The destination.
 * @param path The path the app asked for, without a query string.
 * @returns True when listed.
 */
export const isAllowedPath = (destination: Destination, path: string): boolean => destination.allowedPaths.includes(path)
