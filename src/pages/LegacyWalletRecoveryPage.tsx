import { useSeoMeta } from '@unhead/react';
import { useTranslation, Trans } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ChevronRight, History, AlertTriangle, Loader2 } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { LoginArea } from '@/components/auth/LoginArea';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useHdWalletV1Migration } from '@/hooks/useHdWalletV1Migration';
import { useHdBtcPrice } from '@/hooks/useHdBtcPrice';
import { satsToUSD, formatBTC } from '@/lib/bitcoin';

interface LegacyOption {
  id: string;
  to: string;
  labelKey: string;
  descriptionKey: string;
  /** Tailwind class for the icon tile background. */
  badgeClass: string;
  /** Short version-tag rendered in the icon tile (e.g. "V2", "V1"). */
  badge: string;
}

/**
 * Legacy wallet recovery hub at `/wallet/legacy`.
 *
 * Surfaces two opt-in recovery flows for funds that may still be sitting in
 * Agora's previous wallet generations:
 *
 * - **V2 Prelaunch Beta Wallet** — the nsec-as-seed BIP-86 wallet that
 *   shipped before the BIP-39 derivation in `seed.ts`. Sweeps on-chain UTXOs
 *   plus any BIP-352 silent payments to the new wallet.
 * - **V1 Breeze Wallet** — the Pathos-era Lightning custody built on the
 *   Breez/Spark SDK. Sweeps the on-chain balance to the user's
 *   Nostr-derived Taproot address.
 *
 * Auto-detection for the V2 beta runs only when the user has actually
 * navigated to this page — `/wallet` no longer hits Blockbook at load time
 * for anyone. Detection for V1 Breeze is intentionally not run here because
 * the SDK is heavy and detection requires the user's recovery phrase or
 * relay backup — both of which are gathered inside `WalletRecoveryPage`.
 */
export function LegacyWalletRecoveryPage() {
  const { t } = useTranslation();
  const { config } = useAppContext();
  const { user } = useCurrentUser();

  // V2 beta detection runs only when the user actually visits this page.
  const v2 = useHdWalletV1Migration();
  const { data: btcPrice } = useHdBtcPrice();

  useSeoMeta({
    title: `${t('walletLegacy.seoTitle')} | ${config.appName}`,
    description: t('walletLegacy.seoDescription'),
  });

  if (!user) {
    return (
      <main className="max-w-md mx-auto">
        <PageHeader
          backTo="/wallet"
          alwaysShowBack
          titleContent={
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold">{t('walletLegacy.title')}</h1>
            </div>
          }
        />
        <div className="py-20 px-8 flex flex-col items-center gap-6 text-center">
          <div className="p-4 rounded-full bg-primary/10">
            <History className="size-8 text-primary" />
          </div>
          <p className="text-muted-foreground text-sm max-w-xs">
            {t('walletLegacy.loggedOut')}
          </p>
          <LoginArea className="max-w-60" />
        </div>
      </main>
    );
  }

  const options: LegacyOption[] = [
    {
      id: 'v2-beta',
      to: '/wallet/migrate-v1',
      labelKey: 'walletLegacy.options.v2Beta.label',
      descriptionKey: 'walletLegacy.options.v2Beta.description',
      badgeClass: 'bg-amber-500',
      badge: 'V2',
    },
    {
      id: 'v1-breeze',
      to: '/wallet/recovery',
      labelKey: 'walletLegacy.options.v1Breeze.label',
      descriptionKey: 'walletLegacy.options.v1Breeze.description',
      badgeClass: 'bg-purple-500',
      badge: 'V1',
    },
    {
      id: 'double-tweak',
      to: '/wallet/double-tweak-fix',
      labelKey: 'walletLegacy.options.doubleTweak.label',
      descriptionKey: 'walletLegacy.options.doubleTweak.description',
      badgeClass: 'bg-sky-500',
      badge: 'SP',
    },
  ];

  // Was the V2 beta detection actually able to run? The hook reports a
  // structured unavailable-reason when not.
  const v2Available = v2.available;
  const v2HasFunds = v2.v1TotalBalance > 0;

  return (
    <main className="max-w-md mx-auto">
      <PageHeader
        backTo="/wallet"
        alwaysShowBack
        titleContent={
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold">{t('walletLegacy.title')}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {t('walletLegacy.subtitle')}
            </p>
          </div>
        }
      />

      <div className="px-4 pt-2 pb-12 space-y-6">
        {/* V2 beta detection result — only when funds were actually found,
            so the user gets a clear "you have something here" prompt instead
            of a noisy "no funds detected" empty state for the common case. */}
        {v2Available && v2HasFunds && (
          <Alert className="border-amber-300/60 bg-amber-50 text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/50 dark:text-amber-100">
            <AlertTriangle className="size-4 !text-amber-600 dark:!text-amber-400" />
            <AlertDescription className="space-y-3">
              <p className="text-sm font-semibold">
                {t('walletLegacy.v2Detected.title')}
              </p>
              <p className="text-xs">
                <Trans
                  i18nKey="walletLegacy.v2Detected.body"
                  values={{
                    amount: btcPrice
                      ? satsToUSD(v2.v1TotalBalance, btcPrice)
                      : `${formatBTC(v2.v1TotalBalance)} BTC`,
                  }}
                  components={{ 0: <span className="font-semibold" /> }}
                />
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* In-progress scan indicator — keep it light, no loading skeleton
            since the rows below render fine without v2 data. */}
        {v2Available && v2.isLoading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            <Loader2 className="size-3.5 animate-spin" />
            {t('walletLegacy.scanning')}
          </p>
        )}

        <ul className="rounded-xl bg-card border divide-y divide-border overflow-hidden shadow-sm">
          {options.map((opt) => (
            <li key={opt.id}>
              <Link
                to={opt.to}
                className="flex items-center gap-3 px-4 py-3 motion-safe:transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
              >
                <span
                  className={`flex items-center justify-center size-8 rounded-md shrink-0 ${opt.badgeClass}`}
                  aria-hidden
                >
                  <span className="text-[10px] font-bold text-white tracking-wider">
                    {opt.badge}
                  </span>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-tight">
                    {t(opt.labelKey)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t(opt.descriptionKey)}
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

        <p className="text-xs text-muted-foreground px-1 leading-relaxed">
          {t('walletLegacy.footnote')}
        </p>
      </div>
    </main>
  );
}

export default LegacyWalletRecoveryPage;
