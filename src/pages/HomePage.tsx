import { lazy } from 'react';
import { useAppContext } from '@/hooks/useAppContext';
import { getExtraKindDef } from '@/lib/extraKinds';
import { sidebarItemIcon } from '@/lib/sidebarItems';

import Index from './Index';

// All other pages are lazy-loaded so they don't bloat the index chunk.
// HomePage renders exactly ONE page at a time, so only that page's chunk is loaded.
const PAGE_LOADERS: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  'campaigns': lazy(() => import('./CampaignsPage').then(m => ({ default: m.CampaignsPage }))),
  'notifications': lazy(() => import('./NotificationsPage').then(m => ({ default: m.NotificationsPage }))),
  'search': lazy(() => import('./SearchPage').then(m => ({ default: m.SearchPage }))),
  'bookmarks': lazy(() => import('./BookmarksPage').then(m => ({ default: m.BookmarksPage }))),
  'changelog': lazy(() => import('./ChangelogPage').then(m => ({ default: m.ChangelogPage }))),
  'settings': lazy(() => import('./SettingsPage').then(m => ({ default: m.SettingsPage }))),
  'badges': lazy(() => import('./BadgesPage').then(m => ({ default: m.BadgesPage }))),
  'events': lazy(() => import('./EventsFeedPage').then(m => ({ default: m.EventsFeedPage }))),
  'photos': lazy(() => import('./PhotosFeedPage').then(m => ({ default: m.PhotosFeedPage }))),
  'world': lazy(() => import('./WorldPage').then(m => ({ default: m.WorldPage }))),
  'lists': lazy(() => import('./UserListsPage').then(m => ({ default: m.UserListsPage }))),
  'letters': lazy(() => import('./LettersPage').then(m => ({ default: m.LettersPage }))),
  'help': lazy(() => import('./HelpPage').then(m => ({ default: m.HelpPage }))),
};

/** Sidebar items that use KindFeedPage and need extra kind definitions. */
const KIND_FEED_ITEMS = ['polls', 'articles'] as const;

// KindFeedPage is lazy too
const LazyKindFeedPage = lazy(() => import('./KindFeedPage').then(m => ({ default: m.KindFeedPage })));

function KindFeedWrapper({ itemId }: { itemId: string }) {
  const def = getExtraKindDef(itemId);
  if (!def) return <Index />;
  return <LazyKindFeedPage kind={def.kind} title={def.label} icon={sidebarItemIcon(itemId, 'size-5')} />;
}

/**
 * Renders the page component configured as the homepage.
 * Falls back to the Feed if the configured homePage is invalid.
 *
 * This component is rendered inside MainLayout's Suspense boundary,
 * so lazy components will show the page skeleton while loading.
 */
export function HomePage() {
  const { config } = useAppContext();
  const homePage = config.homePage;

  // Check if it's a kind feed item
  if ((KIND_FEED_ITEMS as readonly string[]).includes(homePage)) {
    return <KindFeedWrapper itemId={homePage} />;
  }

  // Check the lazy component map
  const PageComponent = PAGE_LOADERS[homePage];
  if (PageComponent) {
    return <PageComponent />;
  }

  // Default fallback: Feed (eagerly loaded)
  return <Index />;
}
