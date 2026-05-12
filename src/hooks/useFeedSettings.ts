import { type FeedSettings } from "@/contexts/AppContext";
import { useAppContext } from "@/hooks/useAppContext";
import { useEncryptedSettings } from "@/hooks/useEncryptedSettings";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { SIDEBAR_ITEMS, SIDEBAR_ITEM_IDS, SIDEBAR_DIVIDER_ID, isNostrUri, isExternalUri } from "@/lib/sidebarItems";
import { useCallback, useMemo } from "react";

// ── Order computation ─────────────────────────────────────────────────────────

/**
 * Default sidebar order. Everything not in this list lives in the "More…"
 * dropdown and can be added back via the edit-sidebar UI.
 */
const DEFAULT_SIDEBAR_ORDER: string[] = [
  'wallet',
  'search',
  'verified',
  'actions',
  'polls',
  'world',
  'badges',
  'feed',
  'notifications',
  'communities',
  'profile',
  'settings',
];

/**
 * Compute the ordered list of visible sidebar items.
 *
 * Empty saved order → default. Otherwise the saved order is used verbatim,
 * with unknown IDs and duplicates dropped and orphan dividers cleaned up.
 */
function computeOrderedItems(sidebarOrder: string[]): string[] {
  if (sidebarOrder.length === 0) return DEFAULT_SIDEBAR_ORDER;

  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const item of sidebarOrder) {
    if (item === SIDEBAR_DIVIDER_ID) {
      ordered.push(item);
      continue;
    }
    if (seen.has(item)) continue;
    seen.add(item);
    if (SIDEBAR_ITEM_IDS.has(item) || isNostrUri(item) || isExternalUri(item)) {
      ordered.push(item);
    }
  }

  // Drop orphan dividers (leading, consecutive, trailing).
  return ordered.filter((id, i) => {
    if (id !== SIDEBAR_DIVIDER_ID) return true;
    if (i === ordered.length - 1) return false;
    if (i === 0) return false;
    if (ordered[i - 1] === SIDEBAR_DIVIDER_ID) return false;
    return true;
  });
}

/**
 * Compute the list of items available to add to the sidebar.
 * Returns sidebar items not currently in the ordered list.
 */
export interface HiddenSidebarItem {
  /** Identifier to pass to addToSidebar. */
  id: string;
  /** Display label. */
  label: string;
}

function computeHiddenItems(
  orderedItems: string[],
): HiddenSidebarItem[] {
  const visibleSet = new Set(orderedItems);
  const hidden: HiddenSidebarItem[] = [];

  for (const item of SIDEBAR_ITEMS) {
    if (!visibleSet.has(item.id)) {
      hidden.push({ id: item.id, label: item.label });
    }
  }

  return hidden;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Hook to get and update feed settings and manage sidebar order.
 */
export function useFeedSettings() {
  const { config, updateConfig } = useAppContext();
  const { updateSettings } = useEncryptedSettings();
  const { user } = useCurrentUser();

  const orderedItems = useMemo(
    () => computeOrderedItems(config.sidebarOrder),
    [config.sidebarOrder],
  );

  const hiddenItems = useMemo(
    () => computeHiddenItems(orderedItems),
    [orderedItems],
  );

  const updateFeedSettings = useCallback(
    (patch: Partial<FeedSettings>) => {
      updateConfig((currentConfig) => ({
        ...currentConfig,
        feedSettings: {
          ...config.feedSettings,
          ...currentConfig.feedSettings,
          ...patch,
        },
      }));
    },
    [config.feedSettings, updateConfig],
  );

  const updateSidebarOrder = useCallback(
    (newOrder: string[]) => {
      updateConfig((currentConfig) => ({
        ...currentConfig,
        sidebarOrder: newOrder,
      }));
      if (user) {
        updateSettings.mutateAsync({ sidebarOrder: newOrder }).catch(() => {});
      }
    },
    [updateConfig, updateSettings, user],
  );

  /**
   * Get the effective sidebar order, using the computed default when the
   * persisted order is empty or undefined (fresh install).
   */
  const getEffectiveOrder = useCallback(
    (persisted: string[] | undefined) => persisted?.length ? persisted : orderedItems,
    [orderedItems],
  );

  /** Add an item to the sidebar (append to sidebarOrder). */
  const addToSidebar = useCallback(
    (id: string) => {
      updateConfig((currentConfig) => {
        const currentOrder = getEffectiveOrder(currentConfig.sidebarOrder);
        if (currentOrder.includes(id)) return currentConfig;
        const newOrder = [...currentOrder, id];
        if (user) {
          updateSettings.mutateAsync({ sidebarOrder: newOrder }).catch(() => {});
        }
        return {
          ...currentConfig,
          sidebarOrder: newOrder,
        };
      });
    },
    [getEffectiveOrder, updateConfig, updateSettings, user],
  );

  /** Append a divider to the sidebar. */
  const addDividerToSidebar = useCallback(
    () => {
      updateConfig((currentConfig) => {
        const currentOrder = getEffectiveOrder(currentConfig.sidebarOrder);
        const newOrder = [...currentOrder, SIDEBAR_DIVIDER_ID];
        if (user) {
          updateSettings.mutateAsync({ sidebarOrder: newOrder }).catch(() => {});
        }
        return { ...currentConfig, sidebarOrder: newOrder };
      });
    },
    [getEffectiveOrder, updateConfig, updateSettings, user],
  );

  /** Remove an item from the sidebar. If index is provided, removes by position (needed for dividers). */
  const removeFromSidebar = useCallback(
    (id: string, index?: number) => {
      updateConfig((currentConfig) => {
        const currentOrder = getEffectiveOrder(currentConfig.sidebarOrder);
        const newOrder = index !== undefined
          ? currentOrder.filter((_, i) => i !== index)
          : currentOrder.filter((r) => r !== id);
        if (user) {
          updateSettings.mutateAsync({ sidebarOrder: newOrder }).catch(() => {});
        }
        return {
          ...currentConfig,
          sidebarOrder: newOrder,
        };
      });
    },
    [getEffectiveOrder, updateConfig, updateSettings, user],
  );

  return {
    feedSettings: config.feedSettings,
    updateFeedSettings,
    /** Ordered list of visible sidebar item IDs. */
    orderedItems,
    /** Items available to add to the sidebar. */
    hiddenItems,
    /** Persist a new order for the sidebar. */
    updateSidebarOrder,
    /** Add an item to sidebar (append to order). */
    addToSidebar,
    /** Append a divider to the sidebar. */
    addDividerToSidebar,
    /** Remove an item from sidebar (remove from order). */
    removeFromSidebar,
  };
}
