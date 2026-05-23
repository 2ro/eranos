import { createContext, useContext } from 'react';

/**
 * Provides the center column DOM element so components deep in the tree can
 * portal overlays into it (e.g. the nsite preview panel, webxdc iframe panel).
 */
export const CenterColumnContext = createContext<HTMLElement | null>(null);

/** Hook to get the center column DOM element. Returns null until the layout has mounted. */
export function useCenterColumn(): HTMLElement | null {
  return useContext(CenterColumnContext);
}
