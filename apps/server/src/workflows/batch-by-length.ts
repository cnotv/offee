/**
 * Groups items into batches whose total length stays within a budget, so each batch fits in
 * one request to a model with a small context. An item longer than the budget gets a batch of
 * its own rather than being cut.
 * @param items The items, in order.
 * @param lengthOf How long one item is.
 * @param budget The longest a batch may be.
 * @returns The batches, in order, none empty.
 */
export const batchByLength = <Item>(items: Item[], lengthOf: (item: Item) => number, budget: number): Item[][] =>
  items
    .reduce<{ batches: Item[][]; length: number }>(
      ({ batches, length }, item) => {
        const last = batches.at(-1)
        const itemLength = lengthOf(item)
        if (last !== undefined && length + itemLength <= budget) return { batches: [...batches.slice(0, -1), [...last, item]], length: length + itemLength }
        return { batches: [...batches, [item]], length: itemLength }
      },
      { batches: [], length: 0 },
    )
    .batches
