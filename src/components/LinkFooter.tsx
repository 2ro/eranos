import { Link } from 'react-router-dom';
import { Info, BookOpen, Shield, Code, ScrollText } from 'lucide-react';

import { AGORA_ORIGIN } from '@/lib/appUrls';
import { TEAM_URL } from '@/lib/agoraDefaults';

interface LinkFooterProps {
  /** Optional callback fired when an internal (React Router) link is clicked. */
  onNavigate?: () => void;
}

const chipClass =
  'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors';
const iconClass = 'size-3 shrink-0';

/** Shared footer links used in both sidebars. */
export function LinkFooter({ onNavigate }: LinkFooterProps) {
  return (
    <footer className="mt-auto pt-3 pb-3 -mx-1 sidebar:bg-background/85 sidebar:rounded-xl sidebar:p-3">
      <nav className="flex items-center justify-center gap-0.5 flex-wrap" aria-label="Footer links">
        <a
          href={AGORA_ORIGIN}
          className={chipClass}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Info className={iconClass} />
          About
        </a>

        <a
          href={AGORA_ORIGIN}
          className={chipClass}
          target="_blank"
          rel="noopener noreferrer"
        >
          <BookOpen className={iconClass} />
          Docs
        </a>

        <Link to="/privacy" className={chipClass} onClick={onNavigate}>
          <Shield className={iconClass} />
          Privacy
        </Link>

        <Link to="/safety" className={chipClass} onClick={onNavigate}>
          <Shield className={iconClass} />
          Safety
        </Link>

        <a
          href={TEAM_URL}
          className={chipClass}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Code className={iconClass} />
          Source
        </a>

        <Link to="/changelog" className={chipClass} onClick={onNavigate}>
          <ScrollText className={iconClass} />
          Changelog
        </Link>

      </nav>
    </footer>
  );
}
