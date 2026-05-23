import { useSeoMeta } from '@unhead/react';
import { lazy, Suspense, useState } from 'react';
import { ChevronRight, Settings } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { isAdmin } from '@/lib/admins';

const RequestToVanishDialog = lazy(() => import('@/components/RequestToVanishDialog').then(m => ({ default: m.RequestToVanishDialog })));

interface SettingsSection {
  id: string;
  /** i18n key under `settings.sections.*` for the row label. */
  labelKey: string;
  /** i18n key under `settings.sections.*` for the row description. */
  descriptionKey: string;
  path: string;
  requiresAuth?: boolean;
  /** When true, only shown to platform admins (see `isAdmin` in `@/lib/admins`). */
  requiresAdmin?: boolean;
}

const settingsSections: SettingsSection[] = [
  {
    id: 'profile',
    labelKey: 'settings.sections.profile',
    descriptionKey: 'settings.sections.profileDesc',
    path: '/settings/profile',
    requiresAuth: true,
  },
  {
    id: 'appearance',
    labelKey: 'settings.sections.appearance',
    descriptionKey: 'settings.sections.appearanceDesc',
    path: '/settings/appearance',
  },
  {
    id: 'language',
    labelKey: 'settings.sections.language',
    descriptionKey: 'settings.sections.languageDesc',
    path: '/settings/language',
  },
  {
    id: 'network',
    labelKey: 'settings.sections.network',
    descriptionKey: 'settings.sections.networkDesc',
    path: '/settings/network',
    requiresAuth: true,
  },
  {
    id: 'notifications',
    labelKey: 'settings.sections.notifications',
    descriptionKey: 'settings.sections.notificationsDesc',
    path: '/settings/notifications',
    requiresAuth: true,
  },
  {
    id: 'advanced',
    labelKey: 'settings.sections.advanced',
    descriptionKey: 'settings.sections.advancedDesc',
    path: '/settings/advanced',
  },
  {
    id: 'organizers',
    labelKey: 'settings.sections.organizers',
    descriptionKey: 'settings.sections.organizersDesc',
    path: '/organizers',
    requiresAuth: true,
    requiresAdmin: true,
  },
];

export function SettingsPage() {
  const { t } = useTranslation();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const navigate = useNavigate();
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);


  useSeoMeta({
    title: `${t('settings.title')} | ${config.appName}`,
    description: t('settings.description', { appName: config.appName }),
  });

  const visibleSections = settingsSections.filter((section) => {
    if (section.requiresAuth && !user) return false;
    if (section.requiresAdmin && !isAdmin(user?.pubkey)) return false;
    return true;
  });

  return (
    <main className="min-h-screen pb-16 sidebar:pb-0">
      <PageHeader title={t('settings.title')} icon={<Settings className="size-5" />} backTo="/" />

      {/* Settings list */}
      <nav aria-label={t('settings.title')} className="px-4 sm:px-6 pt-2">
        <ul className="divide-y divide-border">
          {visibleSections.map((section) => (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => navigate(section.path)}
                className="flex w-full items-center gap-4 px-2 py-4 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{t(section.labelKey)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t(section.descriptionKey)}
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground shrink-0 rtl:rotate-180" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Delete account */}
      {user && (
        <div className="flex justify-center pt-8 pb-4">
          <button
            type="button"
            onClick={() => setDeleteAccountOpen(true)}
            className="text-xs font-medium text-destructive hover:underline focus-visible:underline focus-visible:outline-none"
          >
            {t('settings.deleteAccount')}
          </button>
        </div>
      )}

      {user && (
        <Suspense fallback={null}>
          <RequestToVanishDialog open={deleteAccountOpen} onOpenChange={setDeleteAccountOpen} />
        </Suspense>
      )}

      {/* Version footer */}
      <Link
        to="/changelog"
        className="block text-center text-[11px] text-muted-foreground/70 hover:text-muted-foreground transition-colors pt-2 pb-4"
      >
        v{import.meta.env.VERSION}{import.meta.env.COMMIT_TAG ? '' : '+'} ({new Date(import.meta.env.BUILD_DATE).toLocaleDateString()})
      </Link>
    </main>
  );
}
