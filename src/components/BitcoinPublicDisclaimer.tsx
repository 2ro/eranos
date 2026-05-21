import { AlertTriangle } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/**
 * - `destructive`: red, with a warning icon. Used in high-stakes contexts
 *   like the wallet's Send dialog where the disclaimer also gates an
 *   acknowledgement checkbox.
 * - `soft`: amber, no icon. Used as an informational notice in lower-stakes
 *   contexts (e.g. campaign donation surfaces) where we don't want to
 *   imply the donor is about to do something dangerous.
 */
type Tone = 'destructive' | 'soft';

interface BitcoinPublicDisclaimerProps {
  /**
   * When provided, render an "I understand this transaction is public"
   * acknowledgement checkbox below the warning. Callers should typically
   * gate the primary action (Send / Donate / Review / Open in wallet) on
   * `acknowledged === true`. When omitted, the disclaimer renders as an
   * informational notice with no interactive control.
   */
  acknowledged?: boolean;
  onAcknowledgedChange?: (acknowledged: boolean) => void;
  /** Optional override for the lead sentence (e.g. "Donations" instead of "Money"). */
  leadText?: string;
  /** Visual treatment. Defaults to `destructive` for backwards compatibility with the wallet's Send dialog. */
  tone?: Tone;
  /**
   * Whether the "Learn more" popover should include the
   * "or cash out at an exchange" advice. Relevant in the wallet (the
   * user holds Bitcoin and could cash out) but not on a campaign page
   * (the donor is sending money away, not deciding what to do with it).
   * Defaults to `true` for backwards compatibility.
   */
  includeCashOutAdvice?: boolean;
}

/**
 * Privacy disclaimer for on-chain Bitcoin payments. Bitcoin is a public
 * ledger and the transaction can be traced back to the sender forever.
 * Used wherever the user initiates an on-chain payment — wallet sends to
 * raw addresses, campaign donations (BIP-21 panels, in-app PSBT
 * donations, external-wallet fallbacks).
 */
export function BitcoinPublicDisclaimer({
  acknowledged,
  onAcknowledgedChange,
  leadText = 'Money you send is public and can be traced back to you.',
  tone = 'destructive',
  includeCashOutAdvice = true,
}: BitcoinPublicDisclaimerProps) {
  const showCheckbox = onAcknowledgedChange !== undefined;
  const isSoft = tone === 'soft';

  return (
    <Alert
      // For `soft` we drop the role="alert" semantics — it's informational,
      // not an active warning the user must respond to.
      role={isSoft ? 'note' : 'alert'}
      className={cn(
        isSoft
          // Use the project's foreground token (not raw amber-900) so
          // the text always contrasts against the page in both light
          // and dark themes. The faint amber tint keeps the
          // "informational notice" cue without leaning on hard-coded
          // amber text that disappears on the wrong backdrop.
          ? 'border-amber-500/30 bg-amber-500/10 text-foreground'
          : 'border-destructive/50 bg-destructive/5 text-destructive dark:border-destructive',
      )}
    >
      {/* Icon only on the destructive variant. The shadcn Alert reserves
          left padding for an icon via `[&>svg~*]:pl-7`, so omitting the
          icon also reclaims the indent. */}
      {!isSoft && <AlertTriangle className="size-4 text-destructive" />}
      <AlertDescription className="text-xs">
        <p>
          {leadText}{' '}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="underline underline-offset-2 font-medium hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
              >
                Learn more
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-72 text-xs leading-relaxed">
              Bitcoin is a public ledger. Transactions you send can
              be traced back to you forever, even after being
              exchanged by multiple people. Send it only to those
              you wish to support publicly
              {includeCashOutAdvice ? ', or cash out at an exchange.' : '.'}
            </PopoverContent>
          </Popover>
        </p>
        {showCheckbox && (
          <label className="mt-2 flex items-start gap-2 cursor-pointer select-none">
            <Checkbox
              checked={acknowledged ?? false}
              onCheckedChange={(checked) => onAcknowledgedChange(checked === true)}
              className={cn(
                'mt-0.5',
                isSoft
                  ? 'border-amber-600 data-[state=checked]:bg-amber-600 data-[state=checked]:text-white dark:border-amber-400 dark:data-[state=checked]:bg-amber-500'
                  : 'border-destructive data-[state=checked]:bg-destructive data-[state=checked]:text-destructive-foreground',
              )}
              aria-label="I understand this transaction is public"
            />
            <span>I understand this transaction is public.</span>
          </label>
        )}
      </AlertDescription>
    </Alert>
  );
}
