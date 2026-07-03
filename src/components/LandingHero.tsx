import { Link } from 'react-router-dom';

import { AgoraBoltIcon } from '@/components/icons/AgoraBoltIcon';
import { Button } from '@/components/ui/button';
import { useAppContext } from '@/hooks/useAppContext';

interface LandingHeroProps {
  onJoinClick: () => void;
}

export function LandingHero({ onJoinClick }: LandingHeroProps) {
  const { config } = useAppContext();

  return (
    <div className="landing-hero">
      {/* ── Hero Header ── */}
      <div className="px-4 pt-8 pb-6 text-center space-y-4">
        <div className="flex justify-center landing-hero-fade" style={{ animationDelay: '0ms' }}>
          <AgoraBoltIcon className="size-16 drop-shadow-md" />
        </div>

        <div className="space-y-1 landing-hero-fade" style={{ animationDelay: '80ms' }}>
          <h1 className="text-2xl sidebar:text-3xl font-black tracking-tight leading-none uppercase">
            {config.appName}
          </h1>
          <p className="text-[11px] sidebar:text-xs uppercase tracking-wider text-muted-foreground font-semibold">
            Power to the people
          </p>
        </div>

        <div className="flex gap-3 justify-center landing-hero-fade" style={{ animationDelay: '160ms' }}>
          <Button onClick={onJoinClick} className="rounded-full px-6" size="sm">
            Join
          </Button>
          <Button variant="outline" className="rounded-full px-6" size="sm" asChild>
            <Link to="/about#faq">FAQ</Link>
          </Button>
        </div>
      </div>

      {/* ── Divider into feed ── */}
      <div className="border-b border-border" />
    </div>
  );
}
