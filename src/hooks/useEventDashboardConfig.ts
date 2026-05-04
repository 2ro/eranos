import { useLocalStorage } from '@/hooks/useLocalStorage';
import { useRef, useMemo } from 'react';
import { VE_STATES, VE_MUNICIPALITIES } from '@/lib/venezuelaTerritorial';

export type TerritorialScope = 'state' | 'municipality';

export interface TrackedRegion {
  id: string;
  type?: TerritorialScope;
  code?: string;
  label: string;
  hashtags: string[];
  order: number;
}

export interface DashboardConfig {
  regions: TrackedRegion[];
  since: number | null;
  lastUpdated: number;
}

/** Identity function: each entry is its own queryable code. */
export function materializeHashtags(_scope: TerritorialScope, code: string): string[] {
  return [code];
}

/**
 * Create default config: 24 states + 379 municipalities.
 * Each entry tracks its own code. No time filter by default.
 */
function createDefaultConfig(): DashboardConfig {
  const stateEntries: TrackedRegion[] = VE_STATES.map((state, index) => ({
    id: crypto.randomUUID(),
    type: 'state' as const,
    code: state.code,
    label: state.label,
    hashtags: materializeHashtags('state', state.code),
    order: index,
  }));

  const muniEntries: TrackedRegion[] = VE_MUNICIPALITIES.map((muni, index) => ({
    id: crypto.randomUUID(),
    type: 'municipality' as const,
    code: muni.code,
    label: muni.label,
    hashtags: materializeHashtags('municipality', muni.code),
    order: stateEntries.length + index,
  }));

  return {
    regions: [...stateEntries, ...muniEntries],
    since: null,
    lastUpdated: Date.now(),
  };
}

/**
 * Hook for managing event dashboard configuration.
 * Default config is created once per mount and held stable in memory.
 * localStorage only holds an explicit user-saved config (via applyConfig).
 */
export function useEventDashboardConfig() {
  const [savedConfig, setSavedConfig] = useLocalStorage<DashboardConfig | null>(
    'eventDashboard:config:v2',
    null,
  );

  // Stable in-memory default — created once per mount
  const defaultConfigRef = useRef<DashboardConfig | null>(null);
  if (!defaultConfigRef.current) {
    defaultConfigRef.current = createDefaultConfig();
  }

  const config: DashboardConfig = useMemo(() => {
    if (savedConfig) {
      return { ...savedConfig, since: savedConfig.since ?? null };
    }
    return defaultConfigRef.current!;
  }, [savedConfig]);

  const applyConfig = (next: DashboardConfig) => {
    setSavedConfig({ ...next, lastUpdated: Date.now() });
  };

  return { config, applyConfig };
}
