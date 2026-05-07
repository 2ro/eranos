# NIP: Custom Event Kinds

## Event Kinds Overview

### Ditto Kinds

| Kind  | Name                 | Description                                           |
|-------|----------------------|-------------------------------------------------------|
| 16769 | Profile Tabs         | The user's custom profile page tabs (one per user)    |

### Agora Kinds

| Kind  | Name                       | Description                                                    |
|-------|----------------------------|----------------------------------------------------------------|
| 20000 | Ephemeral Geo Chat (public) | Geo-anchored ephemeral chat message (kind 20000, public)      |
| 20001 | Ephemeral Geo Heartbeat    | Geo-anchored ephemeral presence heartbeat (kind 20001)         |
| 30385 | Community Stats Snapshot   | Pre-computed per-country / global community leaderboards       |
| 36639 | Activist Action            | Country-scoped activist challenge with a sats bounty           |

### Agora Protocols

| Protocol                 | Composed Kinds                          | Description                                                     |
|--------------------------|-----------------------------------------|-----------------------------------------------------------------|
| Flat Communities | 34550, 30009, 8, 1111, 1984 | One-level badge membership with explicit moderators (NIP-72 ext) |

### Community Kinds

These event kinds were created by community contributors and are supported by Ditto. Full specifications are maintained by their respective authors.

| Kind  | Name                   | Description                                                      | Spec                                                                                      |
|-------|------------------------|------------------------------------------------------------------|-------------------------------------------------------------------------------------------|
| 3367  | Color Moment           | Color palette post expressing a mood                             | [NIP](https://gitlab.com/chad.curtis/espy/-/blob/main/NIP.md)                            |
| 4223  | Weather Reading        | Sensor readings from a weather station                           | [Draft NIP](https://github.com/nostr-protocol/nips/pull/2163)                            |
| 7516  | Found Log              | Log entry recording a user finding a geocache                    | [NIP-GC](https://gitlab.com/chad.curtis/treasures/-/blob/main/NIP-GC.md)                 |
| 8211  | Encrypted Letter       | Encrypted personal letter with visual stationery                 | [NIP](https://gitlab.com/chad.curtis/lief/-/blob/main/NIP.md)                            |
| 16158 | Weather Station        | Weather station metadata (location, sensors, connectivity)       | [Draft NIP](https://github.com/nostr-protocol/nips/pull/2163)                            |
| 37516 | Geocache               | Geocache listing for real-world treasure hunting                 | [NIP-GC](https://gitlab.com/chad.curtis/treasures/-/blob/main/NIP-GC.md)                 |

---

## Standard NIPs: Direct Messaging

This application implements encrypted direct messaging using two standard Nostr protocols:

### NIP-04 (Legacy Encrypted DMs)

| Field | Value |
|-------|-------|
| Kind  | 4     |
| Spec  | [NIP-04](https://github.com/nostr-protocol/nips/blob/master/04.md) |

Legacy encrypted direct messages. Content is encrypted with AES-256-CBC using a shared secret derived from the sender's private key and recipient's public key. The recipient is identified by a `p` tag.

Used for backward compatibility with older Nostr clients that do not support NIP-17.

### NIP-17 (Private Direct Messages)

| Field | Value |
|-------|-------|
| Kinds | 1059 (Gift Wrap), 1060 (Seal) |
| Spec  | [NIP-17](https://github.com/nostr-protocol/nips/blob/master/17.md) |

Modern private direct messages using the Gift Wrap protocol. Messages are triple-layered:

1. **Rumor** (kind 14) — unsigned plaintext message
2. **Seal** (kind 13) — rumor encrypted to the recipient, signed by the sender
3. **Gift Wrap** (kind 1059) — seal encrypted to the recipient, signed by a random ephemeral key

This provides metadata protection: relays and observers cannot determine the sender, recipient, or content. The application uses NIP-17 as the default send protocol, with optional NIP-04 compatibility for older clients.

### Protocol Configuration

Users can configure their preferred send protocol via Settings > Messages:

- **NIP-17 only** (default) — maximum privacy, only modern clients can read
- **NIP-04 + NIP-17** — sends via both protocols for compatibility with legacy clients

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

Addressable event kind for publishing **activist actions** (called "challenges" internally for backwards compatibility). An action is a country-scoped task — take a photo, make art, gather information, or take direct action — with an optional sats bounty paid out via NIP-57 zaps to the best **submissions**.

Submissions are **NIP-22 comments** (kind 1111) authored under the action's coordinate, ranked by zap totals. There is no separate submission kind; an earlier draft (kind 36640) was deprecated in favor of NIP-22 reuse.

### Trust model

Anyone can publish a kind 36639 event, but clients SHOULD only display actions whose author is either:

1. A platform-level admin (see `src/lib/admins.ts`), or
2. An organizer for the action's country (see kind 30078 `agora-organizers`).

This authorization model is identical to the per-country pin model — see Kind 30078 in this document for the storage shape.

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
| `i`              | Yes      | NIP-73 country identifier: `iso3166:XX` (preferred). Legacy `geo:XX` (length 6, country code only) is accepted as a read alias. Optionally combined with a `location` tag fallback. |
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

After fetching, clients MUST filter the results down to events whose author is either an admin or an organizer for the event's country.

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

## Kinds 20000 / 20001: Ephemeral Geo Chat

### Summary

Ephemeral events used to power realtime location-anchored chat on the world map. Both kinds live in NIP-01's ephemeral range (`20000 ≤ kind < 30000`), so relays MUST NOT persist them — they are short-lived signals only.

- **Kind 20000** — public chat message. The `content` field carries the message text.
- **Kind 20001** — presence "heartbeat". Same tag schema, but `content` MAY be empty (the event simply broadcasts that someone is listening at the geohash).

This kind range is shared with the wider Bitchat / geo-chat ecosystem; Agora interoperates with Pathos and other clients producing the same shape.

### Tags

| Tag | Required | Purpose                                                                 |
|-----|----------|-------------------------------------------------------------------------|
| `g` | Yes      | Geohash anchoring the message. Any precision is allowed; the dialog filters by exact-match `g` value, while the map clusters by full geohash. |
| `n` | No       | Display nickname (≤ 16 chars after client-side truncation). Anonymous senders pick a random "ghost" handle; logged-in senders may use their account display name. |

Events without a `g` tag MUST be ignored — they cannot be plotted.

### Identity

There are two valid signing paths:

1. **Real identity** — a logged-in user signs with their existing Nostr key (typically via NIP-07 / NIP-46). Other clients can correlate the chat message with the author's public profile.
2. **Ephemeral "ghost" identity** — the client generates a fresh in-memory keypair (never persisted) and signs locally. Only the chosen `n` nickname is persisted (in `localStorage`) so the user keeps a stable handle even though the pubkey rotates per session.

Clients SHOULD let logged-in users toggle between modes per-session and SHOULD default to the ghost mode when no account is available.

### Relay Routing

Because ephemeral events are not stored, latency dominates the experience. Clients SHOULD:

1. Always include a baseline of widely-reachable relays (`wss://nos.lol`, `wss://relay.damus.io`, `wss://relay.primal.net`).
2. Augment with geo-located relays drawn from the [permissionlesstech/georelays](https://github.com/permissionlesstech/georelays) CSV catalogue (`relayUrl,latitude,longitude` per line).
3. For a specific geohash conversation, prefer the relays nearest the decoded coordinates (Haversine distance, top-N).
4. For the global map heatmap, take a rotating window (e.g. 8 relays, rotated every 5 minutes) so coverage spreads without saturating any single relay.

### Time Window

Clients SHOULD only surface events from the last hour (`since = now - 3600`). Older ephemeral events are uninteresting for "what's happening right now" and most relays will have dropped them anyway.

### Example

```json
{
  "kind": 20000,
  "created_at": 1734567890,
  "pubkey": "...",
  "tags": [
    ["g", "u4pruydqqvj"],
    ["n", "stealthranger4242"]
  ],
  "content": "anyone in berlin tonight?",
  "sig": "..."
}
```

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
