#!/usr/bin/env node

/**
 * migrate-posts.mjs — one-shot event migration between relays.
 *
 * Fetches all events authored by the configured pubkeys from the SOURCE relay
 * and republishes the whitelisted kinds VERBATIM to the TARGET relay. Events
 * keep their original signatures — no re-signing, no key material needed.
 *
 * Idempotent by nature: relays deduplicate by event id, so re-running the
 * migration (or running it after a partial failure) is always safe.
 *
 * Default mode is a DRY RUN: connects to the source, fetches, prints a
 * per-kind per-author count table (including out-of-scope kinds that will be
 * skipped) and publishes nothing.
 *
 * Usage:
 *   node scripts/migrate-posts.mjs             # dry run (read-only)
 *   node scripts/migrate-posts.mjs --execute   # actually publish to target
 */

import { NRelay1 } from '@nostrify/nostrify';
import { nip19 } from 'nostr-tools';

// ─── Config ───────────────────────────────────────────────────────────────────

const SOURCE_RELAY = 'wss://nrelay.us-ea.st/';
const TARGET_RELAY = 'wss://relay.floonet.dev/';

/** Authors to migrate (npub form; decoded to hex below). */
const AUTHOR_NPUBS = [
  'npub15gsytqvs5c78u83yv2agl4twjkk6qgem7gtwe2agu7s90tkelxys0xxely',
  'npub12tuz8sva4r832xh2axwt0myf33ygpnc9huvzhxe8y6jkvq2f3l2s9ye4k7',
  'npub1m049skfequeelxy032555eg7w47ff7qvzfc2cahym7xkrsgvmtqsnm9ny6',
];

/**
 * Kinds to migrate. Anything else found on the source is reported but skipped
 * — the target relay's write policy whitelist rejects unknown kinds anyway.
 */
const MIGRATE_KINDS = [0, 1, 3, 7, 10002, 30023];

/** Page size for source pagination (stay under typical relay limit caps). */
const PAGE_LIMIT = 500;

/** Per-query timeout (ms). */
const QUERY_TIMEOUT = 15_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function npubToHex(npub) {
  const decoded = nip19.decode(npub);
  if (decoded.type !== 'npub') {
    throw new Error(`Not an npub: ${npub}`);
  }
  return decoded.data;
}

function shortNpub(npub) {
  return `${npub.slice(0, 12)}…${npub.slice(-6)}`;
}

/**
 * Fetch ALL events authored by `authors` from `relay`, paginating with
 * `until`. No kinds filter — we want the full picture so out-of-scope kinds
 * can be reported. Uses an inclusive `until` (the oldest seen timestamp) and
 * dedupes by id, so same-second events at page boundaries are not dropped;
 * the loop stops when a page yields no new ids.
 */
async function fetchAllByAuthors(relay, authors) {
  const events = new Map(); // id -> event
  let until = undefined;

  for (;;) {
    const filter = { authors, limit: PAGE_LIMIT };
    if (until !== undefined) filter.until = until;

    const page = await relay.query([filter], {
      signal: AbortSignal.timeout(QUERY_TIMEOUT),
    });
    if (page.length === 0) break;

    let newCount = 0;
    let oldest = Infinity;
    for (const evt of page) {
      if (evt.created_at < oldest) oldest = evt.created_at;
      if (!events.has(evt.id)) {
        events.set(evt.id, evt);
        newCount++;
      }
    }

    process.stderr.write(
      `  fetched page: ${page.length} events (${newCount} new, total ${events.size})\n`,
    );

    if (newCount === 0) break; // page was entirely duplicates — done
    until = oldest; // inclusive; dedupe handles the overlap
  }

  return [...events.values()];
}

/** Print a per-kind (rows) per-author (columns) count table. */
function printCountTable(events, authorsHex, npubs) {
  const kinds = [...new Set(events.map((e) => e.kind))].sort((a, b) => a - b);
  const colHeads = npubs.map(shortNpub);

  const counts = new Map(); // `${kind}:${pubkey}` -> n
  for (const evt of events) {
    const key = `${evt.kind}:${evt.pubkey}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const kindCol = 8;
  const scopeCol = 9;
  const cols = colHeads.map((h) => h.length + 2);

  const pad = (s, w) => String(s).padStart(w);
  const header =
    pad('kind', kindCol) +
    pad('scope', scopeCol) +
    colHeads.map((h, i) => pad(h, cols[i])).join('') +
    pad('total', 8);
  console.log(header);
  console.log('-'.repeat(header.length));

  let grandTotal = 0;
  let migrateTotal = 0;
  for (const kind of kinds) {
    const inScope = MIGRATE_KINDS.includes(kind);
    let rowTotal = 0;
    const cells = authorsHex.map((pk, i) => {
      const n = counts.get(`${kind}:${pk}`) ?? 0;
      rowTotal += n;
      return pad(n, cols[i]);
    });
    grandTotal += rowTotal;
    if (inScope) migrateTotal += rowTotal;
    console.log(
      pad(kind, kindCol) +
        pad(inScope ? 'migrate' : 'SKIP', scopeCol) +
        cells.join('') +
        pad(rowTotal, 8),
    );
  }
  console.log('-'.repeat(header.length));
  console.log(
    pad('all', kindCol) +
      pad('', scopeCol) +
      authorsHex
        .map((pk, i) =>
          pad(events.filter((e) => e.pubkey === pk).length, cols[i]),
        )
        .join('') +
      pad(grandTotal, 8),
  );
  console.log(
    `\nTotal on source: ${grandTotal}  |  to migrate: ${migrateTotal}  |  skipped (out-of-scope kinds): ${grandTotal - migrateTotal}`,
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const execute = process.argv.includes('--execute');

  const authorsHex = AUTHOR_NPUBS.map(npubToHex);

  console.log(`Source relay: ${SOURCE_RELAY}`);
  console.log(`Target relay: ${TARGET_RELAY}`);
  console.log(`Mode:         ${execute ? 'EXECUTE (publishing to target)' : 'dry run (read-only)'}`);
  console.log(`Kinds:        ${MIGRATE_KINDS.join(', ')}`);
  console.log('Authors:');
  for (const npub of AUTHOR_NPUBS) console.log(`  ${npub}`);
  console.log('');

  const source = new NRelay1(SOURCE_RELAY);

  console.log('Fetching all events by the configured authors from the source…');
  const all = await fetchAllByAuthors(source, authorsHex);
  console.log('');

  printCountTable(all, authorsHex, AUTHOR_NPUBS);

  const toMigrate = all
    .filter((e) => MIGRATE_KINDS.includes(e.kind))
    // Oldest first: replaceable kinds (0, 3, 10002, 30023) land in
    // chronological order so the newest version wins on the target.
    .sort((a, b) => a.created_at - b.created_at);

  if (!execute) {
    console.log('\nDry run — nothing published. Re-run with --execute to migrate.');
    await source.close();
    return;
  }

  console.log(`\nPublishing ${toMigrate.length} events to ${TARGET_RELAY} …\n`);
  const target = new NRelay1(TARGET_RELAY);

  let ok = 0;
  let blocked = 0;
  for (const evt of toMigrate) {
    const label = `kind ${String(evt.kind).padStart(5)}  ${evt.id.slice(0, 12)}…  (${new Date(evt.created_at * 1000).toISOString()})`;
    try {
      // Republish verbatim — original id + signature remain valid.
      await target.event(evt, { signal: AbortSignal.timeout(QUERY_TIMEOUT) });
      ok++;
      console.log(`OK       ${label}`);
    } catch (err) {
      // The target has a write policy; blocked/rejected responses MUST be
      // visible, never swallowed.
      blocked++;
      const reason = err instanceof Error ? err.message : String(err);
      console.log(`BLOCKED  ${label}  — ${reason}`);
    }
  }

  console.log(`\nSummary: ${ok} accepted, ${blocked} blocked/rejected, of ${toMigrate.length} attempted.`);
  if (blocked > 0) process.exitCode = 1;

  await source.close();
  await target.close();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
