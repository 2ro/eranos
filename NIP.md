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

