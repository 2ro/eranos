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

/** Deep-link to the Venezuela-filtered campaign browse for donors. */
export const VENEZUELA_DONATE_PATH = '/campaigns?country=VE';

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
