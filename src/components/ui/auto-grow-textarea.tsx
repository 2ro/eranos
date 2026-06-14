import { forwardRef, useCallback } from 'react';

import { cn } from '@/lib/utils';
import { autoGrowTextarea } from '@/lib/autoGrowTextarea';

/**
 * The borderless, muted-fill styling shared by Agora's large freeform text
 * fields (campaign story, verifier organization bio). Matches the "Your name"
 * field on the identity step: muted idle background, border on hover/focus,
 * no inner scrollbar (the box grows downward instead).
 */
const autoGrowBase = cn(
  'min-h-[200px] w-full resize-none overflow-hidden p-3',
  'text-lg leading-7 md:text-lg',
  'rounded-lg border-2 border-transparent bg-muted/40',
  'hover:bg-muted/60 hover:border-border',
  'focus-visible:bg-transparent focus-visible:border-primary focus-visible:ring-0 focus-visible:ring-offset-0',
  'placeholder:text-muted-foreground/40 transition-colors duration-150',
);

interface AutoGrowTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
}

/**
 * A textarea that grows with its content and wears Agora's shared borderless
 * "story / bio" styling. Used by the campaign story step and the verifier
 * organization bio step so both surfaces stay visually identical.
 *
 * Pass `className` to extend the base styling; it's merged via {@link cn}.
 */
export const AutoGrowTextarea = forwardRef<HTMLTextAreaElement, AutoGrowTextareaProps>(
  function AutoGrowTextarea({ value, onValueChange, className, ...rest }, ref) {
    const handleChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onValueChange(e.target.value);
        autoGrowTextarea(e.target);
      },
      [onValueChange],
    );

    const handleFocus = useCallback((e: React.FocusEvent<HTMLTextAreaElement>) => {
      autoGrowTextarea(e.target);
    }, []);

    return (
      <textarea
        ref={ref}
        value={value}
        onChange={handleChange}
        onFocus={handleFocus}
        className={cn(autoGrowBase, className)}
        {...rest}
      />
    );
  },
);

export default AutoGrowTextarea;
