/**
 * Lock Timeout Settings Component
 * Allows users to configure auto-lock timeout and manually lock the wallet
 */

import { Lock, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useSparkWallet } from '@/hooks/useSparkWallet';
import type { LockTimeoutMinutes } from '@/lib/spark/types';

const TIMEOUT_OPTIONS: { value: LockTimeoutMinutes; label: string }[] = [
  { value: 0, label: 'Never (disabled)' },
  { value: 1, label: '1 minute' },
  { value: 5, label: '5 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 hour' },
];

interface LockTimeoutSettingsProps {
  className?: string;
}

export function LockTimeoutSettings({ className }: LockTimeoutSettingsProps) {
  const { lockTimeout, setLockTimeout, lockWallet, isInitialized } = useSparkWallet();

  const handleTimeoutChange = (value: string) => {
    const timeout = parseInt(value, 10) as LockTimeoutMinutes;
    setLockTimeout(timeout);
  };

  return (
    <div className={className}>
      <div className="space-y-4">
        {/* Auto-lock timeout setting */}
        <div className="space-y-2">
          <Label htmlFor="lock-timeout" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Auto-lock timeout
          </Label>
          <Select
            value={lockTimeout.toString()}
            onValueChange={handleTimeoutChange}
          >
            <SelectTrigger id="lock-timeout" className="w-full">
              <SelectValue placeholder="Select timeout" />
            </SelectTrigger>
            <SelectContent>
              {TIMEOUT_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value.toString()}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {lockTimeout === 0
              ? 'Your wallet will stay unlocked until you manually lock it or close the browser.'
              : `Your wallet will automatically lock after ${lockTimeout} minute${lockTimeout > 1 ? 's' : ''} of inactivity.`}
          </p>
        </div>

        {/* Manual lock button */}
        {isInitialized && (
          <div className="pt-2 border-t">
            <Button
              variant="outline"
              onClick={lockWallet}
              className="w-full"
            >
              <Lock className="h-4 w-4 mr-2" />
              Lock Wallet Now
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              Manually lock your wallet. You'll need to authenticate with your Nostr key to unlock.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
