import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSeoMeta } from '@unhead/react';
import { HandHeart, KeyRound, Sparkles, Wallet, Zap } from 'lucide-react';

import { AgoraLogo } from '@/components/AgoraLogo';
import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAppContext } from '@/hooks/useAppContext';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useOnboarding } from '@/hooks/useOnboarding';

/**
 * Landing page reached from invite links like `https://agora.spot/receive`.
 *
 * Target audience: someone who has been told "I'm starting a fundraiser for
 * you on Agora" but doesn't have a Nostr account yet. The page's job is to
 * get them past account creation as fast as possible.
 *
 * Logged-out: hero + signup CTA (which opens the onboarding flow). A small
 * "already have a Nostr account?" footer routes them to the standard login.
 *
 * Already logged in: confirms they're set up and points them at their
 * profile + a link to claim any pending campaigns.
 */
export function ReceivePage() {
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { startSignup } = useOnboarding();
  const navigate = useNavigate();

  useSeoMeta({
    title: `Receive donations on ${config.appName}`,
    description:
      'Create a free account and start receiving Bitcoin donations directly to your wallet. No middleman, no chargebacks.',
  });

  // Once the user has finished signing up / logging in, drop them at /claim
  // so they can see any campaigns that were set up for them in advance.
  useEffect(() => {
    if (user) {
      navigate('/claim', { replace: true });
    }
  }, [user, navigate]);

  return (
    <main className="min-h-dvh bg-gradient-to-br from-primary/10 via-background to-secondary/40">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10 lg:py-16">
        <header className="flex items-center justify-between mb-10">
          <Link to="/" className="flex items-center gap-2">
            <AgoraLogo size={36} />
            <span className="font-bold text-lg">{config.appName}</span>
          </Link>
          <LoginArea className="max-w-[220px]" />
        </header>

        <section className="space-y-6 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 rounded-full bg-background/70 backdrop-blur px-3 py-1 border border-border text-xs font-medium">
            <Sparkles className="size-3.5 text-primary" />
            Someone wants to fundraise for you
          </div>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight leading-[1.1]">
            Get paid in Bitcoin,{' '}
            <span className="text-primary">straight to your wallet.</span>
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl">
            Agora is a permissionless fundraising platform built on Nostr and Bitcoin. Create a
            free account in under a minute, and donations land directly in your wallet — no
            middleman, no chargebacks, no platform freezing your funds.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button size="lg" onClick={startSignup} className="rounded-full">
              <KeyRound className="size-4 mr-2" />
              Create my account
            </Button>
            <Button
              size="lg"
              variant="outline"
              asChild
              className="rounded-full"
            >
              <Link to="/claim">I already have a Nostr account</Link>
            </Button>
          </div>
        </section>

        <section className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FeatureCard
            icon={<KeyRound className="size-5 text-primary" />}
            title="Own your account"
            description="Your Nostr key is yours forever. No company can ban or freeze you."
          />
          <FeatureCard
            icon={<Wallet className="size-5 text-primary" />}
            title="Direct to your wallet"
            description="Donations settle on-chain to a Bitcoin address derived from your key."
          />
          <FeatureCard
            icon={<Zap className="size-5 text-primary" />}
            title="Counted on Agora"
            description="Each donation publishes a receipt so it shows up on your campaign's progress."
          />
        </section>

        <section className="mt-10">
          <Card>
            <CardContent className="py-6 px-6 space-y-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <HandHeart className="size-5 text-primary" />
                How it works
              </h2>
              <ol className="space-y-2.5 text-sm text-muted-foreground list-none">
                <Step n={1}>
                  Create your free Nostr account (your key is generated locally and never leaves
                  your device).
                </Step>
                <Step n={2}>
                  Fill in a name, photo, and short bio so donors recognize you.
                </Step>
                <Step n={3}>
                  Visit <code className="font-mono text-xs">/claim</code> to find the campaign
                  that was started for you and start receiving donations.
                </Step>
              </ol>
            </CardContent>
          </Card>
        </section>

        <footer className="mt-10 text-center text-xs text-muted-foreground">
          Already have a Nostr key (npub or nsec)?{' '}
          <Link to="/claim" className="text-primary hover:underline">
            Sign in to claim your campaign
          </Link>
        </footer>
      </div>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardContent className="py-5 px-5 space-y-2">
        <div className="size-9 rounded-full bg-primary/10 flex items-center justify-center">
          {icon}
        </div>
        <h3 className="font-semibold text-sm">{title}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </CardContent>
    </Card>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 size-6 rounded-full bg-primary/15 text-primary text-xs font-semibold flex items-center justify-center">
        {n}
      </span>
      <span className="pt-0.5 text-foreground/90">{children}</span>
    </li>
  );
}

export default ReceivePage;
