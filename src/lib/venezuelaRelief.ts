/**
 * Shared constants for the Venezuela earthquake relief appeal.
 *
 * Centralised here so the home-page hero ({@link VenezuelaReliefBanner}),
 * the session popup ({@link VenezuelaReliefPopup}), and the dedicated
 * shareable page ({@link VenezuelaReliefPage}) all reference the same
 * route, photo gallery, and campaign filter, keeping copy and links in
 * sync.
 *
 * Rather than baking in a single campaign, the appeal now showcases
 * *every* Venezuela-located campaign tagged for relief (see
 * {@link VENEZUELA_RELIEF_COUNTRY} + {@link VENEZUELA_RELIEF_CATEGORIES}),
 * resolved live via `useVenezuelaReliefCampaigns`. The donate CTA on every
 * surface points at the dedicated relief page, which shows the full
 * showcase.
 *
 * When the relief response winds down, removing the popup mount in
 * `AppRouter.tsx`, the `<VenezuelaReliefBanner />` line in `CampaignsPage`,
 * and the `/venezuela-relief` route in `AppRouter` retires the whole appeal.
 */

/** Public route for the dedicated relief page (shareable). */
export const VENEZUELA_RELIEF_PATH = '/venezuela-relief';

/**
 * Absolute URL for the dedicated relief page. Used where an in-app
 * client-side `<Link>` misbehaves (e.g. the session popup, where the
 * Radix dialog's click handling swallowed the SPA navigation) — a plain
 * absolute `href` does a full, reliable navigation to the canonical
 * production page.
 */
export const VENEZUELA_RELIEF_URL = 'https://agora.spot/venezuela-relief';

/**
 * ISO 3166-1 alpha-2 country code the appeal is scoped to. Campaigns are
 * matched on their NIP-73 `i` tag (`iso3166:VE`); see
 * {@link createCountryIdentifier}.
 */
export const VENEZUELA_RELIEF_COUNTRY = 'VE';

/**
 * Campaign category `t`-tag slugs that qualify a Venezuela campaign for
 * the relief showcase. A campaign needs *either* tag (logical OR) — the
 * relay-indexed `#t` filter is a set-membership match. These slugs come
 * from the curated picker in {@link CAMPAIGN_CATEGORIES}.
 */
export const VENEZUELA_RELIEF_CATEGORIES: readonly string[] = [
  'humanitarian-aid',
  'emergency-relief',
];

/**
 * Unix timestamp (seconds) of the Venezuela earthquake. The showcase only
 * surfaces campaigns *created at or after* this moment — pre-existing
 * Venezuela humanitarian/relief campaigns aren't part of *this* quake
 * response and would dilute the appeal. Set to 2026-06-25T00:00:00Z, the
 * day the response began.
 */
export const VENEZUELA_EARTHQUAKE_TIMESTAMP = Math.floor(
  Date.UTC(2026, 5, 25) / 1000,
);

/**
 * Addressable coordinates (`33863:<pubkey>:<d>`) that are always included
 * in the relief showcase, regardless of whether they match the
 * country/category/date filter above.
 *
 * The flagship `terremoto-venezuela` campaign ("EARTHQUAKE STUDENT RESCUE
 * BRIGADES") is tagged `emergency-relief` but was published without an
 * `iso3166:VE` country `i` tag, so the geo filter drops it. Pin it here so
 * the canonical relief effort always leads the showcase. Coordinates are
 * de-duplicated against the live query results, so a campaign that *also*
 * matches the filter won't appear twice.
 */
export const VENEZUELA_RELIEF_PINNED_COORDINATES: readonly string[] = [
  '33863:7a303d62d6c9d2f0cabe2ca713a392f3ec4b1fab815ea60b79fe15aca274c71c:terremoto-venezuela',
];

/**
 * Ordered set of news photographs from the Venezuela earthquake that
 * rotate behind the relief hero / page. They live in `/public/hero/` and
 * use the shared `HeroBanner` crossfade + slow-pan treatment.
 */
export const VENEZUELA_RELIEF_IMAGES: readonly string[] = [
  '/hero/ve-quake-1.jpg', // residents embrace near a collapsed building (AFP/Getty)
  '/hero/ve-quake-2.jpg', // community + rescue workers search the rubble (AP)
  '/hero/ve-quake-3.jpg', // severe building damage in Caracas (AFP/Getty)
];

/** sessionStorage key tracking whether the popup has shown this session. */
export const VENEZUELA_RELIEF_POPUP_SEEN_KEY = 'agora:venezuela-relief-popup-seen';
