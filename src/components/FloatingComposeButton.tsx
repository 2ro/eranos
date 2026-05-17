import { lazy, Suspense, useState } from 'react';
import { Plus, Construction } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { FabButton } from '@/components/FabButton';
import type { FabMenuItem } from '@/contexts/LayoutContext';

// Lazy-load the compose modal (pulls in emoji-mart ~620K)
const ReplyComposeModal = lazy(() => import('@/components/ReplyComposeModal').then(m => ({ default: m.ReplyComposeModal })));



interface FloatingComposeButtonProps {
  /** The Nostr event kind this FAB creates. kind=1 opens compose; others show "Coming soon". */
  kind?: number;
  /** If set, the FAB navigates to this URL instead of opening a dialog. */
  href?: string;
  /** If set, overrides the default FAB click behavior. */
  onFabClick?: () => void;
  /** If set, overrides the default Plus icon. */
  icon?: React.ReactNode;
  /** If set, the FAB opens an anchored popover with these items. */
  menu?: FabMenuItem[];
}

export function FloatingComposeButton({ kind = 1, href, onFabClick, icon, menu }: FloatingComposeButtonProps) {
  const { user } = useCurrentUser();
  const navigate = useNavigate();
  const [composeOpen, setComposeOpen] = useState(false);
  const [comingSoonOpen, setComingSoonOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  if (!user) {
    return null;
  }

  const renderedIcon = icon ?? <Plus strokeWidth={4} size={16} />;

  // ── Menu mode — anchor a Popover to the FAB itself ────────────────────────
  if (menu && menu.length > 0) {
    return (
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Add"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className="relative size-16 transition-transform hover:scale-105 active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
            style={{ filter: 'drop-shadow(0 2px 8px hsl(var(--primary) / 0.25))' }}
          >
            <div className="absolute inset-0 bg-primary rounded-full" />
            <span className="absolute inset-0 flex items-center justify-center text-primary-foreground">
              {renderedIcon}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="end"
          sideOffset={12}
          className="w-auto min-w-[180px] p-1.5 rounded-2xl"
        >
          <div role="menu" aria-label="Add" className="flex flex-col gap-0.5">
            {menu.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  item.onSelect();
                }}
                className="group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-foreground hover:bg-primary hover:text-primary-foreground focus-visible:bg-primary focus-visible:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors text-left"
              >
                {item.icon && (
                  <span className="text-primary shrink-0 group-hover:text-primary-foreground group-focus-visible:text-primary-foreground transition-colors">
                    {item.icon}
                  </span>
                )}
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  const handleClick = () => {
    if (onFabClick) {
      onFabClick();
    } else if (href) {
      navigate(href);
    } else if (kind === 1) {
      setComposeOpen(true);
    } else {
      setComingSoonOpen(true);
    }
  };

  return (
    <>
      <FabButton
        onClick={handleClick}
        icon={renderedIcon}
      />

      {/* Kind 1: Compose modal (lazy-loaded) */}
      {kind === 1 && composeOpen && (
        <Suspense fallback={null}>
          <ReplyComposeModal open={composeOpen} onOpenChange={setComposeOpen} />
        </Suspense>
      )}

      {/* Other kinds: Coming soon dialog */}
      {kind !== 1 && (
        <Dialog open={comingSoonOpen} onOpenChange={setComingSoonOpen}>
          <DialogContent className="max-w-[360px] rounded-2xl text-center">
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="size-16 rounded-full bg-muted flex items-center justify-center">
                <Construction className="size-8 text-muted-foreground" />
              </div>
              <DialogTitle className="text-lg font-semibold">Coming soon</DialogTitle>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-[260px]">
                Creating this type of content isn't available yet. Stay tuned!
              </p>
              <Button
                variant="outline"
                className="rounded-full mt-2"
                onClick={() => setComingSoonOpen(false)}
              >
                Got it
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
