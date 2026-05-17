/**
 * Hardcoded list of `naddr1...` identifiers for the two featured fundraisers
 * shown at the top of the Campaigns homepage.
 *
 * TODO: replace these placeholder slots with real campaign naddrs once the
 * fundraisers have been chosen by the stakeholders. Until then the UI renders
 * a graceful empty state in their place.
 *
 * Each entry MUST be a `naddr1...` identifier whose decoded kind is
 * `CAMPAIGN_KIND` (30223). Anything else is silently ignored at the page
 * level so a typo doesn't break the homepage.
 */
export const FEATURED_CAMPAIGN_NADDRS: readonly string[] = [
  // TODO(featured-campaign-1): paste an naddr1... here
  '',
  // TODO(featured-campaign-2): paste an naddr1... here
  '',
];
