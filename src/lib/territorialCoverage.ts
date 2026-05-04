/**
 * Territorial coverage inference utilities.
 *
 * Coverage rules:
 * - A municipality is covered when its code is tracked
 * - A state is covered when ALL of its municipalities are covered
 */

import { VE_STATES, getAllMunicipalitiesForState } from '@/lib/venezuelaTerritorial';
import type { DashboardConfig } from '@/hooks/useEventDashboardConfig';

/**
 * Extract all active tracked codes from the dashboard configuration.
 */
export function getActiveTrackedCodes(config: DashboardConfig): Set<string> {
  const codes = new Set<string>();
  for (const region of config.regions) {
    for (const hashtag of region.hashtags) {
      codes.add(hashtag);
    }
  }
  return codes;
}

/**
 * Check if a state is fully covered (all its municipalities are tracked).
 */
export function isStateCovered(
  stateCode: string,
  activeTrackedCodes: Set<string>,
): boolean {
  const municipalities = getAllMunicipalitiesForState(stateCode);
  if (municipalities.length === 0) return false;
  return municipalities.every((muni) => activeTrackedCodes.has(muni.code));
}

/**
 * Get all state codes that are fully covered.
 */
export function getCoveredStates(activeTrackedCodes: Set<string>): string[] {
  return VE_STATES.filter((state) => isStateCovered(state.code, activeTrackedCodes)).map(
    (state) => state.code,
  );
}
