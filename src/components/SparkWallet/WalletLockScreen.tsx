/**
 * Wallet Lock Screen Component
 * Displays when the wallet is locked and allows unlocking via Nostr signer
 */

import { useState } from 'react';
import { Lock, Unlock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSparkWallet } from '@/hooks/useSparkWallet';
import { useCurrentUser } from '@/hooks/useCurrentUser';

interface WalletLockScreenProps {
  className?: string;
}

export function WalletLockScreen({ className }: WalletLockScreenProps) {
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { unlockWallet } = useSparkWallet();
  const { user } = useCurrentUser();

  const handleUnlock = async () => {
    if (!user) {
      setError('You must be logged in to unlock your wallet.');
      return;
    }

    setIsUnlocking(true);
    setError(null);

    try {
      await unlockWallet();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlock wallet');
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <Card className={className}>
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 h-16 w-16 rounded-full bg-muted flex items-center justify-center">
          <Lock className="h-8 w-8 text-muted-foreground" />
        </div>
        <CardTitle>Wallet Locked</CardTitle>
        <CardDescription>
          Your wallet has been locked for security.
          {!user && ' Please log in to unlock.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button
          onClick={handleUnlock}
          disabled={isUnlocking || !user}
          className="w-full"
          size="lg"
        >
          {isUnlocking ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Unlocking...
            </>
          ) : (
            <>
              <Unlock className="h-4 w-4 mr-2" />
              Unlock Wallet
            </>
          )}
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          Unlocking will decrypt your wallet using your Nostr key.
        </p>
      </CardContent>
    </Card>
  );
}
