# NIP: Custom Event Kinds

## Event Kinds Overview

### Ditto Kinds

| Kind  | Name                 | Description                                           |
|-------|----------------------|-------------------------------------------------------|
| 36767 | Theme Definition     | Shareable, named custom UI theme                      |
| 16767 | Active Profile Theme | The user's currently active theme (one per user)      |
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
| Hierarchical Communities | 34550, 30009, 8, 1111, 1984, 5         | Ranked community membership via badge award chains (NIP-72 ext) |

### Community Kinds

These event kinds were created by community contributors and are supported by Ditto. Full specifications are maintained by their respective authors.

| Kind  | Name                   | Description                                                      | Spec                                                                                      |
|-------|------------------------|------------------------------------------------------------------|-------------------------------------------------------------------------------------------|
| 3367  | Color Moment           | Color palette post expressing a mood                             | [NIP](https://gitlab.com/chad.curtis/espy/-/blob/main/NIP.md)                            |
| 4223  | Weather Reading        | Sensor readings from a weather station                           | [Draft NIP](https://github.com/nostr-protocol/nips/pull/2163)                            |
| 7516  | Found Log              | Log entry recording a user finding a geocache                    | [NIP-GC](https://gitlab.com/chad.curtis/treasures/-/blob/main/NIP-GC.md)                 |
| 8211  | Encrypted Letter       | Encrypted personal letter with visual stationery                 | [NIP](https://gitlab.com/chad.curtis/lief/-/blob/main/NIP.md)                            |
| 11125 | Blobbonaut Profile     | Owner profile with coins, achievements, and inventory            | [NIP-BB](https://github.com/Danidfra/nostr-pet/blob/production/NIP.md)                   |
| 14919 | Blobbi Interaction     | Individual pet interaction (feed, play, clean, etc.)             | [NIP-BB](https://github.com/Danidfra/nostr-pet/blob/production/NIP.md)                   |
| 14920 | Blobbi Breeding        | Breeding event between two adult Blobbis                         | [NIP-BB](https://github.com/Danidfra/nostr-pet/blob/production/NIP.md)                   |
| 14921 | Blobbi Record          | Immutable lifecycle record (birth, evolution, adoption)          | [NIP-BB](https://github.com/Danidfra/nostr-pet/blob/production/NIP.md)                   |
| 16158 | Weather Station        | Weather station metadata (location, sensors, connectivity)       | [Draft NIP](https://github.com/nostr-protocol/nips/pull/2163)                            |
| 31124 | Blobbi Pet State       | Current state of a virtual Blobbi pet (addressable)              | [NIP-BB](https://github.com/Danidfra/nostr-pet/blob/production/NIP.md)                   |
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

## Kind 36767: Theme Definition

### Summary

Addressable event kind for publishing shareable custom UI themes. A single user may publish multiple themes, each identified by a unique `d` tag.

A theme consists of colors, optional fonts, and an optional background. Colors are stored in `c` tags, fonts in `f` tags, and background in a `bg` tag.

### Event Structure

```json
{
  "kind": 36767,
  "content": "",
  "tags": [
    ["d", "mk-dark-theme"],
    ["c", "#1a1a2e", "background"],
    ["c", "#e0e0e0", "text"],
    ["c", "#6c3ce0", "primary"],
    ["f", "Inter", "https://example.com/inter.woff2", "body"],
    ["f", "Playfair Display", "https://example.com/playfair.woff2", "title"],
    ["bg", "url https://example.com/bg.jpg", "mode cover", "m image/jpeg", "dim 1920x1080"],
    ["title", "MK Dark Theme"],
    ["alt", "Custom theme: MK Dark Theme"]
  ]
}
```

### Content

The `content` field is unused and MUST be an empty string (`""`).

### Tags

| Tag     | Required | Description                                                                           |
|---------|----------|---------------------------------------------------------------------------------------|
| `d`     | Yes      | Unique identifier (slug) for this theme, e.g. `"mk-dark-theme"`                      |
| `c`     | Yes (×3) | Hex color with marker. See [Color Tags](#color-tags).                                 |
| `f`     | No       | Font declaration. See [Font Tag](#font-tag).                                          |
| `bg`    | No       | Background media. See [Background Tag](#background-tag).                              |
| `title` | Yes      | Human-readable theme name                                                             |
| `alt`   | Yes      | NIP-31 human-readable fallback                                                        |

### Multiple Themes Per User

Since kind 36767 is addressable, a user can publish multiple themes by using different `d` tag values. Publishing a new event with the same `d` tag replaces the previous version (this is how editing works).

---

## Kind 16767: Active Profile Theme

### Summary

Replaceable event that represents the user's currently active profile theme. Only one per user. When other users visit a profile, they query this kind to determine what theme to display.

### Event Structure

```json
{
  "kind": 16767,
  "content": "",
  "tags": [
    ["c", "#1a1a2e", "background"],
    ["c", "#e0e0e0", "text"],
    ["c", "#6c3ce0", "primary"],
    ["f", "Inter", "https://example.com/inter.woff2", "body"],
    ["f", "Playfair Display", "https://example.com/playfair.woff2", "title"],
    ["bg", "url https://example.com/bg.jpg", "mode cover", "m image/jpeg"],
    ["title", "MK Dark Theme"],
    ["alt", "Active profile theme"]
  ]
}
```

### Content

The `content` field is unused and MUST be an empty string (`""`).

### Tags

| Tag     | Required | Description                                                                           |
|---------|----------|---------------------------------------------------------------------------------------|
| `c`     | Yes (×3) | Hex color with marker. See [Color Tags](#color-tags).                                 |
| `f`     | No       | Font declaration. See [Font Tag](#font-tag).                                          |
| `bg`    | No       | Background media. See [Background Tag](#background-tag).                              |
| `title` | No       | Human-readable name for the theme                                                     |
| `alt`   | Yes      | NIP-31 human-readable fallback                                                        |

### Client Behavior

- When visiting a profile, clients query `{ kinds: [16767], authors: [pubkey], limit: 1 }` to get the active theme.
- Clients read the `c` tags to extract colors, `f` tags for fonts, and `bg` tag for the background.
- Setting a new active theme publishes a new kind 16767 event (replacing the old one).
- To remove the active theme, publish a kind 5 deletion event targeting kind 16767.

---

## Shared Tag Definitions

The following tag definitions apply to both kind 36767 and kind 16767.

### Color Tags

Format: `["c", "#rrggbb", "<marker>"]`

| Index | Required | Description                                                                                   |
|-------|----------|-----------------------------------------------------------------------------------------------|
| 0     | Yes      | Tag name: `"c"`                                                                               |
| 1     | Yes      | Lowercase 6-digit hex color code including the `#` sign (e.g. `"#ff0000"`)                    |
| 2     | Yes      | Color role marker: one of `"primary"`, `"text"`, or `"background"`                            |

- All three markers (`"primary"`, `"text"`, `"background"`) MUST be present.
- Only one `c` tag per marker is allowed.

### Font Tag

Format: `["f", "<family>", "<url>", "<role>"]`

| Index | Required | Description                                                                                   |
|-------|----------|-----------------------------------------------------------------------------------------------|
| 0     | Yes      | Tag name: `"f"`                                                                               |
| 1     | Yes      | CSS `font-family` name (e.g. `"Inter"`)                                                       |
| 2     | Yes      | Direct URL to a font file (`.woff2`, `.ttf`, `.otf`)                                          |
| 3     | Yes      | Font role: `"body"` or `"title"`                                                              |

**Roles:**

| Role      | Applies to                                      |
|-----------|--------------------------------------------------|
| `"body"`  | All text globally (body, headings, UI elements)  |
| `"title"` | The user's profile display name                  |

**Rules:**

- The `f` tag is optional on the event.
- At most one `f` tag per role is allowed (i.e. one body font and one title font).
- The `"body"` font tag MUST be ordered before the `"title"` font tag. This ensures backward-compatible clients that only read the first `f` tag will pick up the body font.
- If the URL fails to load, the client SHOULD fall back to a default font gracefully.
- Clients that do not recognize a role SHOULD ignore that `f` tag.
- Legacy events with an `f` tag that has no role marker (only 3 elements) SHOULD be treated as `"body"`.
- Variable font files (covering multiple weights in a single file) are preferred.

### Background Tag

The `bg` tag uses an `imeta`-style variadic format where each entry (after the tag name) is a space-delimited key/value pair.

Format: `["bg", "url <url>", "mode <mode>", "m <mime-type>", ...]`

| Key         | Required | Description                                                                              |
|-------------|----------|------------------------------------------------------------------------------------------|
| `url`       | Yes      | URL to an image or video file                                                            |
| `mode`      | Yes      | Display mode: `"cover"` or `"tile"`                                                      |
| `m`         | Yes      | MIME type (e.g. `"image/jpeg"`, `"image/png"`, `"video/mp4"`)                            |
| `dim`       | No       | Dimensions in pixels: `"<width>x<height>"` (e.g. `"1920x1080"`)                          |
| `blurhash`  | No       | Blurhash placeholder string for progressive loading                                      |

- At most one `bg` tag is allowed per event.
- Clients MAY choose not to render video backgrounds for performance or bandwidth reasons.
- Unknown keys SHOULD be ignored for forward compatibility.

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

## Hierarchical Communities

Hierarchical communities on Nostr, composed from existing event kinds. Communities have ranked membership where authority flows downward through a chain of badge awards.

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
- **Kind 5** ([NIP-09](https://github.com/nostr-protocol/nips/blob/master/09.md)) -- Badge Award Revocation / Moderation Rescinding

### Overview

A hierarchical community consists of:

1. **Badge definitions** (kind `30009`), one per rank tier, published by the founder.
2. A **community definition** (kind `34550`) referencing those badges with rank indices.
3. **Badge awards** (kind `8`) forming a chain of trust -- each award grants a rank, validated by the awarder's rank.
4. **Community-scoped content** (initially kind `1111`) tagged to the community root.
5. **Reports and bans** (kind `1984`) scoped to the community for content warnings, content removal, and member bans.
6. **Deletion requests** (kind `5`) for revoking badge awards or rescinding moderation events.

### Membership Derivation

Community membership is derived from three distinct sources, each resolved differently:

- **Founder** -- the `pubkey` field on the kind `34550` event. One per community, immutable. Controls the community definition since only they can republish the addressable event.
- **Moderators** -- the `p` tags on the kind `34550` event (matching [NIP-72](https://github.com/nostr-protocol/nips/blob/master/72.md)). Mutable (the founder can add/remove by republishing). Share rank 0 with the founder.
- **Members** -- derived from kind `8` badge awards forming the authority chain. A member's rank is determined by the badge they were awarded (rank 1 and below).

The founder and moderators have no badge. Their rank 0 status comes from the community definition itself. Rank 0 cannot be awarded via kind `8` -- there is no rank 0 badge definition. Clients determine founder/moderator display from the community event directly.

Authority is **rank-based, not badge-specific**. A member at rank N can award any badge at rank M where M > N.

### Community Definition

A kind `34550` event defines the community, extending [NIP-72](https://github.com/nostr-protocol/nips/blob/master/72.md) with badge `a` tags that encode rank indices.

#### Tags

| Tag | Required | Description |
|-----|----------|-------------|
| `d` | Yes | Unique community identifier (UUID recommended). |
| `name` | Yes | Human-readable name. |
| `description` | No | Community description. |
| `image` | No | Image URL. |
| `a` | Yes (1+) | Badge definition reference with rank index (see format below). |
| `p` | Yes (1+) | Moderator pubkeys. Implicitly rank 0. The 4th element SHOULD be `"moderator"`. |
| `relay` | No | Recommended relay URL for community content (per [NIP-72](https://github.com/nostr-protocol/nips/blob/master/72.md)). |
| `alt` | No | [NIP-31](https://github.com/nostr-protocol/nips/blob/master/31.md) description. |

#### Badge `a` Tag Format

```
["a", "30009:<pubkey>:<badge-d-tag>", "<relay-hint>", "<rank-index>"]
```

Rank `0` is reserved for the founder and moderators (derived from the community definition, not from badges). Badge `a` tags define awardable ranks starting from `1`. Higher numbers = lower authority. Indices MUST be contiguous starting from 1.

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
    ["a", "30009:<founder-pubkey>:a1b2c3d4-...-staff", "", "1"],
    ["a", "30009:<founder-pubkey>:a1b2c3d4-...-member", "", "2"],
    ["a", "30009:<founder-pubkey>:a1b2c3d4-...-peon", "", "3"],
    ["p", "<founder-pubkey>", "", "moderator"],
    ["p", "<co-moderator-pubkey>", "", "moderator"],
    ["relay", "wss://relay.example.com"],
    ["alt", "Community: The Arbiter's Guard"]
  ]
}
```

### Badge Definitions

Each rank tier is a standard [NIP-58](https://github.com/nostr-protocol/nips/blob/master/58.md) kind `30009` badge definition published by the founder. Badge definitions MUST be published **before** the community definition that references them.

The `d` tag SHOULD use the format `<community-d-tag>-<rank-name>` for global uniqueness.

```jsonc
{
  "kind": 30009,
  "pubkey": "<founder-pubkey>",
  "content": "",
  "tags": [
    ["d", "a1b2c3d4-...-staff"],
    ["name", "Staff"],
    ["description", "Trusted officers who manage clan operations."],
    ["image", "https://example.com/staff-badge.png"],
    ["alt", "Badge definition: Staff"]
  ]
}
```

### Badge Awards

Membership is established through kind `8` badge awards ([NIP-58](https://github.com/nostr-protocol/nips/blob/master/58.md)). Each award forms a chain link.

A badge award is **valid** if and only if:

1. The `a` tag references a badge definition listed in the community definition.
2. The awarder is a validated member at a rank **strictly less than** the badge's rank index.
3. The awarder's chain can be walked upward to a founder or moderator.

```jsonc
// Moderator (rank 0) awarding Staff (rank 1)
{
  "kind": 8,
  "pubkey": "<founder-pubkey>",
  "content": "",
  "tags": [
    ["a", "30009:<founder-pubkey>:a1b2c3d4-...-staff"],
    ["p", "<recipient-pubkey>"],
    ["alt", "Badge award: Staff in The Arbiter's Guard"]
  ]
}
```

### Chain Validation

Membership is **derived state**. Clients compute effective membership by resolving the authority graph from badge awards, then applying moderation overlays.

#### Algorithm

1. **Seed rank 0**: The event publisher (founder) and all `p` tags (moderators) in the community definition are rank 0 members.
2. **Query awards**: `{ kinds: [8], #a: [<all badge coordinates>] }`
3. **Iteratively validate**: For each award, check if the awarder is a validated member with rank strictly less than the awarded rank. If valid, add the recipient. Repeat until no new members are discovered.
4. **Resolve moderation**: Query `{ kinds: [1984], #A: [<community-a-tag>] }`. Classify kind `1984` events into **bans** and **reports** (see [Moderation](#moderation)). Kind `1984` events from non-members and banned members are ignored. Ban attempts from insufficiently ranked members are ignored, such as a rank 2 member trying to ban a rank 0 founder or moderator.
5. **Apply moderation**: Remove banned members from effective membership. Omit content from banned authors, omit verified content bans, and attach report data to reported content for content-warning display.

Clients MUST NOT trust kind `8` events at face value. An attacker can publish awards for themselves, but these fail chain validation without a path to a founder or moderator.

### Community-Scoped Content

Community-scoped content is any event that tags the community definition with uppercase `A`. The foundation implementation starts with kind `1111` ([NIP-22](https://github.com/nostr-protocol/nips/blob/master/22.md)) posts, but the same moderation overlay applies to future community content kinds such as calendar events, polls, listings, or other domain-specific events.

Clients SHOULD treat valid community members as the canonical authors for community views. Content from non-members MAY be shown in future review surfaces, but canonical community feeds SHOULD discard non-member content by default.

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

Fetch community-scoped content and moderation data together when relay limits permit. The `kinds` list can expand as the application adds supported community content kinds.

```jsonc
{
  "kinds": [1111, 1984],
  "#A": ["34550:<founder-pubkey>:<community-d-tag>"]
}
```

Clients then filter client-side: discard unsupported kinds, discard non-member content from canonical community views, and process kind `1984` events per the moderation rules below. The moderation overlay is content-kind agnostic: a valid content ban or warning applies to the targeted event regardless of whether that event is a post, calendar event, poll, listing, or future supported kind.

### Moderation

Moderation uses kind `1984` ([NIP-56](https://github.com/nostr-protocol/nips/blob/master/56.md)) scoped to the community via the uppercase `A` tag. Moderation is derived state: clients first resolve trusted moderation actions from kind `1984`, then apply those actions to concrete community-scoped events.

There are two tiers of moderation events:

1. **Bans** -- authoritative actions from higher-ranked members that remove content or ban users. Identified by the presence of [NIP-32](https://github.com/nostr-protocol/nips/blob/master/32.md) label tags `["L", "moderation"]` and `["l", "ban", "moderation"]`.
2. **Reports** -- soft flags from any valid community member using standard [NIP-56](https://github.com/nostr-protocol/nips/blob/master/56.md) report types (`nudity`, `spam`, `profanity`, `illegal`, `malware`, `impersonation`, `other`). No `L`/`l` tags. Clients display a content warning that users must click through to reveal.

Kind `1984` events from **non-members** are ignored entirely within community context. Kind `1984` events from members who are themselves banned are also ignored after ban resolution; banned members cannot retain moderation or reporting authority.

#### Bans (Authoritative Moderation)

A ban is **authoritative** if and only if:

1. The event contains `["l", "ban", "moderation"]` and `["L", "moderation"]` tags.
2. The publisher is a validated community member.
3. The publisher is not themselves banned after ban resolution.
4. The publisher's rank is **strictly less than** the target's rank (or the target is a non-member).

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

The `e` and `p` tags are untrusted until matched against the actual target event. A content ban MUST only apply when the targeted event's `id` matches the ban's `e` tag and the targeted event's `pubkey` matches the ban's `p` tag. This prevents a malicious or mistaken report from hiding an event by pairing its event ID with a lower-ranked or non-member pubkey.

##### Member Ban

Ban a member by publishing kind `1984` with `p` and `A` tags only (no `e` tag) plus the `ban` label. This is **non-cascading** -- only the targeted member is banned. Their kind `8` awards remain on relays, so downstream members whose chain passes through the banned member are still valid. For cascading removal, use badge revocation (kind `5`) instead.

```jsonc
{
  "kind": 1984,
  "pubkey": "<moderator-pubkey>",
  "content": "Reason for ban",
  "tags": [
    ["p", "<banned-member-pubkey>", "other"],
    ["A", "34550:<founder-pubkey>:<community-d-tag>"],
    ["L", "moderation"],
    ["l", "ban", "moderation"]
  ]
}
```

Clients distinguish content bans (`e` + `p` + `A` + `ban` label) from member bans (`p` + `A` + `ban` label, no `e` tag).

#### Reports (Content Warnings)

Any **valid, non-banned community member** (regardless of rank) may report content by publishing kind `1984` with a standard NIP-56 report type on the `e` and `p` tags. Reports do NOT use `L`/`l` label tags.

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
| `["l", "ban", "moderation"]` | Yes | Non-banned member; rank < target; `e`/`p` match target event | Content ban (omit event) |
| `["l", "ban", "moderation"]` | No | Non-banned member; rank < target | Member ban |
| No | Yes | Non-banned member; `e`/`p` match target event | Content warning |
| No | No | -- | Invalid (ignored) |
| Any | Any | Non-member | Ignored |
| Any | Any | Banned member | Ignored |
| `["l", "ban", "moderation"]` | Any | Rank >= target | Ignored |

#### Rescinding Moderation

A kind `1984` ban or report can be rescinded by deleting the kind `1984` event via kind `5` ([NIP-09](https://github.com/nostr-protocol/nips/blob/master/09.md)). Per NIP-09, only the original author of the kind `1984` event can delete it.

```jsonc
{
  "kind": 5,
  "tags": [["e", "<kind-1984-event-id>"], ["k", "1984"]]
}
```

Clients that implement moderation rescinding SHOULD discard any kind `1984` event whose matching kind `5` deletion exists before resolving bans and reports. This branch does not implement moderation rescinding yet; it is retained here as part of the protocol foundation for future moderation extensions.

### Revocation

A badge awarder can revoke their own award via kind `5`:

```jsonc
{
  "kind": 5,
  "tags": [["e", "<kind-8-event-id>"], ["k", "8"]]
}
```

This is **cascading** -- the chain link is destroyed, so the revoked member and all downstream members whose chain depended on it lose validated status. Per NIP-09, only the original publisher of the kind `8` event can delete it.

**Ban vs revocation**: Use kind `1984` to ban a single member without affecting their downstream recruits. Use kind `5` revocation to remove a member and cascade to their entire subtree.

### Community Updates

Both kind `34550` and kind `30009` are addressable events. To add or remove ranks, republish the community definition with updated `a` tags. To update moderators, republish with updated `p` tags. Removing a moderator cascades to members they recruited (unless those members have another valid chain path). Only the founder (event publisher) can republish the community definition.

### Discovery

**Communities founded by a user:**

```jsonc
{ "kinds": [34550], "authors": ["<user-pubkey>"] }
```

**Communities a user belongs to:**

1. `{ "kinds": [8], "#p": ["<user-pubkey>"] }`
2. Extract badge `a` tags from results.
3. `{ "kinds": [34550], "#a": ["30009:...", "..."] }`

### Security Considerations

- **Author filtering**: Clients MUST filter community definitions by `authors` to prevent impersonation.
- **Chain validation is required**: Never trust kind `8` events without walking the authority chain.
- **Badge d-tag uniqueness**: Use `<community-d-tag>-<rank-name>` to prevent cross-community collisions.
- **Badge acceptance is cosmetic**: NIP-58 kind `10008`/`30008` events have no effect on chain validation.

### Dependencies

- [NIP-09](https://github.com/nostr-protocol/nips/blob/master/09.md) -- Event Deletion Request
- [NIP-22](https://github.com/nostr-protocol/nips/blob/master/22.md) -- Comment
- [NIP-31](https://github.com/nostr-protocol/nips/blob/master/31.md) -- Unknown Event Kinds (`alt` tag)
- [NIP-32](https://github.com/nostr-protocol/nips/blob/master/32.md) -- Labeling (moderation `ban` label)
- [NIP-56](https://github.com/nostr-protocol/nips/blob/master/56.md) -- Reporting
- [NIP-58](https://github.com/nostr-protocol/nips/blob/master/58.md) -- Badges
- [NIP-72](https://github.com/nostr-protocol/nips/blob/master/72.md) -- Moderated Communities

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

### Blobbi Virtual Pet (Kinds 31124, 14919, 14920, 14921, 11125)

**Author:** Danifra
**Spec:** https://github.com/Danidfra/nostr-pet/blob/production/NIP.md
**App:** https://nostr-pet.vercel.app
**See also:** [Blobbi tag schema](docs/blobbi/blobbi-tag-schema.md) (Ditto-specific integration details)

NIP-BB defines a virtual pet lifecycle on Nostr. Kind 31124 (addressable) holds the current pet state across three stages (egg, baby, adult) with stats, appearance, and personality traits. Kind 14919 logs individual interactions, kind 14920 records breeding events, kind 14921 stores immutable lifecycle records, and kind 11125 (replaceable) holds the owner's profile with coins, achievements, and inventory.

#### Kind 11125 `content` JSON — `missions` field

The `content` of kind 11125 is a JSON object. Ditto extends it with a `missions` field that tracks daily and evolution mission progress:

```jsonc
{
  "missions": {
    "date": "2026-04-16",       // ISO date string for the current daily mission set
    "daily": [ /* Mission[] */ ],
    "evolution": [ /* Mission[] — active hatch/evolve tasks, cleared on stage transition */ ],
    "rerolls": 2                // remaining daily mission rerolls
  }
  // ...other profile fields (coins, achievements, inventory, etc.)
}
```

Each `Mission` is either a **TallyMission** (`{ id, target, count }`) or an **EventMission** (`{ id, target, events: string[] }`) where `events` contains Nostr event IDs that satisfy the mission. Evolution missions are populated when incubation or evolution begins and cleared when the stage transition completes or is cancelled.
