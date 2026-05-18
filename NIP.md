# NIP: Custom Event Kinds

## Event Kinds Overview

### Ditto Kinds

| Kind  | Name                 | Description                                           |
|-------|----------------------|-------------------------------------------------------|
| 16769 | Profile Tabs         | The user's custom profile page tabs (one per user)    |

### Agora Kinds

| Kind  | Name                       | Description                                                    |
|-------|----------------------------|----------------------------------------------------------------|
| 30223 | Campaign                   | Fundraising campaign with a list of on-chain Bitcoin recipients |
| 30385 | Community Stats Snapshot   | Pre-computed per-country / global community leaderboards       |
| 36639 | Activist Action            | Country-scoped activist challenge with a sats bounty           |

### Agora Protocols

| Protocol                 | Composed Kinds                          | Description                                                     |
|--------------------------|-----------------------------------------|-----------------------------------------------------------------|
| Flat Communities | 34550, 30009, 8, 1111, 1984 | One-level badge membership with explicit moderators (NIP-72 ext) |
| Community Chat | 34550, 1311 | Realtime member chat scoped to a NIP-72 community |

### Community Chat

Agora uses NIP-53 live chat messages (`kind:1311`) for realtime chat inside a NIP-72 community. Messages are scoped directly to the community definition's address using an `a` tag:

```json
{
  "kind": 1311,
  "content": "Hello community!",
  "tags": [
    ["a", "34550:<community-author-pubkey>:<community-d-tag>", "", "root"]
  ]
}
```

Clients SHOULD query community chat with `{ "kinds": [1311], "#a": ["34550:<pubkey>:<d-tag>"] }`. Agora treats sending as members-only at the UI layer and applies the same community moderation overlay used for community posts.

### Community Kinds

These event kinds were created by community contributors and are supported by Ditto. Full specifications are maintained by their respective authors.

| Kind  | Name                   | Description                                                      | Spec                                                                                      |
|-------|------------------------|------------------------------------------------------------------|-------------------------------------------------------------------------------------------|
| 2473  | Bird Detection         | Bird-by-ear observation log (species heard in the wild)          | [NIP](https://gitlab.com/alexgleason/birdstar/-/blob/main/NIP.md)                         |
| 12473 | Birdex                 | Author's cumulative life list of confirmed bird species          | [NIP](https://gitlab.com/alexgleason/birdstar/-/blob/main/NIP.md)                         |
| 3367  | Color Moment           | Color palette post expressing a mood                             | [NIP](https://gitlab.com/chad.curtis/espy/-/blob/main/NIP.md)                            |
| 4223  | Weather Reading        | Sensor readings from a weather station                           | [Draft NIP](https://github.com/nostr-protocol/nips/pull/2163)                            |
| 7516  | Found Log              | Log entry recording a user finding a geocache                    | [NIP-GC](https://gitlab.com/chad.curtis/treasures/-/blob/main/NIP-GC.md)                 |
| 8211  | Encrypted Letter       | Encrypted personal letter with visual stationery                 | [NIP](https://gitlab.com/chad.curtis/lief/-/blob/main/NIP.md)                            |
| 16158 | Weather Station        | Weather station metadata (location, sensors, connectivity)       | [Draft NIP](https://github.com/nostr-protocol/nips/pull/2163)                            |
| 37516 | Geocache               | Geocache listing for real-world treasure hunting                 | [NIP-GC](https://gitlab.com/chad.curtis/treasures/-/blob/main/NIP-GC.md)                 |
| 36787 | Music Track            | Addressable event for a music audio file with metadata           | See [Music Tracks & Playlists](#music-tracks--playlists) below                            |
| 34139 | Music Playlist         | Ordered list of music track references (also used for albums)    | See [Music Tracks & Playlists](#music-tracks--playlists) below                            |
| 30621 | Custom Constellation   | User-drawn star figure with Hipparcos-numbered edges             | [NIP](https://gitlab.com/alexgleason/birdstar/-/blob/main/NIP.md)                         |

---

## Kind 8333: Onchain Zap

### Summary

Regular event kind that records a **Bitcoin on-chain payment** ("onchain zap") sent in appreciation of a Nostr event or profile. Functions as the on-chain analogue of NIP-57 zap receipts (kind 9735), but without the LNURL round-trip: the event is self-attested by the sender and references a real Bitcoin transaction that clients can verify directly on-chain.

The kind number mirrors the convention of NIP-57: kind **9735** is the Lightning P2P port (per BOLT spec), and kind **8333** is the Bitcoin mainnet P2P port — a natural semantic pairing for Lightning vs. on-chain settlement.

Because every Nostr keypair deterministically maps to a Bitcoin Taproot (P2TR) address (both use 32-byte x-only secp256k1 keys, per BIP-340/BIP-341), an on-chain zap is simply a Bitcoin transaction whose output pays the recipient's derived Taproot address. The kind 8333 event links that transaction to the Nostr event or profile being zapped.

### Event Structure

```json
{
  "kind": 8333,
  "pubkey": "<sender-pubkey>",
  "content": "Great post!",
  "tags": [
    ["e", "<target-event-id>", "<relay-hint>"],
    ["p", "<target-pubkey>"],
    ["i", "bitcoin:tx:<txid>"],
    ["amount", "<sats>"],
    ["alt", "On-chain zap: 25000 sats"]
  ]
}
```

### Content

The `content` field is a human-readable comment from the sender (may be empty). It is NOT a zap request JSON (unlike NIP-57 kind 9735).

### Tags

| Tag      | Required | Description                                                                                  |
|----------|----------|----------------------------------------------------------------------------------------------|
| `i`      | Yes      | NIP-73 external content identifier. MUST be `bitcoin:tx:<txid>` where `<txid>` is a 64-char lowercase hex Bitcoin transaction ID. |
| `p`      | Yes      | 32-byte hex pubkey of the zap **recipient** (the author being paid).                         |
| `amount` | Yes      | Amount paid to the recipient in **satoshis** (decimal integer). This is the sum of outputs in the tx that paid the recipient's derived Taproot address — *not* the total tx value. |
| `e`      | If zapping an event | 32-byte hex ID of the event being zapped. Include a relay hint as the 3rd element where possible. |
| `a`      | If zapping an addressable event | Addressable event coordinate `<kind>:<pubkey>:<d-tag>`. Used instead of (or alongside) `e` for kinds 30000–39999. |
| `alt`    | Yes      | NIP-31 human-readable fallback.                                                              |

If neither `e` nor `a` is present, the zap targets the recipient's **profile** (i.e. a tip to the pubkey, not to a specific event).

### Publishing Flow

1. Sender builds a Bitcoin transaction paying the recipient's derived Taproot address (`nostrPubkeyToBitcoinAddress(recipientPubkey)`).
2. Sender broadcasts the transaction to the Bitcoin network and obtains the `txid`.
3. Sender signs and publishes a kind 8333 event referencing that `txid` with the appropriate `e`/`a`/`p` tags.
4. The event is published **after** broadcast; the txid is already final at that point.

### Batch / Community Zaps

A single Bitcoin transaction MAY pay multiple recipients by including one output per recipient. Clients SHOULD still publish **one kind 8333 event per recipient**, all referencing the same `i` tag (`bitcoin:tx:<txid>`) but each with its own `p` tag and `amount` tag.

For community-level zaps, clients MAY include the community addressable coordinate in an `a` tag and the community kind in a `K` tag:

```json
[
  ["i", "bitcoin:tx:<txid>"],
  ["p", "<recipient-pubkey>"],
  ["amount", "1000"],
  ["a", "34550:<community-author>:<community-d-tag>"],
  ["K", "34550"],
  ["alt", "Bitcoin zap: 1000 sats"]
]
```

The `amount` tag is the amount paid to that event's `p` recipient only. It MUST NOT be the total value of the batch transaction.

### Client Behavior

**Querying onchain zaps for an event:**

```json
{ "kinds": [8333], "#e": ["<target-event-id>"], "limit": 100 }
```

For addressable events, use `"#a": ["<kind>:<pubkey>:<d-tag>"]` instead. For profile-level zaps, use `"#p": ["<pubkey>"]`.

**Verification (REQUIRED before trusting amounts):**

Clients MUST verify a kind 8333 event on-chain before counting it toward a zap total or displaying its amount. The `amount` tag is self-reported by the sender and would otherwise be trivially spoofable. To verify:

1. Extract the txid from the `i` tag.
2. Fetch the transaction from a Bitcoin data source (e.g. a mempool.space-compatible Esplora API).
3. Derive the recipient's expected Taproot address from the `p` tag pubkey.
4. Sum the values of all outputs in the transaction that pay that address. This is the **verified amount**. Change outputs paying back to the **sender's** derived Taproot address MUST NOT be counted toward the verified amount — only outputs to the recipient.
5. If the verified amount is 0, the event SHOULD be discarded.
6. If the sender's `amount` tag exceeds the verified amount, clients MAY discard the event or MAY display the smaller verified amount (capping). Clients MUST NOT display or count the claimed amount when it exceeds the verified amount.
7. Unconfirmed transactions MAY be displayed as pending; clients MAY require confirmation before counting them toward public totals. Because unconfirmed transactions can be evicted (RBF, double-spend), clients SHOULD either exclude them from aggregate zap totals or clearly label them as pending.

**Sender/recipient identity:** Clients SHOULD reject events where the sender's pubkey (`event.pubkey`) equals the recipient pubkey from the `p` tag. Self-zaps are trivial to fabricate (the sender already controls the destination address) and contribute nothing meaningful to zap totals.

**Deduplication:** Clients SHOULD deduplicate events that reference the same `txid` (an attacker could publish many events pointing at one real transaction). One kind 8333 event per (txid, target) pair is canonical — when multiple events reference the same `txid` for the same target, the earliest is preferred.

**Network scope:** This specification applies to Bitcoin **mainnet** only. Testnet, signet, and other networks are out of scope; addresses and txids on those networks MUST NOT be used in kind 8333 events.

### Comparison with NIP-57 (Lightning Zaps)

| Aspect | NIP-57 (kind 9735) | This spec (kind 8333) |
|--------|---------------------|------------------------|
| Settlement | Lightning Network | Bitcoin L1 |
| Invoice / payment | LNURL + BOLT-11 invoice | Raw Bitcoin tx |
| Event issuer | Recipient's LNURL provider | Sender |
| Availability | Requires `lud06`/`lud16` on recipient profile | Always available (every Nostr pubkey has a derived Taproot addr) |
| Verification | Recipient zap-provider pubkey + bolt11 amount | On-chain tx verified against derived recipient address |
| Finality | Instant | Confirms in ~10 min (mempool first) |
| Fees | Sub-satoshi typical | Significant at low amounts |

The two zap kinds are complementary. Clients SHOULD sum verified amounts from both kinds when displaying total zap stats for a post or profile.

---

## Kind 30223: Campaign

### Summary

Addressable event representing a **fundraising campaign**. A campaign carries the marketing-style metadata you would expect on GoFundMe, Kickstarter, or GiveSendGo (title, summary, cover image, story, category, goal, optional deadline, and recommended country), and — most importantly — a list of recipient pubkeys (`p` tags) that share the proceeds of any donation.

Donations are sent as a **single Bitcoin on-chain transaction** with one output per recipient. The donor's wallet derives each recipient's Taproot address from their pubkey via BIP-340/BIP-341 (the same scheme used by kind 8333 onchain zaps), so the campaign event itself does not need to carry Bitcoin addresses. After broadcasting the funding tx, the donor's client publishes one kind 8333 event per recipient, all referencing the same `txid` and tagging the campaign via `a` / `K`, so the donation shows up in the campaign's totals and in each recipient's profile zap history.

The kind is addressable so the creator can edit the story, image, goal, deadline, and recipient list over the life of the campaign without minting new identifiers. The `d` tag is the campaign's slug.

### Event Structure

```json
{
  "kind": 30223,
  "pubkey": "<creator-pubkey>",
  "content": "<markdown story>",
  "tags": [
    ["d", "save-the-bookstore"],
    ["title", "Save the Last Bookstore"],
    ["summary", "Help our 40-year-old neighborhood bookstore make rent through winter."],
    ["image", "https://example.com/cover.jpg"],
    ["t", "human-rights"],
    ["t", "legal-defense"],
    ["goal", "10000000"],
    ["deadline", "1735689600"],
    ["i", "iso3166:VE"],
    ["k", "iso3166"],
    ["p", "<recipient-1-hex-pubkey>", "wss://relay.example", "2"],
    ["p", "<recipient-2-hex-pubkey>", "wss://relay.example", "1"],
    ["p", "<recipient-3-hex-pubkey>"],
    ["alt", "Fundraising campaign: Save the Last Bookstore"]
  ]
}
```

### Content

The `content` field is the **campaign story**, formatted as Markdown. Clients SHOULD render it with the same Markdown renderer they use for NIP-23 long-form content. Empty content is permitted (e.g. for a campaign that lives entirely in its summary).

### Tags

| Tag        | Required | Description                                                                                                                                                       |
|------------|----------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `d`        | Yes      | Campaign slug, unique per author. Forms the addressable coordinate `30223:<pubkey>:<d>`.                                                                          |
| `title`    | Yes      | Display title of the campaign (plain text, max ~200 chars).                                                                                                       |
| `summary`  | Recommended | Short one-paragraph tagline shown in feed cards and previews.                                                                                                  |
| `image`    | Recommended | HTTPS URL of the cover image (jpg/png/webp). Clients MUST sanitize and verify the URL before rendering.                                                       |
| `t`        | Recommended | Topic tag for discovery and filtering (e.g. `human-rights`, `legal-defense`, `independent-media`). Multiple `t` tags MAY be used. Clients SHOULD normalize user-entered tag labels by removing a leading `#`, lowercasing, and replacing whitespace with hyphens. |
| `goal`     | Recommended | Fundraising goal in **satoshis** (decimal integer). Omit if the campaign has no fixed goal.                                                                       |
| `deadline` | Optional | Unix timestamp (seconds) at which the campaign closes. After the deadline, clients SHOULD show the campaign as ended but MAY still accept donations.              |
| `i`        | Recommended | NIP-73 country identifier for sorting and discovery. SHOULD be `iso3166:<code>` with an uppercase ISO 3166-1 alpha-2 country code (e.g. `iso3166:VE`).              |
| `k`        | Recommended if `i` is present | NIP-73 external content kind. For country identifiers this SHOULD be `iso3166`.                                                        |
| `location` | Legacy | Human-readable location string used by older campaign events. New events SHOULD prefer `i` + `k` country tags. Clients MAY display this as a fallback only.          |
| `status`   | Optional | Lifecycle status. The only defined value is `archived`, which marks the campaign closed without deleting it. Other values SHOULD be ignored. See *Closing & archiving* below. |
| `p`        | Yes (≥1) | Recipient pubkey. The 2nd element is the hex pubkey; the 3rd (optional) is a relay hint; the 4th (optional) is a positive decimal **weight** for split allocation. |
| `alt`      | Recommended | NIP-31 human-readable fallback.                                                                                                                                   |

### Recipient Split Rules

When a donor sends an amount `T` in satoshis to a campaign:

1. Read all `p` tags from the campaign event.
2. Parse the weight of each `p` tag from the 4th element. If absent, malformed, or non-positive, the weight defaults to **1**.
3. Compute each recipient's share as `floor(T * weight_i / sum_of_weights)` satoshis.
4. Any remainder from rounding (at most N−1 sats) MAY be appended to the largest share or kept by the donor as change — clients SHOULD prefer appending the remainder to the largest share so the full amount reaches the campaign.
5. If any computed share is below the Bitcoin dust limit (546 sats for P2TR), the donor's client MUST refuse the donation and surface a minimum-amount error.

Equal splits are the default: omit the weight on every `p` tag, and all recipients receive `floor(T / N)` sats each.

### Donation Flow

1. Donor opens the campaign and chooses an amount in sats (preset or custom).
2. Donor's client computes per-recipient amounts using the split rules above.
3. Donor's client builds a **single PSBT** with one output per recipient (paying each recipient's derived Taproot address) plus a change output back to the donor.
4. Donor signs the PSBT with their Nostr key (Taproot key-path spend) and broadcasts the resulting transaction.
5. Donor's client publishes **one kind 8333 event per recipient**, all referencing the same `txid` in their `i` tag. Each kind 8333 event MUST include:

   ```json
   [
     ["i", "bitcoin:tx:<txid>"],
     ["p", "<recipient-pubkey>"],
     ["amount", "<sats-paid-to-that-recipient>"],
     ["a", "30223:<campaign-author-pubkey>:<campaign-d-tag>"],
     ["K", "30223"],
     ["alt", "Donation to <campaign-title>: <amount> sats"]
   ]
   ```

This mirrors the community batch-zap pattern documented in the kind 8333 section above, with the campaign's addressable coordinate replacing the community coordinate.

### Querying

**List campaigns (newest first):**

```json
{ "kinds": [30223], "limit": 50 }
```

**Filter by category:**

```json
{ "kinds": [30223], "#t": ["medical"], "limit": 50 }
```

**Fetch a specific campaign:**

```json
{ "kinds": [30223], "authors": ["<creator-pubkey>"], "#d": ["<slug>"], "limit": 1 }
```

**Aggregate donations for a campaign:**

```json
{ "kinds": [8333], "#a": ["30223:<creator-pubkey>:<slug>"], "limit": 500 }
```

Clients MUST verify each kind 8333 event on-chain before counting it toward the campaign total, per the verification rules in the kind 8333 section.

### Client Behavior

- **Recipient validity:** clients SHOULD reject `p` tag entries whose pubkey is not 64 hex characters and SHOULD ignore weights that are not positive finite decimals.
- **Dust protection:** when a donor enters an amount that would assign any recipient less than the dust limit, the client MUST block the donation and either suggest the minimum viable total or prompt the donor to remove recipients.
- **Editability:** the creator MAY republish the same `(kind, pubkey, d)` triple to update the campaign. Clients SHOULD keep `published_at` from the first publish on subsequent edits (NIP-23 convention).
- **Closing & archiving:** the creator MAY soft-close a campaign by republishing it with a `["status", "archived"]` tag. Clients SHOULD hide archived campaigns from discovery feeds and disable the donate flow, but MUST keep them reachable by direct link so existing donors can still find them and donation history is preserved. The creator can reopen the campaign by republishing without the status tag (or with any other status value). For a hard delete, the creator MAY publish a NIP-09 kind 5 deletion request referencing the campaign's `a` coordinate; clients SHOULD continue to render past donations against the campaign even after deletion.

---

## Kind 16769: Profile Tabs

### Summary

Replaceable event kind for publishing a user's custom profile page tabs. Exactly one event per user (no `d` tag). Each tab defines a Nostr filter (NIP-01) that clients execute to populate the tab's content.

Visitors who load a profile fetch this event to display the custom tabs alongside the standard Posts / Media / Likes / Wall tabs.

### Event Structure

```json
{
  "kind": 16769,
  "content": "",
  "tags": [
    ["var", "$follows", "p", "a:3:$me:"],
    ["tab", "Bitcoin Posts", "{\"kinds\":[1],\"authors\":[\"$me\"],\"search\":\"bitcoin\"}"],
    ["tab", "Feed", "{\"kinds\":[1,6],\"authors\":[\"$follows\"],\"limit\":40}"],
    ["alt", "Custom profile tabs"]
  ]
}
```

### Content

The `content` field is unused and MUST be an empty string (`""`).

### Tags

| Tag   | Format                                         | Description                                                    |
|-------|------------------------------------------------|----------------------------------------------------------------|
| `tab` | `["tab", "<label>", "<filterJSON>"]`           | One tag per custom tab. Order defines display order.           |
| `var` | `["var", "<$name>", "<tag>", "<pointer>"]`     | Variable definition. See [Variable Tags](#variable-tags).      |
| `alt` | `["alt", "Custom profile tabs"]`               | NIP-31 human-readable fallback. Required.                      |

### Tab Filter JSON

The third element of each `tab` tag is a JSON-encoded **NIP-01 filter object**, optionally extended with the NIP-50 `search` field. Variable placeholders (strings starting with `$`) may appear wherever a string value is expected.

```json
{
  "kinds": [1],
  "authors": ["$me"],
  "search": "bitcoin",
  "limit": 20
}
```

Supported filter fields: `ids`, `authors`, `kinds`, `#<tag>` (e.g. `#t`, `#e`, `#p`), `since`, `until`, `limit`, `search`.

### Variable Tags

Variable tags define named placeholders that are resolved before the filter is executed. Each `var` tag extracts tag values from a referenced Nostr event.

Format: `["var", "$name", "<tag-to-extract>", "<event-pointer>"]`

| Index | Description                                                                                      |
|-------|--------------------------------------------------------------------------------------------------|
| 0     | Tag name: `"var"`                                                                                |
| 1     | Variable name, starting with `$` (e.g. `"$follows"`)                                            |
| 2     | Tag name to extract values from in the referenced event (e.g. `"p"`)                             |
| 3     | Event pointer: `e:<event-id>` for a specific event, or `a:<kind>:<pubkey>:<d-tag>` for an addressable/replaceable event coordinate. Variables like `$me` may appear in the pubkey position. |

Example — extract follow list pubkeys:
```json
["var", "$follows", "p", "a:3:$me:"]
```

This means: fetch the kind 3 event authored by `$me`, extract all `p` tag values, and bind them to `$follows`.

### Reserved Variable: `$me`

The `$me` variable is the only runtime-provided variable. It resolves to the **profile owner's pubkey** (the author of the kind 16769 event). It does not require a `var` tag definition.

### Variable Resolution

When a variable appears in a filter field that expects an array (e.g. `authors`, `ids`, `#p`), the variable is **expanded in-place** (spliced into the array). Literal values may be mixed with variables.

```json
["tab", "Mixed", "{\"authors\":[\"$follows\",\"abc123...\"],\"kinds\":[1]}"]
```

After resolution (assuming `$follows` = `["pk1", "pk2"]`):
```json
{"authors": ["pk1", "pk2", "abc123..."], "kinds": [1]}
```

### Behavior

- To **add or update** tabs: publish a new kind 16769 event with all current `tab` and `var` tags.
- To **clear** all tabs: publish a kind 16769 event with no `tab` tags (only `alt`).
- Clients MUST filter by `authors: [pubkey]` when querying to prevent spoofing.
- `var` tags are shared across all `tab` tags in the same event.

---

## Kind 36639: Activist Action

### Summary

Addressable event kind for publishing **activist actions**. An action is a task — take a photo, make art, gather information, or take direct action — with an optional country scope, optional community scope, and an optional sats bounty paid out via NIP-57 zaps to the best **submissions**.

Submissions are **NIP-22 comments** (kind 1111) authored under the action's coordinate, ranked by zap totals. There is no separate submission kind; an earlier draft (kind 36640) was deprecated in favor of NIP-22 reuse.

### Trust model

Actions are user-generated. Anyone can publish a kind 36639 event, and Agora displays valid actions without platform-admin or country-organizer author filtering.

Community-scoped actions inherit the community's moderation context. Clients rendering a specific community SHOULD query by the community `A` tag and apply that community's moderation and membership filters.

### Event Structure

```json
{
  "kind": 36639,
  "content": "<long-form description, freeform markdown-ish text>",
  "tags": [
    ["d", "plant-a-tree-1729000000000"],
    ["title", "Plant a tree in your neighborhood"],
    ["challenge-type", "photo"],
    ["bounty", "10000"],
    ["i", "iso3166:US"],
    ["A", "34550:<community-pubkey>:<community-d-tag>"],
    ["K", "34550"],
    ["P", "<community-pubkey>"],
    ["t", "agora-action"],
    ["image", "https://example.com/cover.jpg"],
    ["start", "1729000000"],
    ["deadline", "1729604800"],
    ["alt", "Agora activist action: Plant a tree in your neighborhood"]
  ]
}
```

### Tags

| Tag              | Required | Description                                                                                              |
|------------------|----------|----------------------------------------------------------------------------------------------------------|
| `d`              | Yes      | Unique identifier (typically slug + timestamp). Forms the addressable coordinate `36639:<pubkey>:<d>`.   |
| `title`          | Yes      | Short title shown on cards.                                                                              |
| `challenge-type` | Yes      | One of `photo`, `art`, `info`, `action`. Drives the display icon and submission expectations.            |
| `bounty`         | Yes      | Bounty in **sats**, as an unsigned integer string. Paid out via zaps to the chosen submission(s).        |
| `i`              | No       | NIP-73 country identifier: `iso3166:XX` (preferred). Legacy `geo:XX` (length 6, country code only) is accepted as a read alias. Optionally combined with a `location` tag fallback. |
| `A`              | No       | Community root coordinate for community-scoped actions, e.g. `34550:<pubkey>:<d-tag>`.                 |
| `K`              | No       | Root kind hint for community-scoped actions. Use `34550` when `A` points to a NIP-72 community.         |
| `P`              | No       | Root author hint for community-scoped actions. Use the community definition author pubkey.              |
| `t`              | Yes      | Discovery tag. Canonical write value is `agora-action`. Read aliases: `pathos-challenge`, `agora-challenge`. |
| `image`          | No       | Cover image URL.                                                                                         |
| `start`          | No       | Unix timestamp when the action becomes active. Defaults to `created_at`.                                 |
| `deadline`       | No       | Unix timestamp when the action expires. Defaults to `start + 48h`.                                       |
| `alt`            | Yes      | NIP-31 human-readable fallback. Convention: `"Agora activist action: <title>"`.                          |

### Content

Long-form description of the action. Plain text or light markdown. Clients render this as the action's body on the detail page.

### Submissions

Submissions are kind 1111 NIP-22 comments addressed to the action's coordinate (`["A", "36639:<pubkey>:<d>"]` and `["P", "<pubkey>"]`). Clients SHOULD:

- Sort top-level submissions by **total zap amount** (sum of NIP-57 zap receipts on each submission), descending.
- Show the bounty as the prize pool that organizers can distribute to top submissions via zaps.
- Hide submissions with `created_at` after the action's `deadline` for "past" leaderboards (or surface them separately as "late submissions").

### Discovery

Clients querying actions globally:

```json
{ "kinds": [36639], "#t": ["agora-action", "pathos-challenge", "agora-challenge"], "limit": 50 }
```

Per country:

```json
{
  "kinds": [36639],
  "#t": ["agora-action", "pathos-challenge", "agora-challenge"],
  "#i": ["iso3166:US", "geo:US"],
  "limit": 50
}
```

Per community:

```json
{
  "kinds": [36639],
  "#A": ["34550:<community-pubkey>:<community-d-tag>"],
  "limit": 50
}
```

Country and community scopes are independent. A future action MAY include both `i` and `A`/`K`/`P` tags when both scopes are useful.

---

## Kind 30385: Community Stats Snapshot

### Summary

Addressable event kind for **pre-computed community statistics** (per-country and global). A trusted off-app indexer (the "stats bot") publishes one event per scope:

- **Per-country**: `d` tag is `iso3166:XX` (ISO 3166-1 alpha-2 country code).
- **Global**: `d` tag is `iso3166:ZZ` — `ZZ` is the ISO 3166-1 user-assigned code Agora uses for the cross-country aggregate.

Each event contains aggregate counts (comments, authors, zaps, submissions) and ranked leaderboards (top posters, trending hashtags, top zapped authors, top donors, top actions) across multiple time windows (`7d`, `30d`, `90d`, all-time). Storing pre-computed leaderboards in a single event lets clients render community pages without scanning thousands of underlying events.

### Trust model

Anyone can publish kind 30385, but clients MUST only consume events from trusted authors:

- **Per-country events**: trusted authors are platform admins (`src/lib/admins.ts`) **plus** appointed organizers for that specific country (kind 30078 `agora-organizers`).
- **Global event** (`iso3166:ZZ`): trusted authors are platform admins only.

When multiple trusted events exist for the same scope, clients pick the most recent by `created_at`.

### Event Structure

```json
{
  "kind": 30385,
  "content": "",
  "tags": [
    ["d", "iso3166:US"],

    ["comment_cnt", "12345"],
    ["comment_cnt_7d", "789"],
    ["comment_cnt_30d", "3421"],
    ["comment_cnt_90d", "9876"],
    ["author_cnt", "543"],
    ["zap_amount", "123456789"],
    ["zap_cnt", "1234"],
    ["submission_cnt", "456"],

    ["top_poster", "<pubkey-hex>", "987"],
    ["top_poster_7d", "<pubkey-hex>", "42"],

    ["trending_hashtag", "climate", "321"],
    ["trending_hashtag_7d", "protest", "67"],

    ["top_zapped", "<pubkey-hex>", "<totalSats>", "<postCount>", "<avgSats>", "<zapCount>"],
    ["top_donor", "<pubkey-hex>", "<totalSats>", "<zapCount>"],

    ["top_action", "36639:<pubkey>:<d-tag>", "Plant a tree", "<submissions>", "<bounty>", "<zapAmountSats>"]
  ]
}
```

### Tag families

All numeric values are unsigned integers serialised as base-10 strings.

#### Aggregate counts (one tag per metric per timeframe)

| Tag base name      | Meaning                                                |
|--------------------|--------------------------------------------------------|
| `comment_cnt`      | Number of NIP-22 comments in scope                     |
| `author_cnt`       | Distinct author pubkeys in scope                       |
| `zap_amount`       | Total zap amount in **sats**                           |
| `zap_cnt`          | Number of NIP-57 zap receipts                          |
| `submission_cnt`   | Submissions to activist actions (kind 36639)           |

Each is published as four tags: bare (`<base>`, all-time), `<base>_7d`, `<base>_30d`, `<base>_90d`.

#### Leaderboards (repeated; one tag per row, ordered by rank)

All-time variants use the bare tag name; windowed variants use the `_7d`, `_30d`, `_90d` suffixes.

| Tag base name        | Positional fields                                                                              |
|----------------------|-----------------------------------------------------------------------------------------------|
| `top_poster`         | `[name, pubkeyHex, count]`                                                                    |
| `trending_hashtag`   | `[name, hashtag, count]`                                                                      |
| `top_zapped`         | `[name, pubkeyHex, totalSats, postCount, avgSats, zapCount]` (`zapCount` optional, legacy)    |
| `top_donor`          | `[name, pubkeyHex, totalSats, zapCount]`                                                      |
| `top_action`         | `[name, "36639:<pubkey>:<d>", title, submissions, bounty, zapAmountSats]`                     |

Clients SHOULD parse defensively — accept missing trailing fields as `0` or omitted to maintain backwards compatibility as the schema evolves.

### Content

Empty string. All data lives in tags so relays can index/filter and clients don't need to parse JSON.

### Discovery

Per-country snapshot:

```json
{
  "kinds": [30385],
  "authors": [<admin and organizer pubkeys>],
  "#d": ["iso3166:US"],
  "limit": 10
}
```

Global snapshot:

```json
{
  "kinds": [30385],
  "authors": [<admin pubkeys>],
  "#d": ["iso3166:ZZ"],
  "limit": 10
}
```

After fetching, take the event with the highest `created_at` and parse it. Cache for ~1–2 minutes; the producer typically refreshes on a similar cadence.

---

## Flat Communities

Flat communities on Nostr, composed from existing event kinds. Communities have one membership badge, explicit moderators, and no recursive badge-chain authority.

This specification is intended to be a foundation for community-scoped features. A community is a kind `34550` root that other events can tag with uppercase `A`. Posts, events, polls, listings, and future content kinds can all participate in the same community model when they tag the community root and pass the membership and moderation rules below.

The initial implementation focuses on three foundation capabilities:

1. Viewing communities a user owns or belongs to.
2. Posting community-scoped discussion content.
3. Moderating community-scoped content and members within communities the viewer has authority over.

**No new event kinds are introduced.** The system composes:

- **Kind 34550** ([NIP-72](https://github.com/nostr-protocol/nips/blob/master/72.md)) -- Community Definition
- **Kind 30009** ([NIP-58](https://github.com/nostr-protocol/nips/blob/master/58.md)) -- Badge Definition
- **Kind 8** ([NIP-58](https://github.com/nostr-protocol/nips/blob/master/58.md)) -- Badge Award
- **Kind 1111** ([NIP-22](https://github.com/nostr-protocol/nips/blob/master/22.md)) -- Community Posts
- **Kind 1984** ([NIP-56](https://github.com/nostr-protocol/nips/blob/master/56.md)) -- Moderation
### Overview

A flat community consists of:

1. **One badge definition** (kind `30009`) that represents community membership.
2. A **community definition** (kind `34550`) referencing that member badge with the role marker `"member"`.
3. **Badge awards** (kind `8`) authored by the founder or current moderators, granting membership directly.
4. **Community-scoped content** (initially kind `1111`) tagged to the community root.
5. **Reports and bans** (kind `1984`) scoped to the community for content warnings, content removal, and member/non-member bans.

Parent, child, sister, and rank relationships are intentionally out of scope for the core permission model. Apps may build discovery or directory surfaces separately.

### Membership Derivation

Membership is sourced from the community definition and from validated kind `8` membership awards. This produces three populations:

- **Founder** -- the `pubkey` field on the kind `34550` event. One per community, immutable. Controls the community definition since only they can republish the addressable event.
- **Moderators** -- the `p` tags on the kind `34550` event with role `"moderator"` (matching [NIP-72](https://github.com/nostr-protocol/nips/blob/master/72.md)). Mutable by republishing the community definition.
- **Members** -- pubkeys named in `p` tags on kind `8` badge awards that reference the community's member badge and are authored by the founder or a current moderator.

The founder and moderators have no membership badge requirement. Their leadership status comes from the community definition itself. Members cannot grant membership to other members.

### Community Definition

A kind `34550` event defines the community, extending [NIP-72](https://github.com/nostr-protocol/nips/blob/master/72.md) with one badge `a` tag that identifies the member badge.

#### Tags

| Tag | Required | Description |
|-----|----------|-------------|
| `d` | Yes | Unique community identifier (UUID recommended). |
| `name` | Yes | Human-readable name. |
| `description` | No | Community description. |
| `image` | No | Image URL. |
| `a` | Yes (1) | Member badge definition reference with role marker `"member"`. |
| `p` | No | Moderator pubkeys. The 4th element SHOULD be `"moderator"`. |
| `relay` | No | Recommended relay URL for community content (per [NIP-72](https://github.com/nostr-protocol/nips/blob/master/72.md)). |
| `alt` | No | [NIP-31](https://github.com/nostr-protocol/nips/blob/master/31.md) description. |

#### Badge `a` Tag Format

```
["a", "30009:<pubkey>:<badge-d-tag>", "<relay-hint>", "member"]
```

The fourth element is a strict protocol marker, not a display label. Communities can still use the badge definition's `name`, `description`, and `image` tags for expressive member labels.

#### Example

```jsonc
{
  "kind": 34550,
  "pubkey": "<founder-pubkey>",
  "content": "",
  "tags": [
    ["d", "a1b2c3d4-e5f6-7890-abcd-ef1234567890"],
    ["name", "The Arbiter's Guard"],
    ["description", "Elite Halo 2 clan"],
    ["image", "https://example.com/clan-banner.jpg"],
    ["a", "30009:<founder-pubkey>:a1b2c3d4-...-member", "", "member"],
    ["p", "<co-moderator-pubkey>", "", "moderator"],
    ["relay", "wss://relay.example.com"],
    ["alt", "Community: The Arbiter's Guard"]
  ]
}
```

### Badge Definitions

The member badge is a standard [NIP-58](https://github.com/nostr-protocol/nips/blob/master/58.md) kind `30009` badge definition published by the founder. The badge definition SHOULD be published **before** the community definition that references it.

The `d` tag SHOULD use the format `<community-d-tag>-member` for global uniqueness.

```jsonc
{
  "kind": 30009,
  "pubkey": "<founder-pubkey>",
  "content": "",
  "tags": [
    ["d", "a1b2c3d4-...-member"],
    ["name", "Member"],
    ["description", "Member of The Arbiter's Guard"],
    ["image", "https://example.com/member-badge.png"],
    ["alt", "Badge definition: Member of The Arbiter's Guard"]
  ]
}
```

### Badge Awards

Membership is established through kind `8` badge awards ([NIP-58](https://github.com/nostr-protocol/nips/blob/master/58.md)). Each valid award grants membership directly.

A badge award is **valid** if and only if:

1. The `a` tag references the member badge listed in the community definition.
2. The award author is the founder or a moderator listed in the community definition currently being evaluated.
3. The award contains at least one `p` tag naming an awarded pubkey.

```jsonc
// Moderator awarding community membership
{
  "kind": 8,
  "pubkey": "<moderator-pubkey>",
  "content": "",
  "tags": [
    ["a", "30009:<founder-pubkey>:a1b2c3d4-...-member"],
    ["p", "<recipient-pubkey>"],
    ["alt", "Badge award: Staff in The Arbiter's Guard"]
  ]
}
```

### Membership Validation

Membership is resolved with indexed relay filters. There is no recursive authority graph.

#### Algorithm

1. Fetch the community definition using kind `34550`, the founder pubkey, and the community `d` tag.
2. Extract the founder pubkey, moderator pubkeys, and member badge coordinate.
3. Query awards: `{ kinds: [8], authors: [<founder>, ...<moderators>], #a: [<member-badge-coordinate>] }`.
4. Flatten `p` tags from matching awards.
5. The member set is the union of the founder, current moderators, and awarded pubkeys.
6. Resolve moderation and apply moderation overlays.

The `authors` filter is the primary membership-award trust boundary. Awards from non-founder, non-moderator pubkeys are not valid community membership awards.

### Community-Scoped Content

Community-scoped content is any event that tags the community definition with uppercase `A`. The foundation implementation starts with kind `1111` ([NIP-22](https://github.com/nostr-protocol/nips/blob/master/22.md)) posts, but the same moderation overlay applies to future community content kinds such as calendar events, polls, listings, or other domain-specific events.

Clients MAY offer a members-only view that filters community posts down to the resolved member set as an `authors` filter. Whether this is on by default, opt-in, or omitted entirely is a client UX choice -- the protocol makes no recommendation.

#### Community Post

Community discussion uses kind `1111` scoped to the community definition as the root event.

#### Top-Level Post

```jsonc
{
  "kind": 1111,
  "content": "Hello clan!",
  "tags": [
    ["A", "34550:<founder-pubkey>:<community-d-tag>", "<relay-hint>"],
    ["K", "34550"],
    ["P", "<founder-pubkey>", "<relay-hint>"],
    ["a", "34550:<founder-pubkey>:<community-d-tag>", "<relay-hint>"],
    ["k", "34550"],
    ["p", "<founder-pubkey>", "<relay-hint>"]
  ]
}
```

#### Reply

Replies keep the community as root scope and point to the parent comment:

```jsonc
{
  "kind": 1111,
  "content": "Great point!",
  "tags": [
    ["A", "34550:<founder-pubkey>:<community-d-tag>", "<relay-hint>"],
    ["K", "34550"],
    ["P", "<founder-pubkey>", "<relay-hint>"],
    ["e", "<parent-comment-id>", "<relay-hint>", "<parent-author-pubkey>"],
    ["k", "1111"],
    ["p", "<parent-author-pubkey>", "<relay-hint>"]
  ]
}
```

#### Querying

Clients MAY use the resolved member set as an `authors` filter for members-only views.

```jsonc
{
  "kinds": [1111],
  "#A": ["34550:<founder-pubkey>:<community-d-tag>"],
  "authors": ["<founder>", "<moderator>", "<member>"]
}
```

The moderation overlay is content-kind agnostic: a valid content ban or warning applies to the targeted event regardless of whether that event is a post, calendar event, poll, listing, or future supported kind.

### Moderation

Moderation uses kind `1984` ([NIP-56](https://github.com/nostr-protocol/nips/blob/master/56.md)) scoped to the community via the uppercase `A` tag. Moderation is derived state: clients first resolve trusted moderation actions from kind `1984`, then apply those actions to concrete community-scoped events.

There are two moderation event classes:

1. **Bans** -- authoritative actions that remove content or ban users. Identified by the presence of [NIP-32](https://github.com/nostr-protocol/nips/blob/master/32.md) label tags `["L", "moderation"]` and `["l", "ban", "moderation"]`.
2. **Reports** -- soft flags from any valid community member using standard [NIP-56](https://github.com/nostr-protocol/nips/blob/master/56.md) report types (`nudity`, `spam`, `profanity`, `illegal`, `malware`, `impersonation`, `other`). No `L`/`l` tags. Clients display a content warning that users must click through to reveal.

Kind `1984` events from **non-members** are ignored entirely within community context. Kind `1984` events from members who are themselves banned are also ignored after ban resolution; banned members cannot retain moderation or reporting authority.

#### Bans (Authoritative Moderation)

A ban is **authoritative** if and only if:

1. The event contains `["l", "ban", "moderation"]` and `["L", "moderation"]` tags.
2. The publisher is a validated community member.
3. The publisher is not themselves banned after ban resolution.
4. The publisher's authority covers the target:
   - founder/moderators may ban member and non-member authors/content;
   - members may ban only non-member authors/content.

Bans that fail any of these conditions MUST be ignored.

##### Content Ban

Ban a specific post by publishing kind `1984` with `e`, `p`, and `A` tags plus the `ban` label. The `e` and `p` tags use `"other"` as the NIP-56 report type since the action is administrative rather than categorical.

```jsonc
{
  "kind": 1984,
  "pubkey": "<moderator-pubkey>",
  "content": "Reason for removal",
  "tags": [
    ["e", "<offending-event-id>", "other"],
    ["p", "<offending-author-pubkey>", "other"],
    ["A", "34550:<founder-pubkey>:<community-d-tag>"],
    ["L", "moderation"],
    ["l", "ban", "moderation"]
  ]
}
```

Clients MUST omit the banned event from canonical community feeds entirely. The event is not displayed, blurred, or indicated in any way -- it is treated as if it does not exist.

The `e` and `p` tags are untrusted until matched against the actual target event. A content ban MUST only apply when the targeted event's `id` matches the ban's `e` tag and the targeted event's `pubkey` matches the ban's `p` tag. This prevents a malicious or mistaken report from hiding an event by pairing its event ID with a different target pubkey.

##### Member Ban

Ban an author by publishing kind `1984` with `p` and `A` tags only (no `e` tag) plus the `ban` label. Founder/moderator-authored bans may target members or non-members. Member-authored bans may target non-members only.

```jsonc
{
  "kind": 1984,
  "pubkey": "<moderator-pubkey>",
  "content": "Reason for ban",
  "tags": [
    ["p", "<banned-pubkey>", "other"],
    ["A", "34550:<founder-pubkey>:<community-d-tag>"],
    ["L", "moderation"],
    ["l", "ban", "moderation"]
  ]
}
```

Clients distinguish content bans (`e` + `p` + `A` + `ban` label) from member bans (`p` + `A` + `ban` label, no `e` tag).

#### Reports (Content Warnings)

Any **valid, non-banned community member** may report content by publishing kind `1984` with a standard NIP-56 report type on the `e` and `p` tags. Reports do NOT use `L`/`l` label tags.

```jsonc
{
  "kind": 1984,
  "pubkey": "<member-pubkey>",
  "content": "Additional context",
  "tags": [
    ["e", "<event-id>", "nudity"],
    ["p", "<author-pubkey>", "nudity"],
    ["A", "34550:<founder-pubkey>:<community-d-tag>"]
  ]
}
```

Clients SHOULD display reported content behind a content warning overlay that requires user interaction to reveal. The report type (e.g. `nudity`, `spam`) MAY be shown in the warning. Multiple reports on the same event reinforce the warning but do not automatically escalate to a ban.

Reports from non-members and banned members are ignored.

As with content bans, report warnings MUST only attach to content when the target event's `id` matches the report's `e` tag and the target event's `pubkey` matches the report's `p` tag.

#### Classification Summary

| `l` tag present? | `e` tag present? | Authority check | Result |
|---|---|---|---|
| `["l", "ban", "moderation"]` | Yes | Founder/moderator, or member targeting non-member content; `e`/`p` match target event | Content ban (omit event) |
| `["l", "ban", "moderation"]` | No | Founder/moderator, or member targeting non-member author | Author ban |
| No | Yes | Non-banned member; `e`/`p` match target event | Content warning |
| No | No | -- | Invalid (ignored) |
| Any | Any | Non-member | Ignored |
| Any | Any | Banned member | Ignored |

### Community Updates

Both kind `34550` and kind `30009` are addressable events. To change the member badge or update moderators, republish the community definition. Only the founder (event publisher) can republish the community definition. If a moderator is removed, their authored membership awards no longer count because they are excluded from the authorized awarder query.

### Discovery

**Communities founded by a user:**

```jsonc
{ "kinds": [34550], "authors": ["<user-pubkey>"] }
```

**Communities a user belongs to:**

1. `{ "kinds": [8], "#p": ["<user-pubkey>"] }`
2. Extract badge `a` tags from results.
3. `{ "kinds": [34550], "#a": ["30009:...", "..."] }`
4. Keep only communities whose `member` badge reference matches the award badge coordinate.

**Communities a user has bookmarked:**

Agora uses [NIP-51](https://github.com/nostr-protocol/nips/blob/master/51.md) kind `10004` ("Communities") to let users save communities they want quick access to without requiring membership. Bookmarked communities are surfaced in the "My Communities" view alongside founded and member-of communities.

1. `{ "kinds": [10004], "authors": ["<user-pubkey>"], "limit": 1 }`
2. Extract `a` tags whose value begins with `34550:` from the result.
3. For each coordinate `34550:<author-pubkey>:<d-tag>`, query the community definition with both `authors` and `#d` filters to prevent spoofing:

   ```jsonc
   { "kinds": [34550], "authors": ["<author-pubkey>"], "#d": ["<d-tag>"], "limit": 1 }
   ```

Clients toggling a bookmark MUST perform a read-modify-write cycle on the replaceable kind `10004` event: fetch the freshest version from relays, add or remove the matching `["a", "34550:<pubkey>:<d-tag>"]` tag, and republish the full tag list. Appending new entries to the end preserves chronological bookmark order per NIP-51.

When the same community appears in multiple discovery sources, clients SHOULD display a single card but MAY indicate all applicable relationships (e.g. a member who has also bookmarked a community).

### Security Considerations

- **Author filtering**: Clients MUST filter community definitions by `authors` to prevent impersonation.
- **Award author filtering is required**: Query member badge awards with `authors: [founder, ...moderators]`.
- **Badge d-tag uniqueness**: Use `<community-d-tag>-member` to prevent cross-community collisions.
- **Badge acceptance is cosmetic**: NIP-58 kind `10008`/`30008` events have no effect on community membership.

### Dependencies

- [NIP-22](https://github.com/nostr-protocol/nips/blob/master/22.md) -- Comment
- [NIP-31](https://github.com/nostr-protocol/nips/blob/master/31.md) -- Unknown Event Kinds (`alt` tag)
- [NIP-32](https://github.com/nostr-protocol/nips/blob/master/32.md) -- Labeling (moderation `ban` label)
- [NIP-51](https://github.com/nostr-protocol/nips/blob/master/51.md) -- Lists (kind `10004` Communities list for bookmarks)
- [NIP-56](https://github.com/nostr-protocol/nips/blob/master/56.md) -- Reporting
- [NIP-58](https://github.com/nostr-protocol/nips/blob/master/58.md) -- Badges
- [NIP-72](https://github.com/nostr-protocol/nips/blob/master/72.md) -- Moderated Communities

---

## Community Fundraising Goals (NIP-75)

### Summary

Communities can host fundraising campaigns using [NIP-75 Zap Goals](https://github.com/nostr-protocol/nips/blob/master/75.md) (kind `9041`). A zap goal linked to a community allows members and supporters to contribute sats toward a shared target.

### Linking Goals to Communities

A zap goal is linked to a community by including an `a` tag pointing to the community's kind `34550` definition:

```json
{
  "kind": 9041,
  "content": "Community meetup travel fund",
  "tags": [
    ["amount", "500000000"],
    ["relays", "wss://relay.ditto.pub", "wss://relay.primal.net"],
    ["a", "34550:<community-author-pubkey>:<community-d-identifier>"],
    ["alt", "Zap goal: Community meetup travel fund"],
    ["summary", "Help fund travel for our annual meetup"],
    ["image", "https://example.com/meetup.jpg"],
    ["closed_at", "1735689600"]
  ]
}
```

### Required Tags (per NIP-75)

- `amount` -- Target amount in millisatoshis
- `relays` -- Relay URLs where zaps should be sent and tallied from

### Optional Tags (per NIP-75)

- `closed_at` -- Unix timestamp deadline; zap receipts after this time are excluded from the tally
- `image` -- Image URL for the goal
- `summary` -- Brief description

### Additional Tags (Agora-specific)

- `a` -- Community link (`34550:<pubkey>:<d-tag>`) scoping the goal to a community
- `alt` -- NIP-31 human-readable description

### Querying

Community goals are queried by filtering on the `a` tag:

```
{ "kinds": [9041], "#a": ["34550:<pubkey>:<d-tag>"], "limit": 50 }
```

### Progress Tallying

Goal progress is calculated from kind `9735` zap receipts targeting the goal event:

```
{ "kinds": [9735], "#e": ["<goal-event-id>"], "limit": 500 }
```

Receipts with `created_at` after the `closed_at` deadline (if set) are excluded from the tally.

### Access Control

Anyone may create a zap goal linked to a community. The existing community members-only feed filter controls whether non-member goals are displayed. Anyone may zap a goal.

### Dependencies

- [NIP-57](https://github.com/nostr-protocol/nips/blob/master/57.md) -- Lightning Zaps
- [NIP-72](https://github.com/nostr-protocol/nips/blob/master/72.md) -- Moderated Communities
- [NIP-75](https://github.com/nostr-protocol/nips/blob/master/75.md) -- Zap Goals

---

## Kind 0 Extension: Avatar Shape

### Summary

An optional `shape` property on kind 0 (profile metadata) that controls how the user's avatar is masked/clipped when displayed. The value is an emoji character whose silhouette is used as a mask over the avatar image. When absent, the avatar renders as the standard circle.

### Metadata Field

The `shape` field is added to the JSON content of a kind 0 event alongside standard fields like `name`, `picture`, etc. Its value is a single emoji character (including multi-codepoint emoji such as flags, ZWJ sequences, and skin-tone variants).

```json
{
  "kind": 0,
  "content": "{\"name\":\"Luna\",\"picture\":\"https://example.com/luna.jpg\",\"shape\":\"🌙\"}"
}
```

### Client Behavior

- When `shape` is absent, clients SHOULD render the avatar as a circle (the current universal default).
- When `shape` is a valid emoji, clients SHOULD use the emoji's silhouette as an alpha mask over the avatar image. The specific rendering technique is platform-dependent (see below).
- When `shape` is set to an unrecognized or invalid value, clients MUST fall back to a circle. This ensures forward compatibility.
- The `shape` field is purely cosmetic and has no protocol-level significance.
- Clients MAY choose not to support this extension, in which case avatars render as circles as usual.

---

## Community NIP Specifications

The following specifications are maintained by their respective authors. Ditto implements these kinds but does not own the specs. See each link for the full event structure, tags, and client behavior.

### Color Moments (Kind 3367)

**Author:** Chad Curtis
**Spec:** https://gitlab.com/chad.curtis/espy/-/blob/main/NIP.md
**App:** https://espy.you

Color palette posts capturing 3-6 colors from a beautiful moment, optionally accompanied by an emoji and layout preference. Supports horizontal, vertical, grid, star, checkerboard, and diagonal stripe layouts. A form of pre-verbal visual communication through color and emotion.

### Birdstar (Kinds 2473, 12473, 30621)

**Author:** Alex Gleason
**Spec:** https://gitlab.com/alexgleason/birdstar/-/blob/main/NIP.md
**App:** https://birdstar.app

Birdstar merges Birdsong Spotter (a bird-by-ear checklist) and Starpoint (an interactive sky map with community constellations) into a single client.

- **Kind 2473 — Bird Detection.** A regular event representing a single identified bird observation. The species is identified by a NIP-73 `i`/`k` pair pointing at the species' Wikidata entity URI (e.g. `https://www.wikidata.org/entity/Q26825` for the American Robin). The `content` field holds an optional freeform human note about the detection. Required tags: NIP-31 `alt`, NIP-73 `i` (Wikidata URL) + `k` (`web`). Ditto renders detections as a species card with the Wikipedia thumbnail, common/scientific name, and article summary.
- **Kind 12473 — Birdex.** A replaceable event (one per author) indexing every distinct species the author has ever confirmed via kind 2473. Each species is a positional `i`/`n` pair — the Wikidata entity URI followed immediately by the scientific binomial name — emitted in chronological order of first detection. Ditto renders a Birdex as a tiled grid of species, each tile showing the Wikipedia thumbnail with the common name overlaid. In feeds, only the most recent few tiles are shown with a "+N" capstone mirroring how kind 3 follow lists preview members; the post-detail page shows every species.
- **Kind 30621 — Custom Constellation.** An addressable event (`d` tag) representing a single user-drawn star figure. Each `edge` tag (`["edge", from, to]`) references two Hipparcos catalog numbers as decimal strings — e.g. `["edge", "32349", "37279"]` for Sirius → Procyon. Required tags: `d`, `title`, `alt`, and at least one valid `edge`. The `content` field is a freeform description. Ditto renders constellations as a stylized SVG star-map (gnomonically projected onto a tangent plane at the figure's centroid, with stars sized by magnitude) using a bundled Hipparcos catalog that is code-split so the data only loads when a constellation is actually viewed.

### Geocaching (Kinds 37516, 7516)

**Author:** Chad Curtis
**Spec:** https://gitlab.com/chad.curtis/treasures/-/blob/main/NIP-GC.md
**App:** https://treasures.to

NIP-GC defines geocaching on Nostr. Kind 37516 (addressable) is a geocache listing with location (geohash), difficulty/terrain scores, size, and type. Kind 7516 is a found log recording a successful visit. The spec also covers comment logs (kind 1111 via NIP-22), verified finds with cryptographic proof (kind 7517), and cache retirement.

### Personal Letters (Kind 8211)

**Author:** Chad Curtis
**Spec:** https://gitlab.com/chad.curtis/lief/-/blob/main/NIP.md
**App:** https://lief.to

NIP-44 encrypted personal letters with visual stationery, hand-drawn stickers, decorative frames, and custom fonts. Letters render as 5:4 landscape postcards. The privacy model is intentionally postcard-like: sender/recipient metadata is visible, content is encrypted.

### Weather Station (Kinds 4223, 16158)

**Author:** Sam Thomson
**Spec:** https://github.com/nostr-protocol/nips/pull/2163
**App:** https://weather.shakespeare.wtf
**Firmware:** https://github.com/samthomson/weather-station

Kind 16158 (replaceable) describes a weather station's configuration: name, geohash location, elevation, power source, connectivity, and sensor inventory. Kind 4223 (regular) carries individual sensor readings as 3-parameter tags `[sensor_type, value, model]`, enabling historical queries and cross-station comparison. Each station has its own keypair.

---

## Music Tracks & Playlists

### Kind 36787: Music Track

An addressable event containing metadata about an audio file. Full spec maintained externally.

**Required tags:** `d`, `title`, `artist`, `url`, `t` (with value `"music"`)

**Optional tags:** `image`, `video`, `album`, `track_number`, `released`, `duration`, `format`, `bitrate`, `sample_rate`, `language`, `explicit`, `zap`, `alt`

### Kind 34139: Music Playlist

An addressable event containing an ordered list of music track references.

**Required tags:** `d`, `title`, `alt`

**Optional tags:** `description`, `image`, `a` (track references), `t`, `public`, `private`, `collaborative`

Track references use `a` tags in the format `["a", "36787:<pubkey>:<d-tag>"]`.

### Albums (Convention)

Albums are represented as kind 34139 playlist events with a `["t", "album"]` tag. This reuses the existing playlist infrastructure while allowing clients to distinguish albums from user-curated playlists.

**Additional optional tags for albums:**
- `released` — ISO 8601 release date (e.g. `"2024-06-15"`)
- `label` — Record label name

**Example album event:**

```json
{
  "kind": 34139,
  "content": "Debut studio album featuring 12 tracks of ambient electronic music.",
  "tags": [
    ["d", "endless-summer-2024"],
    ["title", "Endless Summer"],
    ["image", "https://cdn.blossom.example/img/album-art.jpg"],
    ["t", "album"],
    ["t", "electronic"],
    ["t", "ambient"],
    ["released", "2024-06-15"],
    ["label", "Sunset Records"],
    ["a", "36787:abc123...:track-1"],
    ["a", "36787:abc123...:track-2"],
    ["a", "36787:abc123...:track-3"],
    ["alt", "Album: Endless Summer by The Midnight Collective"]
  ]
}
```

**Client behavior:**
- Clients detect albums by checking for a `t` tag with value `"album"` (case-insensitive)
- Albums display release date and label information when available
- Track ordering follows the order of `a` tags in the event
- The same detail view, playback, and commenting features apply to both albums and playlists
