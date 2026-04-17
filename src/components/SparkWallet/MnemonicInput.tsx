/**
 * Mnemonic Input Component
 * Input for entering 12-word recovery phrase
 */

import { useState, useCallback } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle } from 'lucide-react';
import { breezService } from '@/lib/spark/breezService';

interface MnemonicInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export function MnemonicInput({ value, onChange, error }: MnemonicInputProps) {
  const [isValid, setIsValid] = useState<boolean | null>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value.toLowerCase().trim();
    onChange(newValue);

    // Validate if we have 12 words
    const words = newValue.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 12) {
      const valid = breezService.validateMnemonic(newValue);
      setIsValid(valid);
    } else if (words.length > 0) {
      setIsValid(null);
    } else {
      setIsValid(null);
    }
  }, [onChange]);

  const wordCount = value.split(/\s+/).filter(w => w.length > 0).length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="mnemonic">Recovery Phrase</Label>
        <span className="text-xs text-muted-foreground">
          {wordCount}/12 words
        </span>
      </div>

      <Textarea
        id="mnemonic"
        value={value}
        onChange={handleChange}
        placeholder="Enter your 12-word recovery phrase..."
        rows={3}
        className="font-mono text-sm"
      />

      {isValid === true && (
        <div className="flex items-center gap-2 text-sm text-primary">
          <CheckCircle className="h-4 w-4" />
          Valid recovery phrase
        </div>
      )}

      {isValid === false && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <XCircle className="h-4 w-4" />
          Invalid recovery phrase
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
