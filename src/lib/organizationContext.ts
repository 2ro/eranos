import { nip19 } from 'nostr-tools';

import { COMMUNITY_DEFINITION_KIND } from '@/lib/communityUtils';

export interface DecodedOrganizationParam {
  aTag: string;
}

/** Decode a `?org=` value from either naddr form or a raw kind-34550 coordinate. */
export function decodeOrganizationParam(value: string | null): DecodedOrganizationParam | null {
  if (!value) return null;

  const hexCoord = /^34550:[0-9a-f]{64}:.+$/i;
  if (hexCoord.test(value)) {
    return { aTag: value };
  }

  try {
    const decoded = nip19.decode(value);
    if (decoded.type !== 'naddr' || decoded.data.kind !== COMMUNITY_DEFINITION_KIND) return null;
    return {
      aTag: `${COMMUNITY_DEFINITION_KIND}:${decoded.data.pubkey}:${decoded.data.identifier}`,
    };
  } catch {
    return null;
  }
}

/** Tags that associate an event with an organization's official activity. */
export function createOrganizationAssociationTags(aTag: string): string[][] {
  if (!aTag) return [];
  const orgAuthor = aTag.split(':')[1];
  const tags: string[][] = [
    ['A', aTag],
    ['K', String(COMMUNITY_DEFINITION_KIND)],
  ];
  if (orgAuthor) tags.push(['P', orgAuthor]);
  return tags;
}
