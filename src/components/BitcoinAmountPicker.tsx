import { useCallback, useEffect, useRef, useState } from 'react';

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { cn } from '@/lib/utils';

interface BitcoinAmountPickerProps {
  usdAmount: number | string;
  onUsdAmountChange: (amount: number | string) => void;
  presets: readonly number[];
  maxLabel?: string;
  maxSelected?: boolean;
  maxDisabled?: boolean;
  onMaxSelect?: () => void;
  insufficient?: boolean;
  satsLabel?: string;
  onAmountChangeStart?: () => void;
}

export function BitcoinAmountPicker({
  usdAmount,
  onUsdAmountChange,
  presets,
  maxLabel = 'MAX',
  maxSelected = false,
  maxDisabled = false,
  onMaxSelect,
  insufficient = false,
  satsLabel,
  onAmountChangeStart,
}: BitcoinAmountPickerProps) {
  const [editingAmount, setEditingAmount] = useState(false);
  const amountInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingAmount) {
      amountInputRef.current?.focus();
      amountInputRef.current?.select();
    }
  }, [editingAmount]);

  const commitAmountEdit = useCallback(() => {
    setEditingAmount(false);
    if (typeof usdAmount === 'string' && usdAmount.trim() === '') {
      onUsdAmountChange(0);
    }
  }, [onUsdAmountChange, usdAmount]);

  const currentUsd = typeof usdAmount === 'string' ? parseFloat(usdAmount) : usdAmount;

  return (
    <>
      <div className="flex flex-col items-center pt-2">
        {editingAmount ? (
          <div className="flex items-baseline justify-center">
            <span className={cn('text-4xl font-semibold', insufficient ? 'text-destructive' : 'text-muted-foreground')}>$</span>
            <input
              ref={amountInputRef}
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={usdAmount}
              onChange={(e) => {
                onAmountChangeStart?.();
                onUsdAmountChange(e.target.value);
              }}
              onBlur={commitAmountEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitAmountEdit();
                }
              }}
              aria-label="Amount in USD"
              className={cn(
                'bg-transparent border-0 outline-none text-4xl font-semibold text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none',
                insufficient && 'text-destructive',
              )}
              style={{ width: `${Math.max(2, String(usdAmount).length + 1)}ch` }}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              onAmountChangeStart?.();
              setEditingAmount(true);
            }}
            aria-label="Edit amount"
            className="flex items-baseline justify-center rounded-md px-2 -mx-2 hover:bg-muted/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
          >
            {maxSelected ? (
              <span className={cn('text-4xl font-semibold tracking-tight', insufficient && 'text-destructive')}>
                {maxLabel}
              </span>
            ) : (
              <>
                <span className={cn('text-4xl font-semibold', insufficient ? 'text-destructive' : 'text-muted-foreground')}>$</span>
                <span className={cn('text-4xl font-semibold tabular-nums', insufficient && 'text-destructive')}>
                  {Number.isFinite(currentUsd) && currentUsd > 0 ? currentUsd : 0}
                </span>
              </>
            )}
          </button>
        )}
        {satsLabel && (
          <span className="text-xs text-muted-foreground mt-1 tabular-nums">
            {satsLabel}
          </span>
        )}
      </div>

      <ToggleGroup
        type="single"
        value={maxSelected ? 'max' : presets.includes(Number(usdAmount)) ? String(usdAmount) : ''}
        onValueChange={(value) => {
          if (value) {
            onAmountChangeStart?.();
            if (value === 'max') {
              onMaxSelect?.();
              setEditingAmount(false);
              return;
            }
            onUsdAmountChange(Number(value));
            setEditingAmount(false);
          }
        }}
        className="grid grid-cols-5 gap-1 w-full"
      >
        {presets.map((preset) => (
          <ToggleGroupItem
            key={preset}
            value={String(preset)}
            className="h-8 min-w-0 text-xs font-semibold px-1"
          >
            ${preset}
          </ToggleGroupItem>
        ))}
        <ToggleGroupItem
          value="max"
          disabled={maxDisabled}
          className="h-8 min-w-0 text-xs font-semibold px-1"
        >
          {maxLabel}
        </ToggleGroupItem>
      </ToggleGroup>
    </>
  );
}
