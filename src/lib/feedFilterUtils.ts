import { EXTRA_KINDS } from '@/lib/extraKinds';
import { CONTENT_KIND_ICONS } from '@/lib/sidebarItems';

type KindOption = {
  value: string;
  label: string;
  description: string;
  parentId: string;
  icon: React.ComponentType<{ className?: string }> | undefined;
};

/**
 * Agora-native kinds that are not modeled in EXTRA_KINDS (which drives the
 * sidebar / feed-settings UI). We surface them in the search Kind picker
 * because they are first-class searchable content on Agora.
 */
const AGORA_NATIVE_KIND_OPTIONS: KindOption[] = [
  {
    value: '33863',
    label: 'Campaigns (33863)',
    description: 'Fundraising campaigns',
    parentId: 'campaigns',
    icon: CONTENT_KIND_ICONS['campaigns'],
  },
  {
    value: '36639',
    label: 'Pledges (36639)',
    description: 'Donor pledges for concrete actions',
    parentId: 'actions',
    icon: CONTENT_KIND_ICONS['actions'],
  },
];

/**
 * Agora's curated "main content" kinds, surfaced as a preset section at the
 * top of the KindPicker. Order is the order they appear in the picker.
 *
 * Includes Agora-native kinds plus the existing-NIP kinds Agora foregrounds
 * (campaigns, pledges, communities, posts, articles, events, polls, photos,
 * videos). Excludes social-signal kinds (reactions, reposts) and
 * stats snapshots, which users rarely filter on directly.
 */
export const AGORA_PRESET_KIND_VALUES: readonly string[] = [
  '33863', // Campaigns
  '36639', // Pledges
  '34550', // Communities
  '1',     // Posts
  '30023', // Articles
  '31923', // Events (time)
  '1068',  // Polls
  '20',    // Photos
  '21',    // Videos
] as const;

/** Build the kind options from EXTRA_KINDS definitions plus Agora-native kinds. */
export function buildKindOptions(): KindOption[] {
  const options: KindOption[] = [];
  // Agora-native kinds appear first so they're easy to find.
  for (const opt of AGORA_NATIVE_KIND_OPTIONS) options.push(opt);
  for (const def of EXTRA_KINDS) {
    if (def.subKinds) {
      for (const sub of def.subKinds) {
        options.push({
          value: String(sub.kind),
          label: `${sub.label} (${sub.kind})`,
          description: sub.description,
          parentId: def.id,
          icon: CONTENT_KIND_ICONS[def.id],
        });
      }
    } else {
      options.push({
        value: String(def.kind),
        label: `${def.label} (${def.kind})`,
        description: def.description,
        parentId: def.id,
        icon: CONTENT_KIND_ICONS[def.id],
      });
    }
  }
  const seen = new Set<string>();
  return options.filter((o) => {
    if (seen.has(o.value)) return false;
    seen.add(o.value);
    return true;
  });
}

