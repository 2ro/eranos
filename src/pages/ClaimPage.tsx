import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { HandHeart, LogIn, Sparkles } from 'lucide-react';

import { AgoraLogo } from '@/components/AgoraLogo';
import LoginDialog from '@/components/auth/LoginDialog';
import { CampaignCard, CampaignCardSkeleton } from '@/components/CampaignCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAppContext } from '@/hooks/useAppContext';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useCurrentUser } from '@/hooks/useCurrentUser';

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
        <Card className="border-dashed">
          <CardContent className="py-12 px-8 text-center space-y-3">
            <HandHeart className="size-10 text-muted-foreground/60 mx-auto" />
            <h2 className="text-lg font-semibold">No campaigns found yet</h2>
            <p className="text-muted-foreground max-w-md mx-auto text-sm">
              We didn't find a campaign that lists this account as a beneficiary. If you were
              expecting one, double-check with the organizer that they used the same Nostr public
              key (npub) you just signed in with.
            </p>
            <div className="pt-2">
              <Button variant="outline" asChild>
                <Link to="/settings/profile">Edit my profile</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
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
