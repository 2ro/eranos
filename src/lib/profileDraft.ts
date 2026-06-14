/**
 * The mutable subset of kind-0 metadata fields edited across the onboarding
 * and campaign-creation surfaces (the verifier organization sub-flow, the
 * shared {@link ProfileIdentityEditor}, and the campaign-creator profile
 * step).
 *
 * All values are plain strings — image fields hold Blossom URLs, `website`
 * is an `https:` URL, and `about` is freeform bio text. The host owns the
 * draft and decides when to publish; nothing here implies persistence.
 */
export interface ProfileDraft {
  /** kind-0 `name` (and `display_name`). */
  name: string;
  /** kind-0 `picture` (avatar) — a Blossom URL. */
  picture: string;
  /** kind-0 `banner` — a Blossom URL. */
  banner: string;
  /** kind-0 `website`. */
  website: string;
  /** kind-0 `about` (bio). */
  about: string;
}

/** An empty {@link ProfileDraft} with every field blank. */
export function emptyProfileDraft(): ProfileDraft {
  return { name: '', picture: '', banner: '', website: '', about: '' };
}

/** Safely parse a kind-0 `content` JSON string into a metadata object. */
export function parseProfileMetadata(
  content: string | undefined,
): Record<string, unknown> {
  if (!content) return {};
  try {
    const parsed: unknown = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // A malformed existing profile shouldn't block writing a fresh one.
  }
  return {};
}

/**
 * Merge a {@link ProfileDraft} onto an existing kind-0 metadata object,
 * trimming each field and only writing the ones the user actually provided.
 *
 * `name` also mirrors into `display_name` (the two are kept in sync across
 * Agora's editors). Empty fields are left untouched so the merge never
 * clobbers metadata the editor doesn't manage.
 */
export function mergeProfileDraft(
  metadata: Record<string, unknown>,
  draft: ProfileDraft,
): Record<string, unknown> {
  const name = draft.name.trim();
  const website = draft.website.trim();
  const picture = draft.picture.trim();
  const banner = draft.banner.trim();
  const about = draft.about.trim();

  if (name) {
    metadata.name = name;
    metadata.display_name = name;
  }
  if (website) metadata.website = website;
  if (picture) metadata.picture = picture;
  if (banner) metadata.banner = banner;
  if (about) metadata.about = about;

  return metadata;
}
