import { useMemo } from 'react';
import { Users, Globe } from 'lucide-react';
import type { NostrEvent } from '@nostrify/nostrify';

import { sanitizeUrl } from '@/lib/sanitizeUrl';

// --- Helpers ---

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find(([n]) => n === name)?.[1];
}

function parseCommunityEvent(event: NostrEvent) {
  const name = getTag(event.tags, 'name') || getTag(event.tags, 'd') || 'Unnamed Group';
  const description = getTag(event.tags, 'description') || '';
  const image = getTag(event.tags, 'image');

  // Extract moderators from p tags with "moderator" role
  const moderators = event.tags
    .filter(([n, , , role]) => n === 'p' && role === 'moderator')
    .map(([, pubkey]) => pubkey)
    .filter(Boolean);

  // Extract relays
  const relays = event.tags
    .filter(([n]) => n === 'relay')
    .map(([, url, marker]) => ({ url, marker }))
    .filter((r) => !!r.url);

  return { name, description, image, moderators, relays };
}

// --- Main Component ---

export function CommunityContent({ event }: { event: NostrEvent }) {
  const { name, description, image } = useMemo(
    () => parseCommunityEvent(event),
    [event],
  );

  // Extract website URL from description if present
  const descriptionUrl = useMemo(() => {
    const urlMatch = description.match(/https?:\/\/[^\s]+/);
    return sanitizeUrl(urlMatch?.[0]);
  }, [description]);

  // Description text without trailing URL (if the URL is the last thing)
  const descriptionText = useMemo(() => {
    if (!descriptionUrl) return description;
    return description.replace(new RegExp(`\\s*${descriptionUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`), '').trim();
  }, [description, descriptionUrl]);

  return (
    <div className="mt-3 space-y-5">
      {/* Community hero image */}
      {image ? (
        <div className="relative -mx-4 aspect-[21/9] overflow-hidden">
          <img
            src={image}
            alt={name}
            className="w-full h-full object-cover"
          />
          {/* Gradient overlay for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          {/* Community name overlaid on image */}
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-4">
            <h1 className="text-2xl font-bold text-white leading-tight drop-shadow-lg">{name}</h1>
          </div>
        </div>
      ) : (
        <div className="relative -mx-4 aspect-[21/9] bg-gradient-to-br from-primary/15 via-primary/5 to-transparent flex items-center justify-center">
          <Users className="size-16 text-primary/20" />
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-4">
            <h1 className="text-2xl font-bold leading-tight">{name}</h1>
          </div>
        </div>
      )}

      {/* Description */}
      {descriptionText && (
        <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">{descriptionText}</p>
      )}

      {/* Website link */}
      {descriptionUrl && (
        <a
          href={descriptionUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <Globe className="size-3.5" />
          {descriptionUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
        </a>
      )}

    </div>
  );
}
