import type {
  NostrEvent,
  NostrFilter,
  NostrRelayCLOSED,
  NostrRelayEOSE,
  NostrRelayEVENT,
  NRelay,
} from '@nostrify/types';

const eventRelaySources = new Map<string, string>();
const addressRelaySources = new Map<string, string>();
const raceWinners = new Map<string, string>();

function summarizeFilters(filters: NostrFilter[]): string {
  return filters.map((filter) => {
    const parts: string[] = [];
    if (filter.kinds) parts.push(`kinds:${filter.kinds.join(',')}`);
    if (filter.authors) parts.push(`authors:${filter.authors.length}`);
    if (filter.ids) parts.push(`ids:${filter.ids.length}`);
    if (filter.limit) parts.push(`limit:${filter.limit}`);
    if (filter.since) parts.push(`since:${filter.since}`);
    if (filter.until) parts.push(`until:${filter.until}`);
    if (filter.search) parts.push(`search:${filter.search}`);

    for (const [key, value] of Object.entries(filter)) {
      if (!key.startsWith('#')) continue;
      if (Array.isArray(value)) parts.push(`${key}:${value.length}`);
    }

    return parts.join(' ') || 'empty-filter';
  }).join(' | ');
}

function raceKey(filters: NostrFilter[]): string {
  return JSON.stringify(filters);
}

export function getEventRelaySource(eventId: string): string | undefined {
  return eventRelaySources.get(eventId);
}

export function getAddressRelaySource(address: string): string | undefined {
  return addressRelaySources.get(address);
}

function getAddress(event: NostrEvent): string | undefined {
  if (event.kind < 30000 || event.kind >= 40000) return undefined;
  const d = event.tags.find(([name]) => name === 'd')?.[1];
  if (!d) return undefined;
  return `${event.kind}:${event.pubkey}:${d}`;
}

function recordRelaySource(event: NostrEvent, relay: string): void {
  if (!eventRelaySources.has(event.id)) {
    eventRelaySources.set(event.id, relay);
  }

  const address = getAddress(event);
  if (address && !addressRelaySources.has(address)) {
    addressRelaySources.set(address, relay);
  }
}

export class DebugRelay implements NRelay {
  constructor(
    private readonly url: string,
    private readonly relay: NRelay,
  ) {}

  async *req(
    filters: NostrFilter[],
    opts?: { signal?: AbortSignal },
  ): AsyncIterable<NostrRelayEVENT | NostrRelayEOSE | NostrRelayCLOSED> {
    const startedAt = performance.now();
    const summary = summarizeFilters(filters);
    const key = raceKey(filters);
    let eventCount = 0;
    let loggedFirstEvent = false;

    console.debug('[nostr relay req:start]', { relay: this.url, filters: summary });

    for await (const msg of this.relay.req(filters, opts)) {
      const elapsedMs = Math.round(performance.now() - startedAt);

      if (msg[0] === 'EVENT') {
        const event = msg[2];
        eventCount += 1;
        recordRelaySource(event, this.url);
        if (!loggedFirstEvent) {
          loggedFirstEvent = true;
          console.info('[nostr relay race:first-event]', {
            relay: this.url,
            elapsedMs,
            kind: event.kind,
            id: event.id,
            filters: summary,
          });
        }
      }

      if (msg[0] === 'EOSE') {
        if (!raceWinners.has(key)) {
          raceWinners.set(key, this.url);
          console.info('[nostr relay race:first-eose]', {
            relay: this.url,
            elapsedMs,
            eventCount,
            filters: summary,
          });
        } else {
          console.debug('[nostr relay req:eose]', {
            relay: this.url,
            elapsedMs,
            eventCount,
            winner: raceWinners.get(key),
            filters: summary,
          });
        }
      }

      if (msg[0] === 'CLOSED') {
        console.debug('[nostr relay req:closed]', {
          relay: this.url,
          elapsedMs,
          eventCount,
          filters: summary,
          message: msg[2],
        });
      }

      yield msg;
    }
  }

  async query(filters: NostrFilter[], opts?: { signal?: AbortSignal }): Promise<NostrEvent[]> {
    const startedAt = performance.now();
    const events = await this.relay.query(filters, opts);
    for (const event of events) {
      recordRelaySource(event, this.url);
    }
    console.info('[nostr relay query]', {
      relay: this.url,
      elapsedMs: Math.round(performance.now() - startedAt),
      eventCount: events.length,
      filters: summarizeFilters(filters),
    });
    return events;
  }

  event(event: NostrEvent, opts?: { signal?: AbortSignal }): Promise<void> {
    console.info('[nostr relay publish]', { relay: this.url, kind: event.kind, id: event.id });
    return this.relay.event(event, opts);
  }

  close(): Promise<void> {
    return this.relay.close();
  }
}
