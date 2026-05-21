import { useSeoMeta } from '@unhead/react';
import { lazy, Suspense, useState } from 'react';
import { ChevronRight, Settings } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { PageHeader } from '@/components/PageHeader';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useLayoutOptions } from '@/contexts/LayoutContext';
import { isAdmin } from '@/lib/admins';

const RequestToVanishDialog = lazy(() => import('@/components/RequestToVanishDialog').then(m => ({ default: m.RequestToVanishDialog })));

interface SettingsSection {
  id: string;
  label: string;
  description: string;
  path: string;
  requiresAuth?: boolean;
  /** When true, only shown to platform admins (see `isAdmin` in `@/lib/admins`). */
  requiresAdmin?: boolean;
}

const settingsSections: SettingsSection[] = [
  {
    id: 'profile',
    label: 'Profile',
    description: 'Display name, bio, avatar, and verification.',
    path: '/settings/profile',
    requiresAuth: true,
  },
  {
    id: 'appearance',
    label: 'Appearance',
    description: 'System, light, or dark mode.',
    path: '/settings/appearance',
  },
  {
    id: 'feed',
    label: 'Home Feed',
    description: 'Choose which post types appear in your home feed.',
    path: '/settings/feed',
  },
  {
    id: 'content',
    label: 'Content',
    description: 'Muted users, hashtags, and sensitive-content handling.',
    path: '/settings/content',
  },
  {
    id: 'network',
    label: 'Network',
    description: 'Relays and file upload servers.',
    path: '/settings/network',
    requiresAuth: true,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    description: 'Push notification preferences.',
    path: '/settings/notifications',
    requiresAuth: true,
  },
  {
    id: 'advanced',
    label: 'Advanced',
    description: 'Wallet, system, and power-user options.',
    path: '/settings/advanced',
  },
  {
    id: 'organizers',
    label: 'Organizers',
    description: 'Appoint country organizers who can pin posts to country feeds.',
    path: '/organizers',
    requiresAuth: true,
    requiresAdmin: true,
  },
];

export function SettingsPage() {
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const navigate = useNavigate();
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);

  useLayoutOptions({});

  useSeoMeta({
    title: `Settings | ${config.appName}`,
    description: `Manage your ${config.appName} settings`,
  });

  const visibleSections = settingsSections.filter((section) => {
    if (section.requiresAuth && !user) return false;
    if (section.requiresAdmin && !isAdmin(user?.pubkey)) return false;
    return true;
  });

  return (
    <main className="min-h-screen pb-16 sidebar:pb-0">
      <PageHeader title="Settings" icon={<Settings className="size-5" />} backTo="/" />

      {/* Settings list */}
      <nav aria-label="Settings" className="px-4 sm:px-6 pt-2">
        <ul className="divide-y divide-border">
          {visibleSections.map((section) => (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => navigate(section.path)}
                className="flex w-full items-center gap-4 px-2 py-4 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{section.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {section.description}
                  </p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground shrink-0" aria-hidden="true" />
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
            Delete account
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
