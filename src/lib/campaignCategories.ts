import {
  Gavel,
  GraduationCap,
  Heart,
  HeartHandshake,
  KeyRound,
  Megaphone,
  Newspaper,
  PawPrint,
  Plane,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Stethoscope,
  Tent,
  Venus,
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
 *
 * **Editorial focus.** Agora's mission is funding the kinds of
 * activism HRF and the World Liberty Congress champion — human
 * rights, democracy, press freedom, political prisoners — so the
 * preset list leads with those themes. Everyday humanitarian needs
 * (emergency relief, medical, education, community) round out the
 * grid so the picker still covers the breadth of legitimate
 * fundraising. Categories that used to ship here but didn't match
 * the editorial focus (adoption, church, family, memorial, event,
 * mission) were dropped pre-launch; campaigns published before the
 * drop keep their on-chain `t` tags intact but no longer light up a
 * pill in the editor.
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
  { slug: 'human-rights', labelKey: 'campaignsCreate.categories.humanRights', Icon: Heart },
  { slug: 'democracy', labelKey: 'campaignsCreate.categories.democracy', Icon: Vote },
  { slug: 'press-freedom', labelKey: 'campaignsCreate.categories.pressFreedom', Icon: Newspaper },
  { slug: 'political-prisoners', labelKey: 'campaignsCreate.categories.politicalPrisoners', Icon: KeyRound },
  { slug: 'humanitarian-aid', labelKey: 'campaignsCreate.categories.humanitarianAid', Icon: Tent },
  { slug: 'civil-resistance', labelKey: 'campaignsCreate.categories.civilResistance', Icon: Megaphone },
  { slug: 'digital-rights', labelKey: 'campaignsCreate.categories.digitalRights', Icon: ShieldCheck },
  { slug: 'anti-corruption', labelKey: 'campaignsCreate.categories.antiCorruption', Icon: ShieldAlert },
  { slug: 'women-girls', labelKey: 'campaignsCreate.categories.womenGirls', Icon: Venus },
  { slug: 'refugees', labelKey: 'campaignsCreate.categories.refugees', Icon: Plane },
  { slug: 'legal-aid', labelKey: 'campaignsCreate.categories.legalAid', Icon: Gavel },
  { slug: 'emergency-relief', labelKey: 'campaignsCreate.categories.emergencyRelief', Icon: Siren },
  { slug: 'animal-rights', labelKey: 'campaignsCreate.categories.animalRights', Icon: PawPrint },
  { slug: 'education', labelKey: 'campaignsCreate.categories.education', Icon: GraduationCap },
  { slug: 'medical', labelKey: 'campaignsCreate.categories.medical', Icon: Stethoscope },
  { slug: 'community', labelKey: 'campaignsCreate.categories.community', Icon: HeartHandshake },
] as const;

/** Set of valid category slugs for O(1) lookup. */
export const CAMPAIGN_CATEGORY_SLUGS = new Set<string>(
  CAMPAIGN_CATEGORIES.map((c) => c.slug),
);

/** Translation keys keyed by campaign category slug. */
export const CAMPAIGN_CATEGORY_LABEL_KEYS_BY_SLUG = new Map<string, string>(
  CAMPAIGN_CATEGORIES.map((c) => [c.slug, c.labelKey]),
);
