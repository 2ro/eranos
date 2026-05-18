/**
 * Hardcoded list of `naddr1...` identifiers for the two featured fundraisers
 * shown at the top of the Campaigns homepage.
 *
 * Each entry MUST be a `naddr1...` identifier whose decoded kind is
 * `CAMPAIGN_KIND` (30223). Anything else is silently ignored at the page
 * level so a typo doesn't break the homepage.
 */
export const FEATURED_CAMPAIGN_NADDRS: readonly string[] = [
  'naddr1qvzqqqrkpupzpyexz3t34l966ngh5xg7u2q788hthdqmj0av3lv8s2tz9t43zt6dqqg8vmmvw4h8gcty94cx7ur4d3shy96anxu',
  'naddr1qvzqqqrkpupzpyexz3t34l966ngh5xg7u2q788hthdqmj0av3lv8s2tz9t43zt6dqqfk67fdwd6x2ctvw358jttxwfjk2er0d5dde0sj',
];
