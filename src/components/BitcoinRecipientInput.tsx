import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClipboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Bitcoin, EyeOff, QrCode, X } from 'lucide-react';

import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover';
import { QrScannerDialog } from '@/components/QrScannerDialog';
import { useToast } from '@/hooks/useToast';
import { parseBitcoinUri, validateBitcoinAddress } from '@/lib/bitcoin';
import {
  isSilentPaymentAddress,
  validateSilentPaymentAddress,
} from '@/lib/hdwallet/sp/sender';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * The resolved recipient produced by {@link BitcoinRecipientInput}.
 *
 * Either a bare on-chain Bitcoin address (`kind === 'address'`) or a BIP-352
 * silent payment address (`kind === 'sp'`). The dialog consumes this shape
 * directly when building the PSBT.
 */
export interface ResolvedRecipient {
  /**
   * For `kind === 'address'`: a validated mainnet on-chain address.
   * For `kind === 'sp'`: the `sp1…` string (the real P2TR `P_k` is derived
   * at PSBT-build time, after coin selection).
   */
  address: string;
  /** Recipient kind — determines how the PSBT builder routes the output. */
  kind: 'address' | 'sp';
  /**
   * Raw text the user typed / pasted / scanned. Kept so the picker can
   * round-trip a chip back into the input on clear if we ever need it
   * (currently unused; the chip just dismisses).
   */
  raw: string;
}

// ---------------------------------------------------------------------------
// Candidate extraction
// ---------------------------------------------------------------------------

/**
 * Resolve a piece of recipient text into the valid on-chain and/or
 * silent-payment candidates it carries.
 *
 * Handles bare `bc1…` / `sp1…` addresses and `bitcoin:` BIP-21 URIs (which
 * may carry an on-chain path, an `sp=` parameter, or both). Returns empty
 * strings for whichever kind isn't present/valid. Shared by the live
 * input memo and the paste handler so both agree on what counts.
 */
function resolveCandidates(text: string): { btc: string; sp: string } {
  const trimmed = text.trim();
  if (!trimmed) return { btc: '', sp: '' };

  const bip21 = parseBitcoinUri(trimmed);

  // On-chain: the URI path (when present) or the raw input. SP addresses
  // live in the `sp` field; don't double-count them as on-chain.
  const btcRaw = bip21 ? bip21.address : trimmed;
  const btc =
    btcRaw && !isSilentPaymentAddress(btcRaw) && validateBitcoinAddress(btcRaw)
      ? btcRaw
      : '';

  // Silent payment: prefer the URI `sp=` parameter; otherwise the path may
  // itself be an sp1 address (rare but legal — `bitcoin:sp1…` is a URI
  // without an on-chain fallback), or the raw input is a bare sp1.
  const spRaw = bip21 ? (bip21.sp ?? bip21.address) : trimmed;
  const sp =
    spRaw && isSilentPaymentAddress(spRaw) && validateSilentPaymentAddress(spRaw)
      ? spRaw
      : '';

  return { btc, sp };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface BitcoinRecipientInputProps {
  /** Currently-selected recipient, or `null` when nothing has been picked. */
  value: ResolvedRecipient | null;
  /** Called when the user picks a recipient (from the dropdown / QR scan) or clears. */
  onChange: (value: ResolvedRecipient | null) => void;
  /** Input placeholder text. */
  placeholder: string;
  /**
   * Optional initial input value applied when the picker mounts with no
   * `value`. Used by callers (e.g. campaign donate flow) that want to
   * pre-fill a `bitcoin:…` URI or bare address so the donor only needs to
   * pick from the dropdown.
   *
   * Applied on mount only. Clearing a selected chip (value → null) returns
   * to an empty input rather than restoring the prefill.
   */
  initialInput?: string;
}

/**
 * Recipient input for the Send Bitcoin dialog. Combines a text input, an
 * inline QR-scanner button, and a Radix Popover dropdown that surfaces the
 * recognised destination(s) extracted from the input.
 *
 * Recognised destinations:
 *
 * - Bare on-chain Bitcoin address (any standard mainnet type) → "Send to
 *   Bitcoin address" row.
 * - Bare BIP-352 silent payment address (`sp1…`) → "Send to silent payment
 *   address" row.
 * - `bitcoin:` BIP-21 URI with an on-chain path and/or an `sp=` parameter →
 *   one row per valid candidate (so a URI carrying both shows two rows and
 *   the donor picks privacy vs. compatibility).
 *
 * Clicking a row swaps the input out for a {@link SelectedRecipientChip} via
 * `onChange`. Clicking the chip's X button calls `onChange(null)`, which
 * returns to the input view.
 *
 * Anything else (npub, nprofile, free text) is silently ignored — there is
 * no account search here, by design. The dropdown stays open as long as the
 * input holds at least one valid candidate; it doesn't dismiss when the
 * input loses focus or the user taps elsewhere. It closes only on selection,
 * when the input is cleared, or on Escape.
 */
export function BitcoinRecipientInput({
  value,
  onChange,
  placeholder,
  initialInput,
}: BitcoinRecipientInputProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  // Local input state. Independent of `value` so the user can keep typing
  // after dismissing the dropdown without losing their query, and so the
  // chip-cleared view starts blank instead of repopulating the previous
  // selection. `initialInput` only seeds the field on first mount —
  // clearing the chip (value → null) returns to an empty input, not the
  // prefill.
  const [query, setQuery] = useState<string>(initialInput ?? '');
  const [open, setOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── Candidate extraction ──────────────────────────────────────────────
  //
  // BIP-21 `bitcoin:` URI handling. If the input is a URI, we route the
  // same way the QR scanner does: surface every valid candidate as its own
  // row so the user explicitly picks privacy (sp) vs. compatibility
  // (on-chain). A raw bc1…/sp1… input falls through here unchanged: `bip21`
  // is null and the candidate is just the trimmed query.
  const trimmed = query.trim();
  const { btc: btcCandidate, sp: spCandidate } = useMemo(
    () => resolveCandidates(trimmed),
    [trimmed],
  );

  const hasBtc = !!btcCandidate;
  const hasSp = !!spCandidate;
  const totalItems = (hasSp ? 1 : 0) + (hasBtc ? 1 : 0);

  // Auto-open the dropdown whenever a candidate is available, auto-close on
  // empty input.
  useEffect(() => {
    if (trimmed.length === 0) {
      setOpen(false);
      return;
    }
    if (hasSp || hasBtc) setOpen(true);
  }, [trimmed, hasSp, hasBtc]);

  // ── Selection callbacks ───────────────────────────────────────────────
  const selectBtc = useCallback(
    (address: string) => {
      onChange({ address, kind: 'address', raw: query });
      setQuery('');
      setOpen(false);
      inputRef.current?.blur();
    },
    [onChange, query],
  );

  const selectSp = useCallback(
    (address: string) => {
      onChange({ address, kind: 'sp', raw: query });
      setQuery('');
      setOpen(false);
      inputRef.current?.blur();
    },
    [onChange, query],
  );

  // ── Mount-time auto-select for single-endpoint prefills ────────────────
  //
  // When the picker mounts pre-filled (e.g. the campaign "Pay with Agora"
  // flow) and `initialInput` resolves to exactly one valid candidate, skip
  // the dropdown and select it directly so it lands as a chip. When the
  // prefill carries *both* an on-chain address and an sp1 code we leave it
  // in the input and let the dropdown surface both rows — that's a genuine
  // choice the donor must make (privacy vs. compatibility).
  //
  // Guarded by a ref so it fires once per mount and never overrides a
  // selection the user has already made or a `clear chip → restore prefill`
  // transition (the picker is keyed on each open in the dialog, so a fresh
  // mount is the right granularity).
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (autoSelectedRef.current) return;
    autoSelectedRef.current = true;
    if (value || !initialInput) return;
    if (totalItems !== 1) return;
    if (hasSp) {
      selectSp(spCandidate);
    } else if (hasBtc) {
      selectBtc(btcCandidate);
    }
    // Intentionally mount-only: candidates are derived from `initialInput`
    // (via the initial `query`), so reading them here reflects the prefill.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Paste auto-select ──────────────────────────────────────────────────
  //
  // When the user pastes text that resolves to exactly one valid candidate
  // (a bare `bc1…` / `sp1…` address or a single-endpoint `bitcoin:` URI),
  // convert it straight into a chip instead of making them click the lone
  // dropdown row. A paste carrying *both* an on-chain address and an sp1
  // code falls through to the normal dropdown so the donor picks privacy
  // vs. compatibility.
  //
  // We resolve from the pasted text directly because `query` state hasn't
  // updated yet inside the paste event. Returning early on a single match
  // lets us `preventDefault()` so the input never flickers the raw text.
  const handlePaste = useCallback(
    (e: ClipboardEvent<HTMLInputElement>) => {
      const pasted = e.clipboardData.getData('text');
      if (!pasted) return;
      const { btc, sp } = resolveCandidates(pasted);
      const count = (btc ? 1 : 0) + (sp ? 1 : 0);
      if (count !== 1) return; // 0 → let it land as text; 2 → use the dropdown.
      e.preventDefault();
      if (btc) {
        onChange({ address: btc, kind: 'address', raw: pasted.trim() });
      } else {
        onChange({ address: sp, kind: 'sp', raw: pasted.trim() });
      }
      setQuery('');
      setOpen(false);
      inputRef.current?.blur();
    },
    [onChange],
  );

  // ── QR scan handling ──────────────────────────────────────────────────
  /**
   * Interpret a freshly-scanned QR code.
   *
   * - **BIP-21 URI with valid bc1 *and* sp1** → drop the URI into the input
   *   and open the dropdown so the donor picks between them.
   * - **BIP-21 URI with only `sp=` valid** → select SP directly (creates
   *   the chip, bypasses the dropdown).
   * - **Bare bitcoin address** → select on-chain directly.
   * - **Bare `sp1…` address** → select SP directly.
   * - **Anything else** → toast.
   */
  const handleScan = useCallback(
    (scanned: string) => {
      setScannerOpen(false);
      const text = scanned.trim();
      const parsed = parseBitcoinUri(text);

      const candidate = parsed ? parsed.address : text;
      const sp = parsed?.sp;

      const hasValidBtc = !!candidate && validateBitcoinAddress(candidate);
      const hasValidSp =
        !!sp && isSilentPaymentAddress(sp) && validateSilentPaymentAddress(sp);

      // Both options — show the dropdown.
      if (parsed && hasValidBtc && hasValidSp) {
        setQuery(text);
        setOpen(true);
        // Focus is best-effort; on mobile the scanner dialog dismissal will
        // already steal focus and the dropdown stays usable via tap.
        inputRef.current?.focus();
        return;
      }

      // SP-only via `bitcoin:…?sp=sp1…`.
      if (hasValidSp && sp) {
        selectSp(sp);
        return;
      }

      // Direct on-chain.
      if (hasValidBtc) {
        selectBtc(candidate);
        return;
      }

      // Bare sp1 (no `bitcoin:` prefix).
      if (
        isSilentPaymentAddress(candidate)
        && validateSilentPaymentAddress(candidate)
      ) {
        selectSp(candidate);
        return;
      }

      toast({
        title: t('walletSend.scanError.title'),
        description: t('walletSend.scanError.description'),
        variant: 'destructive',
      });
    },
    [selectBtc, selectSp, t, toast],
  );

  // ── Chip view ─────────────────────────────────────────────────────────
  if (value) {
    return (
      <SelectedRecipientChip value={value} onClear={() => onChange(null)} />
    );
  }

  // ── Input + dropdown ──────────────────────────────────────────────────
  //
  // `popoverOpen` derives from the manual `open` flag AND the presence of
  // actionable candidates. This prevents an empty/garbage input from
  // popping the dropdown.
  const popoverOpen = open && totalItems > 0;

  return (
    <div className="space-y-2">
      <Popover open={popoverOpen} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="relative flex items-center">
            <Input
              ref={inputRef}
              id="hd-recipient-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onPaste={handlePaste}
              // Reopen on focus so a user can recover the dropdown after an
              // outside-click dismiss (the value is still in the field).
              onFocus={() => {
                if (totalItems > 0) setOpen(true);
              }}
              // `onFocus` only fires on the first tap; subsequent taps while
              // the input is still focused need their own opener so the user
              // can reopen the choice list without un-focusing first.
              onClick={() => {
                if (totalItems > 0) setOpen(true);
              }}
              placeholder={placeholder}
              autoComplete="off"
              spellCheck={false}
              role="combobox"
              aria-expanded={popoverOpen}
              aria-haspopup="listbox"
              aria-autocomplete="list"
              className={cn('font-mono text-base md:text-sm pr-11')}
            />
            <button
              type="button"
              onClick={() => setScannerOpen(true)}
              aria-label={t('walletSend.recipient.scan')}
              className="absolute right-1 top-1/2 -translate-y-1/2 size-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 flex items-center justify-center motion-safe:transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <QrCode className="size-4" />
            </button>
          </div>
        </PopoverAnchor>

        <PopoverContent
          align="start"
          sideOffset={6}
          // Keep typing focus in the input on open/close — Radix's default
          // is to focus the popover content, which would steal focus from
          // the input and dismiss the mobile keyboard mid-type.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          // The dropdown is a persistent choice list, not a transient
          // hover-popover: it should stay open even when the input loses
          // focus or the user taps elsewhere on the page, so blurring out
          // doesn't make the candidate rows vanish. We block Radix's
          // auto-dismiss-on-outside-interaction and instead close the
          // dropdown explicitly — on selection, on a cleared input
          // (the auto-open effect), or via Escape (still honored below).
          onFocusOutside={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          style={{ width: 'var(--radix-popover-trigger-width)' }}
          className="p-0 w-[--radix-popover-trigger-width] max-h-none rounded-xl border border-border bg-popover shadow-lg overflow-hidden"
        >
          <div role="listbox" className="max-h-[280px] overflow-y-auto py-1">
            {/* BTC comes before SP — the on-chain address is the
                broadly-compatible default; the silent-payment option
                follows for donors who want privacy. */}
            {hasBtc && (
              <BtcAddressRow address={btcCandidate} onClick={selectBtc} />
            )}
            {hasSp && (
              <SpAddressRow address={spCandidate} onClick={selectSp} />
            )}
          </div>
        </PopoverContent>
      </Popover>

      <QrScannerDialog
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
        title={t('walletSend.recipient.scan')}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dropdown rows
// ---------------------------------------------------------------------------

/** Truncate long addresses with an ellipsis so they don't overflow the row. */
function truncateAddress(address: string): string {
  return address.length > 28
    ? `${address.slice(0, 14)}…${address.slice(-10)}`
    : address;
}

function BtcAddressRow({
  address,
  onClick,
}: {
  address: string;
  onClick: (address: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      role="option"
      aria-selected={false}
      onClick={() => onClick(address)}
      // Prevent the input from blurring on mousedown — otherwise the popover
      // closes before `onClick` fires and the row never resolves.
      onMouseDown={(e) => e.preventDefault()}
      className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors cursor-pointer hover:bg-secondary/60"
    >
      <div className="size-9 shrink-0 rounded-full bg-orange-500/10 flex items-center justify-center">
        <Bitcoin className="size-4 text-orange-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">
          {t('walletSend.recipient.sendToOnchain')}
        </div>
        <div className="text-xs text-muted-foreground truncate font-mono">
          {truncateAddress(address)}
        </div>
      </div>
    </button>
  );
}

/**
 * Dropdown row for BIP-352 silent payment addresses. We give it a distinct
 * label and icon (privacy eye-off) so the user can tell at a glance that
 * this is a static, unlinkable address rather than a regular Bitcoin
 * scriptPubKey — the privacy story is materially different.
 */
function SpAddressRow({
  address,
  onClick,
}: {
  address: string;
  onClick: (address: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      role="option"
      aria-selected={false}
      onClick={() => onClick(address)}
      onMouseDown={(e) => e.preventDefault()}
      className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors cursor-pointer hover:bg-secondary/60"
    >
      <div className="size-9 shrink-0 rounded-full bg-violet-500/10 flex items-center justify-center">
        <EyeOff className="size-4 text-violet-500" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">
          {t('walletSend.recipient.sendToSilentPayment')}
        </div>
        <div className="text-xs text-muted-foreground truncate font-mono">
          {truncateAddress(address)}
        </div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Selected recipient chip
// ---------------------------------------------------------------------------

/**
 * Compact panel that replaces the input once a recipient has been picked.
 * Renders a coloured icon (orange Bitcoin / violet EyeOff for SP), the kind
 * label, a truncated monospace address, and an X button that clears the
 * selection and returns the user to the input view.
 */
function SelectedRecipientChip({
  value,
  onClear,
}: {
  value: ResolvedRecipient;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const { address, kind } = value;

  const displayName =
    kind === 'sp'
      ? t('walletSend.recipient.silentPayment')
      : t('walletSend.recipient.bitcoinAddress');
  const subtitle = truncateAddress(address);

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/40 pl-2 pr-2 py-1.5 w-full min-w-0 max-w-full">
      {kind === 'sp' ? (
        <div className="size-9 shrink-0 rounded-full bg-violet-500/10 flex items-center justify-center">
          <EyeOff className="size-4 text-violet-500" />
        </div>
      ) : (
        <div className="size-9 shrink-0 rounded-full bg-orange-500/10 flex items-center justify-center">
          <Bitcoin className="size-4 text-orange-500" />
        </div>
      )}
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="text-[11px] text-muted-foreground leading-tight">
          {t('walletSend.recipient.toLabel')}
        </div>
        <div className="text-sm font-medium truncate">{displayName}</div>
        <div className="text-xs text-muted-foreground truncate font-mono">
          {subtitle}
        </div>
      </div>
      <button
        type="button"
        onClick={onClear}
        aria-label={t('walletSend.recipient.clear')}
        className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors shrink-0"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
