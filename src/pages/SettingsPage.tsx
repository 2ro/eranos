import { useSeoMeta } from '@unhead/react';
import { lazy, Suspense, useState } from 'react';
import {
  ChevronRight,
  Settings,
  User,
  BadgeCheck,
  Palette,
  Languages,
  Wifi,
  Bell,
  SlidersHorizontal,
  ShieldCheck,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/PageHeader';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { isAdmin } from '@/lib/admins';
import { cn } from '@/lib/utils';

const RequestToVanishDialog = lazy(() => import('@/components/RequestToVanishDialog').then(m => ({ default: m.RequestToVanishDialog })));

interface SettingsSection {
  id: string;
  /** i18n key under `settings.sections.*` for the row label. */
  labelKey: string;
  /** i18n key under `settings.sections.*` for the row description. */
  descriptionKey: string;
  path: string;
  /** Icon rendered in the colored leading tile. */
  icon: React.ReactNode;
  /** Tailwind classes for the icon tile background gradient. */
  tile: string;
  /** Which visual group this row belongs to. */
  group: 'account' | 'app' | 'system';
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
    icon: <User className="size-[18px]" />,
    tile: 'bg-gradient-to-b from-blue-400 to-blue-600',
    group: 'account',
    requiresAuth: true,
  },
  {
    id: 'verifier',
    labelKey: 'settings.sections.verifier',
    descriptionKey: 'settings.sections.verifierDesc',
    path: '/settings/verifier',
    icon: <BadgeCheck className="size-[18px]" />,
    tile: 'bg-gradient-to-b from-emerald-400 to-emerald-600',
    group: 'account',
    requiresAuth: true,
  },
  {
    id: 'appearance',
    labelKey: 'settings.sections.appearance',
    descriptionKey: 'settings.sections.appearanceDesc',
    path: '/settings/appearance',
    icon: <Palette className="size-[18px]" />,
    tile: 'bg-gradient-to-b from-violet-400 to-violet-600',
    group: 'app',
  },
  {
    id: 'language',
    labelKey: 'settings.sections.language',
    descriptionKey: 'settings.sections.languageDesc',
    path: '/settings/language',
    icon: <Languages className="size-[18px]" />,
    tile: 'bg-gradient-to-b from-sky-400 to-sky-600',
    group: 'app',
  },
  {
    id: 'notifications',
    labelKey: 'settings.sections.notifications',
    descriptionKey: 'settings.sections.notificationsDesc',
    path: '/settings/notifications',
    icon: <Bell className="size-[18px]" />,
    tile: 'bg-gradient-to-b from-rose-400 to-rose-600',
    group: 'app',
    requiresAuth: true,
  },
  {
    id: 'network',
    labelKey: 'settings.sections.network',
    descriptionKey: 'settings.sections.networkDesc',
    path: '/settings/network',
    icon: <Wifi className="size-[18px]" />,
    tile: 'bg-gradient-to-b from-amber-400 to-amber-600',
    group: 'system',
    requiresAuth: true,
  },
  {
    id: 'advanced',
    labelKey: 'settings.sections.advanced',
    descriptionKey: 'settings.sections.advancedDesc',
    path: '/settings/advanced',
    icon: <SlidersHorizontal className="size-[18px]" />,
    tile: 'bg-gradient-to-b from-slate-400 to-slate-600',
    group: 'system',
  },
  {
    id: 'organizers',
    labelKey: 'settings.sections.organizers',
    descriptionKey: 'settings.sections.organizersDesc',
    path: '/organizers',
    icon: <ShieldCheck className="size-[18px]" />,
    tile: 'bg-gradient-to-b from-teal-400 to-teal-600',
    group: 'system',
    requiresAuth: true,
    requiresAdmin: true,
  },
];

const GROUP_ORDER: Array<SettingsSection['group']> = ['account', 'app', 'system'];

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

  const groups = GROUP_ORDER
    .map((group) => ({ group, items: visibleSections.filter((s) => s.group === group) }))
    .filter((g) => g.items.length > 0);

  return (
    <main className="min-h-screen pb-16 sidebar:pb-0">
      <PageHeader title={t('settings.title')} icon={<Settings className="size-5" />} backTo="/" />

      {/* Grouped settings list */}
      <nav aria-label={t('settings.title')} className="px-4 sm:px-6 pt-2 space-y-7 max-w-2xl mx-auto w-full">
        {groups.map(({ group, items }) => (
          <section key={group}>
            <h2 className="px-3.5 pb-1.5 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              {t(`settings.groups.${group}`)}
            </h2>
            <ul className="overflow-hidden rounded-2xl bg-card border border-border/60 shadow-sm divide-y divide-border/50">
            {items.map((section) => (
              <li key={section.id}>
                <button
                  type="button"
                  onClick={() => navigate(section.path)}
                  className={cn(
                    'group flex w-full items-center gap-3.5 px-3.5 py-3 text-left',
                    'transition-colors hover:bg-muted/50 active:bg-muted/70',
                    'focus-visible:bg-muted/50 focus-visible:outline-none',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-[9px] text-white shadow-sm',
                      section.tile,
                    )}
                    aria-hidden="true"
                  >
                    {section.icon}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-medium leading-tight text-foreground">
                      {t(section.labelKey)}
                    </span>
                    <span className="block text-[13px] text-muted-foreground mt-0.5 leading-snug">
                      {t(section.descriptionKey)}
                    </span>
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 rtl:rotate-180"
                    aria-hidden="true"
                  />
                </button>
              </li>
            ))}
          </ul>
          </section>
        ))}
      </nav>

      {/* Delete account */}
      {user && (
        <div className="flex justify-center pt-8 pb-4">
          <button
            type="button"
            onClick={() => setDeleteAccountOpen(true)}
            className="text-[13px] font-medium text-destructive hover:underline focus-visible:underline focus-visible:outline-none"
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
