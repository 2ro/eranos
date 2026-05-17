import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Plus, Wallet, X, Zap } from 'lucide-react';
import type { NostrEvent, NostrMetadata } from '@nostrify/nostrify';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuthors } from '@/hooks/useAuthors';
import { useCommunityBatchZaps } from '@/hooks/useCommunityBatchZaps';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useSparkWallet } from '@/hooks/useSparkWallet';
import { useToast } from '@/hooks/useToast';
import type { CommunityMember, ParsedCommunity } from '@/lib/communityUtils';
import { getDisplayName } from '@/lib/getDisplayName';
import { cn } from '@/lib/utils';
import { notificationSuccess } from '@/lib/haptics';

type RecipientRole = 'founder' | 'moderator' | 'member';
type RecipientStatus = 'ready' | 'loading' | 'missing-ln' | 'removed' | 'self';

interface RecipientView {
  pubkey: string;
  role: RecipientRole;
  name: string;
  picture?: string;
  lightningAddress?: string;
  authorEvent?: NostrEvent;
  status: RecipientStatus;
}

interface CommunityZapDialogProps {
  community: ParsedCommunity;
  members: CommunityMember[];
  membersLoading: boolean;
  triggerClassName?: string;
  onZapLaunched?: (details: { count: number; totalSats: number }) => void;
}

const PRESET_AMOUNTS = [21, 100, 500, 1000];

function roleLabel(role: RecipientRole): string {
  switch (role) {
    case 'founder': return 'Founder';
    case 'moderator': return 'Moderator';
    case 'member': return 'Member';
  }
}

function memberRole(member: CommunityMember, community: ParsedCommunity): RecipientRole {
  if (member.pubkey === community.founderPubkey) return 'founder';
  if (member.rank === 0) return 'moderator';
  return 'member';
}

function shortAddress(value: string): string {
  if (value.length <= 42) return value;
  return `${value.slice(0, 20)}...${value.slice(-16)}`;
}

export function CommunityZapDialog({
  community,
  members,
  membersLoading,
  triggerClassName,
  onZapLaunched,
}: CommunityZapDialogProps) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('100');
  const [comment, setComment] = useState(`Zapped the whole ${community.name} community!`);
  const [removedPubkeys, setRemovedPubkeys] = useState<Set<string>>(new Set());
  const [isLaunching, setIsLaunching] = useState(false);

  const { user } = useCurrentUser();
  const sparkWallet = useSparkWallet();
  const { toast } = useToast();
  const { zapCommunity } = useCommunityBatchZaps();

  const pubkeys = useMemo(() => members.map((member) => member.pubkey), [members]);
  const authors = useAuthors(pubkeys);

  useEffect(() => {
    if (!open) return;
    setRemovedPubkeys(new Set());
    setComment(`Zapped the whole ${community.name} community!`);
  }, [open, community.name]);

  const recipients = useMemo<RecipientView[]>(() => {
    return members.map((member) => {
      const author = authors.data?.get(member.pubkey);
      const metadata: NostrMetadata | undefined = author?.metadata;
      const lightningAddress = metadata?.lud16 || metadata?.lud06;
      const removed = removedPubkeys.has(member.pubkey);
      const status: RecipientStatus = user?.pubkey === member.pubkey
        ? 'self'
        : removed
        ? 'removed'
        : authors.isLoading && !author?.event
        ? 'loading'
        : lightningAddress && author?.event
        ? 'ready'
        : 'missing-ln';

      return {
        pubkey: member.pubkey,
        role: memberRole(member, community),
        name: getDisplayName(metadata, member.pubkey),
        picture: metadata?.picture,
        lightningAddress,
        authorEvent: author?.event,
        status,
      };
    });
  }, [authors.data, authors.isLoading, community, members, removedPubkeys, user?.pubkey]);

  const amountSats = parseInt(amount, 10);
  const selectedRecipients = recipients.filter(
    (recipient) => recipient.status === 'ready' && recipient.authorEvent,
  );
  const skippedCount = recipients.filter((recipient) => recipient.status === 'missing-ln' || recipient.status === 'self').length;
  const removedCount = recipients.filter((recipient) => recipient.status === 'removed').length;
  const totalSats = Number.isFinite(amountSats) && amountSats > 0
    ? amountSats * selectedRecipients.length
    : 0;
  const walletReady = sparkWallet.isEnabled && sparkWallet.isInitialized;
  const canSubmit = !!user
    && walletReady
    && selectedRecipients.length > 0
    && Number.isFinite(amountSats)
    && amountSats > 0
    && sparkWallet.balance >= totalSats
    && !isLaunching;

  const toggleRemoved = (pubkey: string, remove: boolean) => {
    setRemovedPubkeys((prev) => {
      const next = new Set(prev);
      if (remove) next.add(pubkey);
      else next.delete(pubkey);
      return next;
    });
  };

  const handleSubmit = () => {
    if (!user) {
      toast({ title: 'Login required', description: 'Log in to zap this community.', variant: 'destructive' });
      return;
    }
    if (!walletReady) {
      toast({ title: 'Wallet required', description: 'Set up your Agora Wallet to zap a community.', variant: 'destructive' });
      return;
    }
    if (!Number.isFinite(amountSats) || amountSats <= 0) {
      toast({ title: 'Invalid amount', description: 'Enter a positive amount in sats.', variant: 'destructive' });
      return;
    }
    if (selectedRecipients.length === 0) {
      toast({ title: 'No recipients', description: 'No selected members can receive zaps.', variant: 'destructive' });
      return;
    }
    if (sparkWallet.balance < totalSats) {
      toast({
        title: 'Insufficient balance',
        description: `You need at least ${totalSats.toLocaleString()} sats before Lightning fees.`,
        variant: 'destructive',
      });
      return;
    }

    const batchRecipients = selectedRecipients
      .filter((recipient): recipient is RecipientView & { authorEvent: NostrEvent } => !!recipient.authorEvent)
      .map((recipient) => ({ pubkey: recipient.pubkey, authorEvent: recipient.authorEvent }));

    setIsLaunching(true);
    setOpen(false);
    onZapLaunched?.({ count: batchRecipients.length, totalSats });
    toast({
      title: `Zapping ${batchRecipients.length} members...`,
      description: `${totalSats.toLocaleString()} sats are on the way.`,
    });

    void zapCommunity({
      community,
      recipients: batchRecipients,
      amountSats,
      comment,
    }).then((summary) => {
      setIsLaunching(false);
      if (summary.failed.length > 0) {
        toast({
          title: `Zapped ${summary.succeeded} of ${summary.attempted} members`,
          description: `${summary.failed.length} zap${summary.failed.length === 1 ? '' : 's'} failed.`,
          variant: summary.succeeded > 0 ? 'default' : 'destructive',
        });
        return;
      }
      notificationSuccess();
      toast({
        title: `Zapped ${summary.succeeded} members`,
        description: `${summary.totalSats.toLocaleString()} sats sent to ${community.name}.`,
      });
    }).catch((error) => {
      setIsLaunching(false);
      const message = error instanceof Error ? error.message : 'Community zap failed.';
      toast({ title: 'Community zap failed', description: message, variant: 'destructive' });
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center justify-center',
            triggerClassName ?? 'p-2 rounded-full shadow-md bg-white text-black hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors',
          )}
          aria-label="Zap community"
          title="Zap community"
        >
          <Zap className="size-5" />
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[88vh] flex flex-col overflow-hidden p-0 gap-0 [&>button]:top-3 [&>button]:right-3">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Zap className="size-5 text-amber-500" />
            Zap Community
          </DialogTitle>
          <DialogDescription>
            Send a real Nostr zap to each selected active member.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-4 space-y-4">
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 space-y-3">
              <div className="space-y-2">
                <Label htmlFor="community-zap-amount">Amount per member</Label>
                <div className="relative">
                  <Input
                    id="community-zap-amount"
                    type="number"
                    inputMode="numeric"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    onWheel={(e) => (e.target as HTMLInputElement).blur()}
                    className="h-12 rounded-full bg-background/90 pr-14 text-center text-lg font-semibold"
                  />
                  <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    sats
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                {PRESET_AMOUNTS.map((preset) => (
                  <Button
                    key={preset}
                    type="button"
                    variant={amount === String(preset) ? 'default' : 'secondary'}
                    size="sm"
                    className="rounded-full"
                    onClick={() => setAmount(String(preset))}
                  >
                    {preset >= 1000 ? `${preset / 1000}k` : preset}
                  </Button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-background/70 p-3">
                  <p className="text-muted-foreground">Selected</p>
                  <p className="text-lg font-bold tabular-nums">{selectedRecipients.length}</p>
                </div>
                <div className="rounded-xl bg-background/70 p-3">
                  <p className="text-muted-foreground">Total</p>
                  <p className="text-lg font-bold tabular-nums">{totalSats.toLocaleString()} sats</p>
                </div>
                <div className="col-span-2 rounded-xl bg-background/70 p-3">
                  <p className="flex items-center gap-1.5 text-muted-foreground">
                    <Wallet className="size-3.5" />
                    Wallet balance
                  </p>
                  <p className="text-lg font-bold tabular-nums">{sparkWallet.balance.toLocaleString()} sats</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="community-zap-comment">Comment</Label>
              <Textarea
                id="community-zap-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                className="resize-none rounded-2xl"
              />
            </div>

            {!walletReady && (
              <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <Wallet className="size-4 mt-0.5 shrink-0" />
                Set up and unlock your Agora Wallet before zapping the community.
              </div>
            )}
          </div>

          <div className="border-t border-border">
            <div className="flex items-center justify-between px-5 py-3">
              <div>
                <h3 className="text-sm font-semibold">Recipients</h3>
                <p className="text-xs text-muted-foreground">
                  {selectedRecipients.length} selected
                  {removedCount > 0 ? ` · ${removedCount} removed` : ''}
                  {skippedCount > 0 ? ` · ${skippedCount} skipped` : ''}
                </p>
              </div>
              {membersLoading || authors.isLoading ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : null}
            </div>

            <div className="divide-y divide-border">
              {recipients.map((recipient) => (
                <RecipientRow
                  key={recipient.pubkey}
                  recipient={recipient}
                  amountSats={amountSats}
                  onRemove={() => toggleRemoved(recipient.pubkey, true)}
                  onRestore={() => toggleRemoved(recipient.pubkey, false)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="border-t border-border p-4 shrink-0">
          <HoldToZapButton
            disabled={!canSubmit}
            isLaunching={isLaunching}
            selectedCount={selectedRecipients.length}
            totalSats={totalSats}
            onComplete={handleSubmit}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

const HOLD_DURATION_MS = 3000;

function HoldToZapButton({
  disabled,
  isLaunching,
  selectedCount,
  totalSats,
  onComplete,
}: {
  disabled: boolean;
  isLaunching: boolean;
  selectedCount: number;
  totalSats: number;
  onComplete: () => void;
}) {
  const [progress, setProgress] = useState(0);
  const [holding, setHolding] = useState(false);
  const rafRef = useRef(0);
  const startedAtRef = useRef(0);
  const completedRef = useRef(false);

  const cancelHold = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    startedAtRef.current = 0;
    completedRef.current = false;
    setHolding(false);
    setProgress(0);
  };

  const tick = () => {
    const elapsed = performance.now() - startedAtRef.current;
    const nextProgress = Math.min(1, elapsed / HOLD_DURATION_MS);
    setProgress(nextProgress);
    if (nextProgress >= 1) {
      completedRef.current = true;
      setHolding(false);
      setProgress(0);
      onComplete();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  const startHold = () => {
    if (disabled || isLaunching || holding) return;
    completedRef.current = false;
    startedAtRef.current = performance.now();
    setHolding(true);
    setProgress(0);
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    if (disabled || isLaunching) cancelHold();
  }, [disabled, isLaunching]);

  const remainingSeconds = Math.max(0, Math.ceil((HOLD_DURATION_MS * (1 - progress)) / 1000));
  const progressPercent = progress * 100;

  return (
    <Button
      type="button"
      variant="secondary"
      className="relative h-12 w-full overflow-hidden rounded-full border border-amber-500/35 bg-muted text-foreground hover:bg-muted"
      disabled={disabled}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        startHold();
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        if (!completedRef.current) cancelHold();
      }}
      onPointerCancel={cancelHold}
      onKeyDown={(event) => {
        if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
          event.preventDefault();
          startHold();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          if (!completedRef.current) cancelHold();
        }
      }}
      aria-label={`Hold for 3 seconds to zap ${selectedCount} members with ${totalSats.toLocaleString()} sats total`}
    >
      <span
        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-amber-300 to-amber-500 transition-[width] duration-75 ease-linear"
        style={{ width: `${progressPercent}%` }}
        aria-hidden="true"
      />
      <span className="absolute inset-0 rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]" aria-hidden="true" />
      <span className="relative z-10 flex items-center justify-center mix-blend-normal">
        {isLaunching ? (
          <>
            <Loader2 className="size-4 mr-2 animate-spin" />
            Launching...
          </>
        ) : holding ? (
          <>
            <Zap className="size-4 mr-2" />
            Keep holding... {remainingSeconds}s
          </>
        ) : (
          <>
            <Zap className="size-4 mr-2" />
            Hold to zap {selectedCount} · {totalSats.toLocaleString()} sats
          </>
        )}
      </span>
    </Button>
  );
}

function RecipientRow({
  recipient,
  amountSats,
  onRemove,
  onRestore,
}: {
  recipient: RecipientView;
  amountSats: number;
  onRemove: () => void;
  onRestore: () => void;
}) {
  const isReady = recipient.status === 'ready';
  const isRemoved = recipient.status === 'removed';
  const isUnavailable = recipient.status === 'missing-ln' || recipient.status === 'loading' || recipient.status === 'self';

  return (
    <div className={cn('flex items-center gap-3 px-5 py-3', (isRemoved || isUnavailable) && 'opacity-55')}>
      <Avatar className="size-10 shrink-0">
        <AvatarImage src={recipient.picture} />
        <AvatarFallback>{recipient.name[0]?.toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <p className={cn('font-medium truncate', isRemoved && 'line-through')}>{recipient.name}</p>
          <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0">
            {roleLabel(recipient.role)}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {recipient.status === 'loading'
            ? 'Loading profile...'
            : recipient.status === 'self'
            ? 'You · skipped'
            : recipient.lightningAddress
            ? shortAddress(recipient.lightningAddress)
            : 'No Lightning address · skipped'}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isReady && Number.isFinite(amountSats) && amountSats > 0 && (
          <span className="hidden text-xs font-medium tabular-nums text-muted-foreground sm:inline">
            {amountSats.toLocaleString()} sats
          </span>
        )}
        {isReady ? (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Remove ${recipient.name} from this zap`}
          >
            <X className="size-4" />
          </button>
        ) : isRemoved ? (
          <button
            type="button"
            onClick={onRestore}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`Add ${recipient.name} back to this zap`}
          >
            <Plus className="size-4" />
          </button>
        ) : (
          <Check className="size-4 text-muted-foreground/50" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
