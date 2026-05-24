import { useSeoMeta } from '@unhead/react';
import { useTranslation } from 'react-i18next';
import { KeyRound } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { WalletBackupMnemonic } from '@/components/WalletBackupMnemonic';
import { LoginArea } from '@/components/auth/LoginArea';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useHdWalletAccess } from '@/hooks/useHdWalletAccess';

/**
 * Seed-phrase backup page for `/wallet/backup`.
 *
 * Wraps the existing `WalletBackupMnemonic` component in a full-page layout.
 * Reached from the overflow menu on `/wallet`. The component itself hides
 * for extension/bunker logins; we mirror that gating here so the unsupported
 * cases render an explanatory message instead of an empty page.
 */
export function WalletBackupPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const access = useHdWalletAccess();

  useSeoMeta({
    title: `${t('walletBackupPage.seoTitle')} | ${config.appName}`,
    description: t('walletBackupPage.seoDescription'),
  });

  // Not logged in — show the login prompt rather than redirecting away.
  if (!user) {
    return (
      <main className="max-w-md mx-auto">
        <PageHeader
          backTo="/wallet"
          alwaysShowBack
          titleContent={
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold">{t('walletBackupPage.title')}</h1>
            </div>
          }
        />
        <div className="py-20 px-8 flex flex-col items-center gap-6 text-center">
          <div className="p-4 rounded-full bg-primary/10">
            <KeyRound className="size-8 text-primary" />
          </div>
          <p className="text-muted-foreground text-sm max-w-xs">
            {t('walletBackupPage.loggedOut')}
          </p>
          <LoginArea className="max-w-60" />
        </div>
      </main>
    );
  }

  // Login type doesn't expose the secret key — backup is impossible. The
  // `WalletBackupMnemonic` component would render `null` here, which would
  // leave a confusing blank page; explain why instead.
  if (access.status !== 'available') {
    return (
      <main className="max-w-md mx-auto">
        <PageHeader
          backTo="/wallet"
          alwaysShowBack
          titleContent={
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold">{t('walletBackupPage.title')}</h1>
            </div>
          }
        />
        <div className="py-20 px-8 flex flex-col items-center gap-6 text-center">
          <p className="text-muted-foreground text-sm">
            {t('walletBackupPage.unsupported')}
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-md mx-auto">
      <PageHeader
        backTo="/wallet"
        alwaysShowBack
        titleContent={
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold">{t('walletBackupPage.title')}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('walletBackupPage.subtitle')}
            </p>
          </div>
        }
      />

      <div className="px-4 pt-2 pb-12">
        <WalletBackupMnemonic />
      </div>
    </main>
  );
}

export default WalletBackupPage;
