import { useInitialSync } from "@/hooks/useInitialSync";

/**
 * Non-rendering component that runs the initial sync side effects
 * (seeding relay list, blossom servers, encrypted settings, mute list
 * into the query cache and app config) when a user logs in.
 *
 * Mounted at the top of the React tree so it runs in parallel with the
 * rest of the app — it does NOT block render. NostrSync continues to
 * keep settings up to date in the background after the initial pass.
 */
export function InitialSyncRunner() {
  useInitialSync();
  return null;
}
