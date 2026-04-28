import { createContext, useContext } from 'react';

import type { CommunityMember, CommunityModeration } from '@/lib/communityUtils';

/**
 * Context that lets nested components (e.g. NoteMoreMenu, NoteCard) discover
 * community moderation state when rendered inside a community detail page.
 * `null` outside any community context.
 */
export interface CommunityModerationContextValue {
  /** The community `A` tag coordinate (e.g. `34550:<pubkey>:<d-tag>`). */
  communityATag: string;
  /** Resolved moderation data (bans, reports, content warnings). */
  moderation: CommunityModeration;
  /** Chain-validated rank lookup (pubkey → rank). Includes banned members — for authority checks only. */
  rankMap: Map<string, CommunityMember>;
}

export const CommunityModerationContext = createContext<CommunityModerationContextValue | null>(null);

/**
 * Returns community moderation context, or `null` outside a community page.
 */
export function useCommunityModerationContext(): CommunityModerationContextValue | null {
  return useContext(CommunityModerationContext);
}
