export type ProgramBatch<T> = { items: T[]; nextCursor: string | null };

export type ScanPosition<T> = {
  pending: T[];
  cursor: string | null;
};

export async function scanPage<T extends { id: string }>(options: {
  start: ScanPosition<T>;
  pageSize: number;
  maxRows: number;
  fetchBatch: (cursor: string, limit: number) => Promise<ProgramBatch<T>>;
  accept: (item: T) => boolean;
  initialItems?: T[];
  excludedIds?: ReadonlySet<string>;
  onProgress?: (items: T[]) => void;
}) {
  const { pageSize, maxRows, fetchBatch, accept } = options;
  const ids = new Set(options.excludedIds);
  const items: T[] = [];
  const priority = [...(options.initialItems ?? [])];
  let { pending, cursor } = options.start;
  let priorityIndex = 0;
  let rowsScanned = 0;

  const add = (item: T) => {
    if (ids.has(item.id) || !accept(item)) return;
    ids.add(item.id);
    items.push(item);
  };
  while (priorityIndex < priority.length && items.length < pageSize) {
    add(priority[priorityIndex++]);
  }
  if (priorityIndex < priority.length) pending = [...priority.slice(priorityIndex), ...pending];
  if (items.length) options.onProgress?.([...items]);

  while (items.length < pageSize && rowsScanned < maxRows) {
    if (pending.length === 0) {
      if (cursor === null) break;
      const limit = Math.min(cursor === '' ? pageSize : 200, maxRows - rowsScanned);
      const batch = await fetchBatch(cursor, limit);
      if (batch.nextCursor !== null && (batch.nextCursor === cursor || !batch.items.length)) {
        throw new Error('Invalid pagination cursor');
      }
      pending = batch.items;
      cursor = batch.nextCursor;
    }
    const previousCount = items.length;
    let consumed = 0;
    while (consumed < pending.length && items.length < pageSize && rowsScanned < maxRows) {
      add(pending[consumed++]);
      rowsScanned++;
    }
    pending = pending.slice(consumed);
    if (items.length > previousCount) options.onProgress?.([...items]);
  }

  return {
    items,
    position: { pending, cursor },
    rowsScanned,
    hasMore: pending.length > 0 || cursor !== null,
  };
}
