import { Link } from 'react-router-dom';

import { AgoraLogo } from '@/components/AgoraLogo';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/hooks/useAppContext';

interface LandingHeroProps {
  onLoginClick: () => void;
  onSignupClick: () => void;
}

export function LandingHero({ onLoginClick, onSignupClick }: LandingHeroProps) {
  const { config } = useAppContext();

  return (
    <div className="landing-hero">
      {/* ── Hero Header ── */}
      <div className="px-4 pt-8 pb-6 text-center space-y-4">
        <div className="flex justify-center landing-hero-fade" style={{ animationDelay: '0ms' }}>
          <AgoraLogo size={56} />
        </div>

        <div className="space-y-2 landing-hero-fade" style={{ animationDelay: '80ms' }}>
          <h1 className="text-2xl sidebar:text-3xl font-bold tracking-tight">
            {config.appName}
          </h1>
          <p className="text-muted-foreground text-sm sidebar:text-base max-w-xs mx-auto leading-relaxed">
            Your content. Your vibe. Your&nbsp;rules.
          </p>
        </div>

        <div className="flex gap-3 justify-center landing-hero-fade" style={{ animationDelay: '160ms' }}>
          <Button onClick={onSignupClick} className="rounded-full px-6" size="sm">
            Sign up
          </Button>
          <Button onClick={onLoginClick} variant="outline" className="rounded-full px-6" size="sm">
            Log in
          </Button>
          <Button variant="outline" className="rounded-full px-6" size="sm" asChild>
            <Link to="/help">FAQ</Link>
          </Button>
        </div>
      </div>

      {/* ── Divider into feed ── */}
      <div className="border-b border-border" />
    </div>
  );
}
