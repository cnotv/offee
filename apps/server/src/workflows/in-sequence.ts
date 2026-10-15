/**
 * Runs promise-returning steps one after another, never in parallel: a local model serves one
 * request at a time anyway, and OCR uses every core on each page.
 * @param items The inputs.
 * @param step The work for one input.
 * @returns The results, in order.
 */
export const inSequence = <Input, Output>(items: Input[], step: (item: Input) => Promise<Output>): Promise<Output[]> =>
  items.reduce<Promise<Output[]>>(async (previous, item) => [...(await previous), await step(item)], Promise.resolve([]))
