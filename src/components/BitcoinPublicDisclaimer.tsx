import { AlertTriangle } from 'lucide-react';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

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
}

/**
 * Privacy disclaimer for on-chain Bitcoin payments. Mirrors the warning
 * shown in the wallet's Send dialog for raw-address payments: Bitcoin is
 * a public ledger and the transaction can be traced back to the sender
 * forever. Used wherever the user initiates an on-chain payment — wallet
 * sends to raw addresses, campaign donations (BIP-21 panels, in-app
 * PSBT donations, external-wallet fallbacks).
 */
export function BitcoinPublicDisclaimer({
  acknowledged,
  onAcknowledgedChange,
  leadText = 'Money you send is public and can be traced back to you.',
}: BitcoinPublicDisclaimerProps) {
  const showCheckbox = onAcknowledgedChange !== undefined;

  return (
    <Alert variant="destructive" className="bg-destructive/5">
      <AlertTriangle className="size-4" />
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
              you wish to support publicly, or cash out at an
              exchange.
            </PopoverContent>
          </Popover>
        </p>
        {showCheckbox && (
          <label className="mt-2 flex items-start gap-2 cursor-pointer select-none">
            <Checkbox
              checked={acknowledged ?? false}
              onCheckedChange={(checked) => onAcknowledgedChange(checked === true)}
              className="mt-0.5 border-destructive data-[state=checked]:bg-destructive data-[state=checked]:text-destructive-foreground"
              aria-label="I understand this transaction is public"
            />
            <span>I understand this transaction is public.</span>
          </label>
        )}
      </AlertDescription>
    </Alert>
  );
}
