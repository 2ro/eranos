import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

/**
 * Informational notice for BIP-352 silent-payment receive endpoints
 * (sp1…). Surfaces the "private but experimental" trade-off the user
 * accepts when they choose silent payments instead of a regular
 * on-chain address.
 *
 * Visual treatment mirrors `BitcoinPublicDisclaimer` with `tone="soft"`:
 * `role="note"`, amber tint, no icon, no checkbox. The lead sentence
 * carries the headline, and "Learn more" opens a popover with the full
 * explanation.
 */
export function BitcoinPrivateDisclaimer() {
  return (
    <Alert
      role="note"
      className="border-amber-500/30 bg-amber-500/10 text-foreground"
    >
      {/* No icon — the shadcn Alert reserves left padding for an icon via
          `[&>svg~*]:pl-7`, so omitting it reclaims the indent. */}
      <AlertDescription className="text-xs">
        <p>
          Experimental. Donations are private, but bugs may occur.{' '}
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
              Your private wallet hides the real address of your wallet
              and your donors on the Bitcoin network. Funds are always
              fully recoverable, but bugs in the wallet may cause it to
              show an incorrect balance, and it may require long wait
              times to synchronize.
            </PopoverContent>
          </Popover>
        </p>
      </AlertDescription>
    </Alert>
  );
}
