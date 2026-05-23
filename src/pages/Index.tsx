import { useSeoMeta } from '@unhead/react';
import { Feed } from '@/components/Feed';
import { useAppContext } from '@/hooks/useAppContext';

const Index = () => {
  const { config } = useAppContext();

  useSeoMeta({
    title: config.appName,
    description: 'Your content. Your vibe. Your rules.',
  });

  return <Feed />;
};

export default Index;
