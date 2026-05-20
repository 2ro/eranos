import type { NostrEvent } from '@nostrify/nostrify';

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

/** Keep the newest revision for each addressable `(kind, pubkey, d)` coordinate. */
export function dedupeAddressableLatest<T extends NostrEvent>(events: T[]): T[] {
  const latest = new Map<string, T>();
  for (const event of events) {
    const d = getTag(event.tags, 'd');
    if (!d) continue;
    const key = `${event.kind}:${event.pubkey}:${d}`;
    const prev = latest.get(key);
    if (!prev || event.created_at > prev.created_at) {
      latest.set(key, event);
    }
  }
  return [...latest.values()];
}
