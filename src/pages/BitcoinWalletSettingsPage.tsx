import { useSeoMeta } from '@unhead/react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ChevronRight, KeyRound, History } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { useAppContext } from '@/hooks/useAppContext';

interface SettingsRow {
  id: string;
  to: string;
  icon: React.ReactNode;
  /** Tailwind class for the icon tile background. iOS-style colored squares. */
  iconWrapClass: string;
  labelKey: string;
  descriptionKey: string;
}

/**
 * Apple-inspired settings hub for the HD Bitcoin wallet (`/wallet/settings`).
 *
 * Distinct from `/settings/wallet` which is the Lightning (NWC/WebLN)
 * connection screen. This page sits one level deeper than `/wallet` and
 * collects all "secondary" wallet flows that used to be surfaced inline on
 * the main wallet screen — seed-phrase backup and legacy recovery — so the
 * wallet home stays focused on balance + send + receive.
 *
 * Routes off this page never auto-detect anything; the user has to opt in.
 */
export function BitcoinWalletSettingsPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();

  useSeoMeta({
    title: `${t('walletSettings.seoTitle')} | ${config.appName}`,
    description: t('walletSettings.seoDescription'),
  });

  const rows: SettingsRow[] = [
    {
      id: 'backup',
      to: '/wallet/backup',
      icon: <KeyRound className="size-4 text-white" />,
      iconWrapClass: 'bg-blue-500',
      labelKey: 'walletSettings.backup.label',
      descriptionKey: 'walletSettings.backup.description',
    },
    {
      id: 'legacy',
      to: '/wallet/legacy',
      icon: <History className="size-4 text-white" />,
      iconWrapClass: 'bg-amber-500',
      labelKey: 'walletSettings.legacy.label',
      descriptionKey: 'walletSettings.legacy.description',
    },
  ];

  return (
    <main className="max-w-md mx-auto">
      <PageHeader
        backTo="/wallet"
        alwaysShowBack
        titleContent={
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold">{t('walletSettings.title')}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('walletSettings.subtitle')}
            </p>
          </div>
        }
      />

      <div className="px-4 pt-2 pb-12">
        {/* Apple-style grouped list: rounded card, hairline dividers, chevrons. */}
        <ul className="rounded-xl bg-card border divide-y divide-border overflow-hidden shadow-sm">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                to={row.to}
                className="flex items-center gap-3 px-4 py-3 motion-safe:transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
              >
                <span
                  className={`flex items-center justify-center size-7 rounded-md shrink-0 ${row.iconWrapClass}`}
                  aria-hidden
                >
                  {row.icon}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">
                    {t(row.labelKey)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t(row.descriptionKey)}
                  </p>
                </div>
                <ChevronRight
                  className="size-4 text-muted-foreground shrink-0 rtl:rotate-180"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

export default BitcoinWalletSettingsPage;
