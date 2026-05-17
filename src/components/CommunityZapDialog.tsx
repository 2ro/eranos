import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { useBitcoinSigner } from '@/hooks/useBitcoinSigner';
import { useBitcoinWallet } from '@/hooks/useBitcoinWallet';
import { useAuthors } from '@/hooks/useAuthors';
import { useCommunityBatchZaps } from '@/hooks/useCommunityBatchZaps';
import { useCommunityOnchainZaps } from '@/hooks/useCommunityOnchainZaps';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useSparkWallet } from '@/hooks/useSparkWallet';
import { useToast } from '@/hooks/useToast';
import { BITCOIN_DUST_LIMIT, estimateFee, fetchUTXOs, getFeeRates, nostrPubkeyToBitcoinAddress } from '@/lib/bitcoin';
import type { CommunityMember, ParsedCommunity } from '@/lib/communityUtils';
import { getDisplayName } from '@/lib/getDisplayName';
import { cn } from '@/lib/utils';
import { notificationSuccess } from '@/lib/haptics';

type RecipientRole = 'founder' | 'moderator' | 'member';
type RecipientStatus = 'ready' | 'loading' | 'missing-ln' | 'missing-btc' | 'removed' | 'self';
type CommunityZapMode = 'lightning' | 'bitcoin';

interface RecipientView {
  pubkey: string;
  role: RecipientRole;
  name: string;
  picture?: string;
  lightningAddress?: string;
  bitcoinAddress?: string;
  authorEvent?: NostrEvent;
  status: RecipientStatus;
}

interface CommunityZapDialogProps {
  community: ParsedCommunity;
  members: CommunityMember[];
  membersLoading: boolean;
  mode?: CommunityZapMode;
  triggerClassName?: string;
  triggerIcon?: ReactNode;
  onZapLaunched?: (details: { count: number; totalSats: number }) => void;
}

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
  mode = 'lightning',
  triggerClassName,
  triggerIcon,
  onZapLaunched,
}: CommunityZapDialogProps) {
  const defaultAmount = mode === 'bitcoin' ? '1000' : '100';
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(defaultAmount);
  const [comment, setComment] = useState(`Zapped the whole ${community.name} community!`);
  const [removedPubkeys, setRemovedPubkeys] = useState<Set<string>>(new Set());
  const [isLaunching, setIsLaunching] = useState(false);

  const { user } = useCurrentUser();
  const sparkWallet = useSparkWallet();
  const bitcoinWallet = useBitcoinWallet();
  const { canSignPsbt } = useBitcoinSigner();
  const { toast } = useToast();
  const { zapCommunity } = useCommunityBatchZaps();
  const { zapCommunityOnchain } = useCommunityOnchainZaps();

  const pubkeys = useMemo(() => members.map((member) => member.pubkey), [members]);
  const authors = useAuthors(pubkeys);
  const senderBitcoinAddress = user ? nostrPubkeyToBitcoinAddress(user.pubkey) : '';

  const { data: bitcoinUtxos, isLoading: isLoadingBitcoinUtxos } = useQuery({
    queryKey: ['bitcoin-utxos', senderBitcoinAddress],
    queryFn: () => fetchUTXOs(senderBitcoinAddress),
    enabled: open && mode === 'bitcoin' && !!senderBitcoinAddress,
    staleTime: 30_000,
  });

  const { data: feeRates, isLoading: isLoadingFeeRates } = useQuery({
    queryKey: ['bitcoin-fee-rates'],
    queryFn: getFeeRates,
    enabled: open && mode === 'bitcoin',
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!open) return;
    setRemovedPubkeys(new Set());
    setAmount(defaultAmount);
    setComment(`Zapped the whole ${community.name} community!`);
  }, [open, community.name, defaultAmount]);

  const recipients = useMemo<RecipientView[]>(() => {
    return members.map((member) => {
      const author = authors.data?.get(member.pubkey);
      const metadata: NostrMetadata | undefined = author?.metadata;
      const lightningAddress = metadata?.lud16 || metadata?.lud06;
      const bitcoinAddress = nostrPubkeyToBitcoinAddress(member.pubkey);
      const removed = removedPubkeys.has(member.pubkey);
      const status: RecipientStatus = (() => {
        if (user?.pubkey === member.pubkey) return 'self';
        if (removed) return 'removed';
        if (mode === 'bitcoin') return bitcoinAddress ? 'ready' : 'missing-btc';
        if (authors.isLoading && !author?.event) return 'loading';
        return lightningAddress && author?.event ? 'ready' : 'missing-ln';
      })();

      return {
        pubkey: member.pubkey,
        role: memberRole(member, community),
        name: getDisplayName(metadata, member.pubkey),
        picture: metadata?.picture,
        lightningAddress,
        bitcoinAddress,
        authorEvent: author?.event,
        status,
      };
    });
  }, [authors.data, authors.isLoading, community, members, mode, removedPubkeys, user?.pubkey]);

  const amountSats = parseInt(amount, 10);
  const selectedRecipients = recipients.filter((recipient) => (
    mode === 'lightning'
      ? recipient.status === 'ready' && recipient.authorEvent
      : recipient.status === 'ready' && recipient.bitcoinAddress
  ));
  const skippedCount = recipients.filter((recipient) => (
    recipient.status === 'missing-ln' || recipient.status === 'missing-btc' || recipient.status === 'self'
  )).length;
  const removedCount = recipients.filter((recipient) => recipient.status === 'removed').length;
  const totalSats = Number.isFinite(amountSats) && amountSats > 0
    ? amountSats * selectedRecipients.length
    : 0;
  const estimatedBitcoinFee = mode === 'bitcoin' && bitcoinUtxos?.length && feeRates && selectedRecipients.length > 0
    ? estimateFee(bitcoinUtxos.length, selectedRecipients.length + 1, feeRates.halfHourFee)
    : 0;
  const bitcoinTotalSats = totalSats + estimatedBitcoinFee;
  const bitcoinBalance = bitcoinWallet.addressData?.totalBalance ?? 0;
  const walletReady = mode === 'lightning'
    ? sparkWallet.isEnabled && sparkWallet.isInitialized
    : !!user && canSignPsbt && !!bitcoinWallet.addressData && !!bitcoinUtxos?.length && !!feeRates;
  const canSubmit = !!user
    && walletReady
    && selectedRecipients.length > 0
    && Number.isFinite(amountSats)
    && amountSats > 0
    && (mode === 'lightning' || amountSats >= BITCOIN_DUST_LIMIT)
    && (mode === 'lightning' ? sparkWallet.balance >= totalSats : bitcoinBalance >= bitcoinTotalSats)
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
      toast({
        title: 'Wallet required',
        description: mode === 'lightning'
          ? 'Set up your Agora Wallet to zap a community.'
          : 'Log in with a Bitcoin-capable signer and fund your Bitcoin wallet.',
        variant: 'destructive',
      });
      return;
    }
    if (!Number.isFinite(amountSats) || amountSats <= 0) {
      toast({ title: 'Invalid amount', description: 'Enter a positive amount in sats.', variant: 'destructive' });
      return;
    }
    if (mode === 'bitcoin' && amountSats < BITCOIN_DUST_LIMIT) {
      toast({
        title: 'Amount too small',
        description: `On-chain Bitcoin outputs must be at least ${BITCOIN_DUST_LIMIT.toLocaleString()} sats.`,
        variant: 'destructive',
      });
      return;
    }
    if (selectedRecipients.length === 0) {
      toast({ title: 'No recipients', description: 'No selected members can receive zaps.', variant: 'destructive' });
      return;
    }
    if (mode === 'lightning' && sparkWallet.balance < totalSats) {
      toast({
        title: 'Insufficient balance',
        description: `You need at least ${totalSats.toLocaleString()} sats before Lightning fees.`,
        variant: 'destructive',
      });
      return;
    }
    if (mode === 'bitcoin' && bitcoinBalance < bitcoinTotalSats) {
      toast({
        title: 'Insufficient balance',
        description: `You need about ${bitcoinTotalSats.toLocaleString()} sats including miner fees.`,
        variant: 'destructive',
      });
      return;
    }

    const lightningRecipients = selectedRecipients
      .filter((recipient): recipient is RecipientView & { authorEvent: NostrEvent } => !!recipient.authorEvent)
      .map((recipient) => ({ pubkey: recipient.pubkey, authorEvent: recipient.authorEvent }));
    const bitcoinRecipients = selectedRecipients.map((recipient) => ({ pubkey: recipient.pubkey }));
    const launchedCount = mode === 'lightning' ? lightningRecipients.length : bitcoinRecipients.length;
    const launchedTotal = mode === 'lightning' ? totalSats : bitcoinTotalSats;

    setIsLaunching(true);
    setOpen(false);
    onZapLaunched?.({ count: launchedCount, totalSats: launchedTotal });
    toast({
      title: mode === 'lightning' ? `Zapping ${launchedCount} members...` : `Broadcasting Bitcoin zap...`,
      description: mode === 'lightning'
        ? `${totalSats.toLocaleString()} sats are on the way.`
        : `${totalSats.toLocaleString()} sats plus miner fees are being sent.`,
    });

    const zapPromise = mode === 'lightning'
      ? zapCommunity({ community, recipients: lightningRecipients, amountSats, comment })
      : zapCommunityOnchain({ community, recipients: bitcoinRecipients, amountSats, comment });

    void zapPromise.then((summary) => {
      setIsLaunching(false);
      if ('failed' in summary && summary.failed.length > 0) {
        toast({
          title: `Zapped ${summary.succeeded} of ${summary.attempted} members`,
          description: `${summary.failed.length} zap${summary.failed.length === 1 ? '' : 's'} failed.`,
          variant: summary.succeeded > 0 ? 'default' : 'destructive',
        });
        return;
      }
      if ('publishFailed' in summary && summary.publishFailed.length > 0) {
        toast({
          title: `Bitcoin sent, ${summary.published} of ${summary.attempted} receipts published`,
          description: `Broadcast tx ${summary.txid.slice(0, 12)}... but ${summary.publishFailed.length} Nostr event${summary.publishFailed.length === 1 ? '' : 's'} failed.`,
          variant: 'destructive',
        });
        return;
      }
      notificationSuccess();
      toast({
        title: mode === 'lightning'
          ? `Zapped ${summary.succeeded} members`
          : `Bitcoin zapped ${summary.published} members`,
        description: mode === 'lightning'
          ? `${summary.totalSats.toLocaleString()} sats sent to ${community.name}.`
          : `${summary.totalSats.toLocaleString()} sats sent in tx ${summary.txid.slice(0, 12)}...`,
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
          aria-label={mode === 'lightning' ? 'Zap community' : 'Bitcoin zap community'}
          title={mode === 'lightning' ? 'Zap community' : 'Bitcoin zap community'}
        >
          {triggerIcon ?? <Zap className="size-5" />}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[88vh] flex flex-col overflow-hidden p-0 gap-0 [&>button]:top-3 [&>button]:right-3">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Zap className="size-5 text-amber-500" />
            {mode === 'lightning' ? 'Zap Community' : 'Bitcoin Zap Community'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'lightning'
              ? 'Send a real Nostr zap to each selected active member.'
              : 'Send one on-chain Bitcoin transaction to all selected members.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="px-5 py-4 space-y-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="community-zap-amount">Amount per member</Label>
                  <div className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                    Balance <span className="tabular-nums text-foreground">
                      {(mode === 'lightning' ? sparkWallet.balance : bitcoinBalance).toLocaleString()} sats
                    </span>
                  </div>
                </div>
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
                {mode === 'lightning'
                  ? 'Set up and unlock your Agora Wallet before zapping the community.'
                  : 'Log in with a Bitcoin-capable signer and fund your Bitcoin wallet before zapping the community.'}
              </div>
            )}
            {mode === 'bitcoin' && walletReady && (
              <div className="rounded-2xl border border-border bg-muted/40 p-3 text-sm">
                {Number.isFinite(amountSats) && amountSats > 0 && amountSats < BITCOIN_DUST_LIMIT && (
                  <p className="mb-2 text-xs text-destructive">
                    On-chain outputs must be at least {BITCOIN_DUST_LIMIT.toLocaleString()} sats per member.
                  </p>
                )}
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Estimated miner fee</span>
                  <span className="font-medium tabular-nums">{estimatedBitcoinFee.toLocaleString()} sats</span>
                </div>
                <div className="mt-1 flex justify-between gap-3">
                  <span className="text-muted-foreground">Total debit</span>
                  <span className="font-medium tabular-nums">{bitcoinTotalSats.toLocaleString()} sats</span>
                </div>
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
              {mode === 'bitcoin' && (isLoadingBitcoinUtxos || isLoadingFeeRates) ? (
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              ) : null}
            </div>

            <div className="divide-y divide-border">
              {recipients.map((recipient) => (
                <RecipientRow
                  key={recipient.pubkey}
                  recipient={recipient}
                  amountSats={amountSats}
                  mode={mode}
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
            totalSats={mode === 'lightning' ? totalSats : bitcoinTotalSats}
            mode={mode}
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
  mode,
  onComplete,
}: {
  disabled: boolean;
  isLaunching: boolean;
  selectedCount: number;
  totalSats: number;
  mode: CommunityZapMode;
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

  const actionLabel = mode === 'lightning' ? 'zap' : 'send';
  const holdingLabel = mode === 'lightning' ? 'Keep holding to zap...' : 'Keep holding to send...';

  return (
    <Button
      type="button"
      variant="secondary"
      className="relative h-12 w-full overflow-hidden rounded-full border border-primary bg-primary text-primary-foreground hover:bg-primary"
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
        className="absolute inset-0 origin-left rounded-full bg-background/25 transition-transform duration-75 ease-linear"
        style={{ transform: `scaleX(${progress})` }}
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
          holdingLabel
        ) : (
          `Hold to ${actionLabel} ${selectedCount} · ${totalSats.toLocaleString()} sats`
        )}
      </span>
    </Button>
  );
}

function RecipientRow({
  recipient,
  amountSats,
  mode,
  onRemove,
  onRestore,
}: {
  recipient: RecipientView;
  amountSats: number;
  mode: CommunityZapMode;
  onRemove: () => void;
  onRestore: () => void;
}) {
  const isReady = recipient.status === 'ready';
  const isRemoved = recipient.status === 'removed';
  const isUnavailable = recipient.status === 'missing-ln'
    || recipient.status === 'missing-btc'
    || recipient.status === 'loading'
    || recipient.status === 'self';

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
            : mode === 'bitcoin' && recipient.bitcoinAddress
            ? shortAddress(recipient.bitcoinAddress)
            : mode === 'bitcoin'
            ? 'No Bitcoin address · skipped'
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
