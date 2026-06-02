import { useSeoMeta } from '@unhead/react';
import { useTranslation } from 'react-i18next';
import { Feed } from '@/components/Feed';
import { AppDownloadNudge } from '@/components/AppDownloadNudge';
import { useAppContext } from '@/hooks/useAppContext';

const Index = () => {
  const { t } = useTranslation();
  const { config } = useAppContext();

  useSeoMeta({
    title: config.appName,
    description: t('feed.indexTagline'),
  });

  return (
    <>
      <Feed />
      <AppDownloadNudge />
    </>
  );
};

export default Index;
