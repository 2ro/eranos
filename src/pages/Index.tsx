import { useSeoMeta } from '@unhead/react';
import { Megaphone } from 'lucide-react';
import { Feed } from '@/components/Feed';
import { PageHeader } from '@/components/PageHeader';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLayoutOptions } from '@/contexts/LayoutContext';

const Index = () => {
  const { config } = useAppContext();
  const { user } = useCurrentUser();

  useSeoMeta({
    title: config.appName,
    description: 'Your content. Your vibe. Your rules.',
  });

  useLayoutOptions({ showFAB: true, fabKind: 1, hasSubHeader: !!user });

  return (
    <Feed
      header={(
        <PageHeader title="Feed" icon={<Megaphone className="size-5 text-primary" />} />
      )}
    />
  );
};

export default Index;
