import { useMemo } from 'react';

import { useAppContext } from './useAppContext';

/**
 * Returns the hex pubkeys trusted to issue `agora.verified` campaign
 * verification labels, sourced from {@link AppConfig.labelers}.
 *
 * These are the only pubkeys whose kind 1985 `agora.verified` labels are
 * read and rendered as a verification badge (see
 * {@link useCampaignVerifications}). The list is configurable via
 * `agora.json`; the default is the Team Soapbox curator pubkey.
 */
export function useCampaignLabelers(): string[] {
  const { config } = useAppContext();
  return useMemo(() => config.labelers ?? [], [config.labelers]);
}
