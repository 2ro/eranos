/**
 * Shared constants for the Venezuela earthquake relief appeal.
 *
 * Centralised here so the home-page hero ({@link VenezuelaReliefBanner}),
 * the session popup ({@link VenezuelaReliefPopup}), and the dedicated
 * shareable page ({@link VenezuelaReliefPage}) all reference the same
 * route, photo gallery, and deep-link, keeping copy and links in sync.
 *
 * When the relief response winds down, removing the popup mount in
 * `App.tsx`, the `<VenezuelaReliefBanner />` line in `CampaignsPage`, and
 * the `/venezuela-relief` route in `AppRouter` retires the whole appeal.
 */

/** Public route for the dedicated relief page (shareable). */
export const VENEZUELA_RELIEF_PATH = '/venezuela-relief';

/**
 * The specific relief campaign baked into the appeal — `terremoto-venezuela`
 * (kind 33863). The hero, popup, and page resolve this `(pubkey, identifier)`
 * coordinate to surface the campaign's live raised/goal progress, turning
 * each surface into an info + donation hybrid. The donate CTA
 * ({@link VENEZUELA_DONATE_PATH}) deep-links to this same campaign's naddr.
 */
export const VENEZUELA_RELIEF_CAMPAIGN_PUBKEY =
  '7a303d62d6c9d2f0cabe2ca713a392f3ec4b1fab815ea60b79fe15aca274c71c';

/** The relief campaign's `d` tag (slug). */
export const VENEZUELA_RELIEF_CAMPAIGN_IDENTIFIER = 'terremoto-venezuela';

/**
 * Deep-link straight to the specific Venezuela earthquake relief campaign
 * (`terremoto-venezuela`, kind 33863). Baked in as the donate CTA target
 * for the hero, popup, and dedicated page so donors land on the campaign's
 * detail page rather than a filtered browse. NIP-19 identifiers route at
 * the URL root (`/:nip19`), handled by `NIP19Page`.
 */
export const VENEZUELA_DONATE_PATH =
  '/naddr1qvzqqqyygupzq73s843ddjwj7r9tut98zw3e9ulvfv06hq275c9hnls44j38f3cuqqfhgetjwfjk6mm5dukhvetwv4a82etvvykrc9yj';

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
