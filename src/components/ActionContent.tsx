import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { nip19 } from 'nostr-tools';
import type { NostrEvent } from '@nostrify/nostrify';
import { Camera, Clock, DollarSign, Info, Megaphone, Palette } from 'lucide-react';

import { parseAction, type Action } from '@/hooks/useActions';
import { countryCodeToFlag, getGeoDisplayName } from '@/lib/countries';
import { CountryFlag } from '@/components/CountryFlag';
import { DEFAULT_COVER_IMAGE } from '@/lib/defaultActionCovers';
import { formatPledgeAmount } from '@/lib/pledges';
import { cn } from '@/lib/utils';

const ACTION_ICONS = {
  photo: Camera,
  art: Palette,
  info: Info,
  action: Megaphone,
} as const;

function actionNaddr(action: Action): string {
  return nip19.naddrEncode({
    kind: 36639,
    pubkey: action.pubkey,
    identifier: action.id,
  });
}

export function ActionContent({ event, compact = true }: { event: NostrEvent; compact?: boolean }) {
  const action = parseAction(event);
  if (!action) return null;

  const Icon = ACTION_ICONS[action.type];
  const now = Date.now() / 1000;
  const startTime = action.startTime ?? action.createdAt;
  const isUpcoming = startTime > now;
  const isExpired = !!action.deadline && action.deadline <= now;
  const coverImage = action.image ?? DEFAULT_COVER_IMAGE;
  const href = `/${actionNaddr(action)}`;

  return (
    <Link
      to={href}
      className={cn(
        'mt-2 block overflow-hidden rounded-xl border border-border bg-card transition-colors hover:bg-muted/30',
        isExpired && 'opacity-75',
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={cn('relative overflow-hidden bg-muted', compact ? 'h-36' : 'h-56')}>
        <img
          src={coverImage}
          alt={action.title}
          className={cn('h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02]', isExpired && 'grayscale')}
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
        {action.countryCode && (
          <CountryFlag
            code={action.countryCode}
            emoji={countryCodeToFlag(action.countryCode)}
            label={getGeoDisplayName(action.countryCode)}
            className="absolute left-3 top-3 text-2xl drop-shadow-md"
          />
        )}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2 text-white">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-xs font-semibold backdrop-blur-sm">
            <Icon className="size-3.5" />
            Pledge
          </span>
          {isExpired ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-xs font-medium backdrop-blur-sm">
              <Clock className="size-3" /> Expired
            </span>
          ) : isUpcoming ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-xs font-medium backdrop-blur-sm">
              <Clock className="size-3" /> Starts {format(startTime * 1000, 'MMM d')}
            </span>
          ) : action.deadline ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-xs font-medium backdrop-blur-sm">
              <Clock className="size-3" /> Due {format(action.deadline * 1000, 'MMM d')}
            </span>
          ) : null}
        </div>
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-start gap-2">
          <Megaphone className="mt-0.5 size-5 shrink-0 text-primary" />
          <h3 className="line-clamp-2 text-base font-bold leading-tight">{action.title}</h3>
        </div>
        {action.description.trim() && (
          <p className="line-clamp-3 text-sm leading-relaxed text-muted-foreground">
            {action.description}
          </p>
        )}
        <div className="flex items-center gap-2 text-sm">
          <DollarSign className="size-4 shrink-0 text-primary" />
          <span className="font-semibold">
            {formatPledgeAmount(action.bounty)}
          </span>
          {action.countryCode && (
            <>
              <span className="text-muted-foreground/50">·</span>
              <span className="truncate text-xs text-muted-foreground">{getGeoDisplayName(action.countryCode)}</span>
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
