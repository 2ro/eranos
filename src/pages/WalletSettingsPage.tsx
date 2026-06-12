import { useSeoMeta } from '@unhead/react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { HelpTip } from '@/components/HelpTip';
import { WalletSettings } from '@/components/WalletSettings';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';

export function WalletSettingsPage() {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const { config } = useAppContext();

  useSeoMeta({
    title: `${t('settings.wallet.title')} | ${t('settings.title')} | ${config.appName}`,
    description: t('settings.wallet.subtitle'),
  });

  if (!user) {
    return <Navigate to="/settings" replace />;
  }

  return (
    <main className="">
      {/* Header with back link */}
      <PageHeader
        backTo="/settings"
        alwaysShowBack
        contentClassName="max-w-2xl mx-auto w-full"
        titleContent={
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold flex items-center gap-1.5">{t('settings.wallet.title')} <HelpTip faqId="connect-wallet" /></h1>
          </div>
        }
      />

      <div className="p-4 max-w-2xl mx-auto w-full">
        <WalletSettings />
      </div>
    </main>
  );
}
