import { createContext, useContext } from 'react';

import type { ReorderAxis } from '@/hooks/useReorderCampaign';

/**
 * Reorder controls forwarded from a parent grid down to whatever
 * `ModerationOverlay` happens to render the card's moderator kebab.
 *
 * The context lives in its own non-component module so the React
 * Fast Refresh ESLint rule is satisfied — JSX components and
 * `createContext` / hooks that aren't components themselves are
 * intentionally separated.
 */
export interface ReorderEntry {
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveToTop: () => Promise<void> | void;
  onMoveUp: () => Promise<void> | void;
  onMoveDown: () => Promise<void> | void;
}

export interface ReorderContextValue {
  axis: ReorderAxis;
  byCoord: Map<string, ReorderEntry>;
}

/** Internal — exported only for the matching `ReorderProvider` component. */
export const ReorderContext = createContext<ReorderContextValue | null>(null);

/**
 * Read the reorder controls for a single coord, if a provider is
 * mounted. Returns `undefined` outside a provider, which the
 * moderator kebab interprets as "no reorder UI to show".
 */
export function useReorderControlsFor(coord: string): ReorderEntry | undefined {
  const ctx = useContext(ReorderContext);
  return ctx?.byCoord.get(coord);
}
