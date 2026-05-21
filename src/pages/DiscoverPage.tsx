import { useSeoMeta } from '@unhead/react';

import { Feed } from '@/components/Feed';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';

/** `/discover` — the Agora activity feed. */
export function DiscoverPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();

  useLayoutOptions({ showFAB: true, fabKind: 1, hasSubHeader: !!user });

  useSeoMeta({
    title: `Discover | ${config.appName}`,
    description: 'Campaigns, pledges, donations, and conversations happening on Agora.',
  });

  return <Feed />;
}

export default DiscoverPage;
