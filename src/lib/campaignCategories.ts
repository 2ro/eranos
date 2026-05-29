import {
  Baby,
  CalendarDays,
  Church,
  Dog,
  Flower2,
  GraduationCap,
  HandHeart,
  HeartHandshake,
  Scale,
  Shield,
  Siren,
  Stethoscope,
  Target,
  Users,
  Vote,
  type LucideIcon,
} from 'lucide-react';

/**
 * Curated set of campaign categories the wizard surfaces as a chip
 * picker on the final step. Each entry maps a stable, lowercased
 * `t`-tag slug (the value persisted on the event) to a translation
 * key (under `campaignsCreate.categories.*` in the locale files) and
 * a Lucide icon. The set is deliberately fixed — adding new entries
 * means adding the slug here, the translation everywhere, and an
 * icon. Categories are stored as ordinary `t` tags, indistinguishable
 * from any other content tag at the protocol level; the picker is
 * just a curated UI on top of the same field.
 */
export interface CampaignCategory {
  /** Lowercase, hyphenated slug persisted as a `t` tag on the event. */
  slug: string;
  /** i18n key under `campaignsCreate.categories.*`. */
  labelKey: string;
  /** Lucide icon component rendered next to the label in the picker. */
  Icon: LucideIcon;
}

export const CAMPAIGN_CATEGORIES: readonly CampaignCategory[] = [
  { slug: 'adoption', labelKey: 'campaignsCreate.categories.adoption', Icon: Baby },
  { slug: 'animals', labelKey: 'campaignsCreate.categories.animals', Icon: Dog },
  { slug: 'church', labelKey: 'campaignsCreate.categories.church', Icon: Church },
  { slug: 'community', labelKey: 'campaignsCreate.categories.community', Icon: HeartHandshake },
  { slug: 'education', labelKey: 'campaignsCreate.categories.education', Icon: GraduationCap },
  { slug: 'emergency', labelKey: 'campaignsCreate.categories.emergency', Icon: Siren },
  { slug: 'event', labelKey: 'campaignsCreate.categories.event', Icon: CalendarDays },
  { slug: 'family', labelKey: 'campaignsCreate.categories.family', Icon: Users },
  { slug: 'first-responders', labelKey: 'campaignsCreate.categories.firstResponders', Icon: Shield },
  { slug: 'legal', labelKey: 'campaignsCreate.categories.legal', Icon: Scale },
  { slug: 'medical', labelKey: 'campaignsCreate.categories.medical', Icon: Stethoscope },
  { slug: 'memorial', labelKey: 'campaignsCreate.categories.memorial', Icon: Flower2 },
  { slug: 'mission', labelKey: 'campaignsCreate.categories.mission', Icon: Target },
  { slug: 'non-profit', labelKey: 'campaignsCreate.categories.nonProfit', Icon: HandHeart },
  { slug: 'political', labelKey: 'campaignsCreate.categories.political', Icon: Vote },
] as const;

/** Set of valid category slugs for O(1) lookup. */
export const CAMPAIGN_CATEGORY_SLUGS = new Set<string>(
  CAMPAIGN_CATEGORIES.map((c) => c.slug),
);
