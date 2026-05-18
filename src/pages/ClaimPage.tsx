import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { nip19 } from 'nostr-tools';
import { Check, Copy, HandHeart, LogIn, Send, Sparkles } from 'lucide-react';

import { AgoraLogo } from '@/components/AgoraLogo';
import LoginDialog from '@/components/auth/LoginDialog';
import { CampaignCard, CampaignCardSkeleton } from '@/components/CampaignCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAppContext } from '@/hooks/useAppContext';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useToast } from '@/hooks/useToast';

/**
 * Landing page for someone who already has a Nostr account and was told a
 * campaign was started on their behalf. The page splits cleanly:
 *
 * - Logged out: hero + a single "Sign in" button that opens LoginDialog.
 * - Logged in: query for campaigns whose `p` tags include `user.pubkey`
 *   and surface them as a list of CampaignCards, so the user can click
 *   through to view, edit metadata (if they ever take ownership), or just
 *   watch donations arrive.
 *
 * "Claim" is a UI metaphor — there's nothing on-chain to claim, since
 * donations already land in the recipient's Taproot address derived from
 * their pubkey. Filling in a profile is the only real action needed.
 */
export function ClaimPage() {
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const [loginOpen, setLoginOpen] = useState(false);

  useSeoMeta({
    title: `Claim your campaign | ${config.appName}`,
    description:
      'Sign in to see fundraising campaigns started for you on Agora and start receiving Bitcoin donations.',
  });

  return (
    <main className="min-h-dvh bg-gradient-to-br from-primary/10 via-background to-secondary/40">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 lg:py-16">
        <header className="flex items-center justify-between mb-10">
          <Link to="/" className="flex items-center gap-2">
            <AgoraLogo size={36} />
            <span className="font-bold text-lg">{config.appName}</span>
          </Link>
          <Button variant="ghost" asChild>
            <Link to="/receive">Need an account?</Link>
          </Button>
        </header>

        {user ? <ClaimedCampaigns pubkey={user.pubkey} /> : <ClaimLoggedOut onLogin={() => setLoginOpen(true)} />}

        <LoginDialog
          isOpen={loginOpen}
          onClose={() => setLoginOpen(false)}
          onLogin={() => setLoginOpen(false)}
        />
      </div>
    </main>
  );
}

function ClaimLoggedOut({ onLogin }: { onLogin: () => void }) {
  return (
    <section className="space-y-6 text-center sm:text-left">
      <div className="inline-flex items-center gap-2 rounded-full bg-background/70 backdrop-blur px-3 py-1 border border-border text-xs font-medium">
        <Sparkles className="size-3.5 text-primary" />
        Someone started a fundraiser for you
      </div>

      <h1 className="text-3xl sm:text-5xl font-bold tracking-tight leading-[1.1]">
        Sign in to claim your campaign.
      </h1>
      <p className="text-base sm:text-lg text-muted-foreground max-w-2xl">
        Sign in with the Nostr account the fundraiser was set up for, and you'll see every
        campaign that lists you as a beneficiary. Donations are sent directly to your wallet — no
        balance to withdraw, no platform holding your funds.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <Button size="lg" onClick={onLogin} className="rounded-full">
          <LogIn className="size-4 mr-2" />
          Sign in to claim
        </Button>
        <Button size="lg" variant="outline" asChild className="rounded-full">
          <Link to="/receive">I don't have an account yet</Link>
        </Button>
      </div>

      <Card className="mt-4">
        <CardContent className="py-6 px-6 space-y-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <HandHeart className="size-4 text-primary" />
            What "claiming" means
          </h2>
          <p className="text-sm text-muted-foreground">
            There's nothing on-chain to redeem — donations are sent straight to the Bitcoin
            address derived from your Nostr key, whether you've signed in to Agora yet or not.
            Signing in just lets you see the campaign, update your public profile, and confirm
            what's been donated so far.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

function ClaimedCampaigns({ pubkey }: { pubkey: string }) {
  // includeArchived so that even an archived campaign the user is the
  // recipient of still shows up here — they may want to ask the creator
  // to reopen it.
  const { data: campaigns, isLoading } = useCampaigns({
    recipientPubkeys: [pubkey],
    includeArchived: true,
    limit: 60,
  });

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 rounded-full bg-background/70 backdrop-blur px-3 py-1 border border-border text-xs font-medium">
          <Sparkles className="size-3.5 text-primary" />
          You're signed in
        </div>
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-[1.1]">
          Campaigns started for you
        </h1>
        <p className="text-base text-muted-foreground max-w-2xl">
          Any campaign that lists your account as a beneficiary appears here. Donations land
          directly in your Bitcoin wallet — no action required to start receiving.
        </p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <CampaignCardSkeleton />
          <CampaignCardSkeleton />
        </div>
      ) : campaigns && campaigns.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {campaigns.map((c) => (
            <CampaignCard key={c.aTag} campaign={c} />
          ))}
        </div>
      ) : (
        // Empty state. The primary action a freshly-signed-up invitee needs
        // here is sending their new npub back to whoever invited them — once
        // the inviter adds them as a recipient, the campaign will show up on
        // a future visit. The "no campaigns matched" detail copy stays, but
        // demoted below the send-npub card.
        <div className="space-y-5">
          <SendNpubCard pubkey={pubkey} />

          <Card className="border-dashed">
            <CardContent className="py-8 px-6 text-center space-y-3">
              <HandHeart className="size-8 text-muted-foreground/60 mx-auto" />
              <h2 className="text-base font-semibold">Expecting a campaign already?</h2>
              <p className="text-muted-foreground max-w-md mx-auto text-sm">
                We didn't find a campaign that lists this account as a beneficiary. If you were
                told one was set up for you, double-check with the organizer that they used the
                same Nostr public key (npub) you just signed in with.
              </p>
              <div className="pt-1">
                <Button variant="outline" size="sm" asChild>
                  <Link to="/settings/profile">Edit my profile</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="text-sm text-muted-foreground border-t pt-6">
        Next step: complete your{' '}
        <Link to="/settings/profile" className="text-primary hover:underline">
          public profile
        </Link>{' '}
        so donors recognize you.
      </div>
    </section>
  );
}

export default ClaimPage;

/**
 * Surfaced in the empty-state path of {@link ClaimedCampaigns}.
 *
 * When a freshly-signed-up invitee lands here and no campaign yet lists them
 * as a beneficiary, the most likely explanation is that the inviter is still
 * waiting on the invitee's npub to add them. This card hands them a one-tap
 * reply they can paste into whatever channel the original invite came from
 * (Telegram, iMessage, email, etc.), plus a "bare npub" affordance for
 * pasting into an existing thread without the templated framing.
 *
 * Pure UX — no event publishing, no analytics ping back to the inviter. The
 * invitee still has to send the message manually; we just remove the friction
 * of typing or hunting for their npub in settings.
 */
function SendNpubCard({ pubkey }: { pubkey: string }) {
  const { toast } = useToast();
  const npub = useMemo(() => nip19.npubEncode(pubkey), [pubkey]);
  const [copiedNpub, setCopiedNpub] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);

  const replyMessage = `I finished setting up my Agora account! My npub is: ${npub} — you can add me as a beneficiary now.`;

  const writeClipboard = async (
    value: string,
    setMarker: (b: boolean) => void,
    successTitle: string,
  ) => {
    try {
      await navigator.clipboard.writeText(value);
      setMarker(true);
      setTimeout(() => setMarker(false), 1500);
      toast({ title: successTitle });
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Your browser blocked clipboard access. Select and copy the text manually.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className="border-2 border-primary/50 bg-primary/5">
      <CardContent className="py-6 px-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-primary/15 p-2 shrink-0">
            <Send className="size-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <h2 className="text-lg font-semibold">
              Finished setting up? Send your npub to whoever invited you.
            </h2>
            <p className="text-sm text-muted-foreground">
              They need your npub to add you as a beneficiary on the campaign. Once they do, it
              will show up here.
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Your npub
          </span>
          <button
            type="button"
            onClick={() => writeClipboard(npub, setCopiedNpub, 'Npub copied')}
            className="w-full flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2.5 font-mono text-xs text-left hover:bg-muted/60 motion-safe:transition-colors"
            aria-label="Copy npub"
          >
            <span className="break-all">{npub}</span>
            {copiedNpub ? (
              <Check className="size-4 text-green-500 shrink-0" />
            ) : (
              <Copy className="size-4 text-muted-foreground shrink-0" />
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button
            type="button"
            onClick={() => writeClipboard(replyMessage, setCopiedMessage, 'Reply message copied')}
          >
            {copiedMessage ? (
              <Check className="size-4 mr-1.5 text-green-200" />
            ) : (
              <Copy className="size-4 mr-1.5" />
            )}
            Copy reply message
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => writeClipboard(npub, setCopiedNpub, 'Npub copied')}
          >
            <Copy className="size-4 mr-1.5" />
            Copy npub only
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Paste it into the same conversation where they invited you — Telegram, iMessage, email,
          or wherever.
        </p>
      </CardContent>
    </Card>
  );
}
