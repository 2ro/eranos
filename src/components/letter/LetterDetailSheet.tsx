/**
 * LetterDetailSheet — Minimal modal showing just the letter card.
 * Tap backdrop to dismiss.
 */

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { Loader2, Lock } from 'lucide-react';
import { InkPenIcon } from '@/components/icons/InkPenIcon';
import { useDecryptLetter } from '@/hooks/useLetters';
import { FONT_OPTIONS, LINE_HEIGHT_RATIO, type Letter } from '@/lib/letterTypes';
import { ensureLetterFonts } from '@/lib/letterUtils';
import { sanitizeCssString } from '@/lib/cssSanitize';
import { StationeryBackground } from './StationeryBackground';
import { useStationeryColors } from '@/hooks/useStationeryColors';
import { LetterStickers } from './LetterStickers';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { nip19 } from 'nostr-tools';
import { useCurrentUser } from '@/hooks/useCurrentUser';

interface LetterDetailSheetProps {
  letter: Letter | null;
  onClose: () => void;
  /** Called when the user wants to reply — receives the sender's npub. */
  onReply?: (senderNpub: string) => void;
}

export function LetterDetailSheet({ letter, onClose, onReply }: LetterDetailSheetProps) {
  const letterRef = useRef<HTMLDivElement>(null);
  const [lineHeightPx, setLineHeightPx] = useState(0);
  const { user } = useCurrentUser();

  const { data: decrypted, isLoading: isDecrypting } = useDecryptLetter(letter ?? undefined);
  const content = decrypted?.content;

  const effectiveStationery = decrypted?.stationery;
  const effectiveFrame = effectiveStationery?.frame;
  const effectiveFrameTint = effectiveStationery?.frameTint;

  const { text: textColor, faint: faintColor, line: lineColor } = useStationeryColors(effectiveStationery);
  // Sanitize event-sourced font family before CSS interpolation (M-6).
  const rawFont = effectiveStationery?.fontFamily
    ? sanitizeCssString(effectiveStationery.fontFamily)
    : undefined;
  const letterFontFamily = rawFont
    ? (rawFont.includes(',') ? rawFont : `${rawFont}, ${FONT_OPTIONS[0].family}`)
    : FONT_OPTIONS[0].family;

  // Lazy-load the letter's font when decrypted content is available
  useLayoutEffect(() => { ensureLetterFonts(letterFontFamily); }, [letterFontFamily]);

  // ResizeObserver for ruled line height — re-attaches when the dialog opens (letter changes)
  useEffect(() => {
    if (!letter) return;
    // Small delay to let the Dialog portal mount and layout
    const timer = setTimeout(() => {
      const el = letterRef.current;
      if (!el) return;
      const w = el.getBoundingClientRect().width;
      if (w > 0) setLineHeightPx(Math.round(w * LINE_HEIGHT_RATIO));
    }, 50);

    const el = letterRef.current;
    if (!el) return () => clearTimeout(timer);

    let raf: number;
    const ro = new ResizeObserver(([entry]) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = entry.contentBoxSize?.[0]?.inlineSize ?? entry.contentRect.width;
        if (w > 0) setLineHeightPx(Math.round(w * LINE_HEIGHT_RATIO));
      });
    });
    ro.observe(el);
    return () => { clearTimeout(timer); ro.disconnect(); cancelAnimationFrame(raf); };
  }, [letter]);

  return (
    <Dialog open={!!letter} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        className="p-0 gap-0 border-none bg-transparent shadow-none max-w-[calc(100vw-2rem)] sm:max-w-lg overflow-visible [&>button]:hidden"
      >
        <DialogTitle className="sr-only">Letter</DialogTitle>

        {/* Outer click-to-close layer — zero height so dialog centers on the card only */}
        <div className="relative" onClick={onClose}>

          <div
            ref={letterRef}
            className="relative"
            onClick={(e) => e.stopPropagation()}
            style={{
              containerType: 'inline-size',
              ...(effectiveFrame && effectiveFrame !== 'none' ? { padding: '28px 28px 44px' } : {}),
            }}
          >
            <StationeryBackground
              stationery={effectiveStationery}
              frame={effectiveFrame}
              frameTint={effectiveFrameTint}
              className="rounded-3xl shadow-inner shadow-black/5"
            >
              <div
                className="relative z-10 flex flex-col"
                style={{ aspectRatio: '5 / 4', padding: '5cqw' }}
              >
                {isDecrypting ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2.5" style={{ color: faintColor }}>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-xs">unsealing...</span>
                    </div>
                  </div>
                ) : content ? (
                  <>
                    <p
                      dir="auto"
                      className="whitespace-pre-wrap font-semibold tracking-wide overflow-hidden flex-1 min-h-0"
                      style={{
                        fontSize: '4.8cqw',
                        lineHeight: lineHeightPx > 0 ? `${lineHeightPx}px` : '8.4cqw',
                        letterSpacing: '0.06em',
                        paddingTop: '0.5cqw',
                        fontFamily: letterFontFamily,
                        color: textColor,
                        ...(lineHeightPx > 0 ? {
                          backgroundImage: `linear-gradient(to bottom, transparent ${lineHeightPx - 3}px, ${lineColor} ${lineHeightPx - 3}px)`,
                          backgroundSize: `100% ${lineHeightPx}px`,
                          backgroundRepeat: 'repeat-y',
                          maxHeight: `${lineHeightPx * 5}px`,
                        } : {}),
                        backgroundPosition: '0 0',
                      }}
                    >
                      {content.body}
                    </p>
                    {(content.closing || content.signature) && (
                      <div className="flex flex-col items-end" style={{ paddingTop: '6cqw', gap: '3cqw', paddingRight: '4cqw', fontFamily: letterFontFamily }}>
                        {content.closing && (
                          <p dir="auto" style={{ fontSize: '4.8cqw', color: textColor }}>{content.closing}</p>
                        )}
                        {content.signature && (
                          <p dir="auto" className="font-semibold" style={{ fontSize: '5cqw', color: textColor }}>{content.signature}</p>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2" style={{ color: faintColor }}>
                      <Lock className="w-5 h-5" />
                      <p className="text-xs italic">couldn't unseal this one</p>
                    </div>
                  </div>
                )}
              </div>
            </StationeryBackground>

            {content?.stickers && content.stickers.length > 0 && (
              <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none" style={{ zIndex: 20 }}>
                <div className="relative w-full h-full">
                  <LetterStickers stickers={content.stickers} />
                </div>
              </div>
            )}
          </div>

          {/* Reply button — absolutely below the card */}
          {onReply && letter && user?.pubkey !== letter.sender && (
            <div className="absolute top-full left-0 right-0 flex justify-center pt-12 pointer-events-none">
              <Button
                variant="default"
                size="lg"
                className="gap-3 rounded-full px-12 text-lg h-14 bg-primary text-primary-foreground hover:bg-primary/90 pointer-events-auto"
                style={{ filter: 'drop-shadow(0 2px 8px hsl(var(--primary) / 0.25))' }}
                onClick={(e) => {
                  e.stopPropagation();
                  const senderNpub = nip19.npubEncode(letter.sender);
                  onClose();
                  setTimeout(() => onReply(senderNpub), 150);
                }}
              >
                <InkPenIcon className="w-5 h-5" strokeWidth={2} />
                Reply
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
