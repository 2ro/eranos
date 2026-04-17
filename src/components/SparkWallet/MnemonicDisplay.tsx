/**
 * Mnemonic Display Component
 * Displays the 12-word recovery phrase with copy functionality
 * 
 * SECURITY: Clipboard is auto-cleared after 30 seconds
 */

import { useState, useRef, useEffect } from 'react';
import { Copy, Check, Eye, EyeOff, AlertTriangle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/useToast';
import { logger } from '@/lib/logger';

/** Clipboard auto-clear timeout in milliseconds (30 seconds) */
const CLIPBOARD_CLEAR_TIMEOUT = 30000;

interface MnemonicDisplayProps {
  mnemonic: string;
  showWarning?: boolean;
}

export function MnemonicDisplay({ mnemonic, showWarning = true }: MnemonicDisplayProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCopyConfirm, setShowCopyConfirm] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const { toast } = useToast();
  const clearTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const words = mnemonic.split(' ');

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clearTimeoutRef.current) {
        clearTimeout(clearTimeoutRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  const clearClipboard = async () => {
    try {
      // Clear clipboard by writing empty string
      await navigator.clipboard.writeText('');
      logger.debug('[MnemonicDisplay] Clipboard cleared');
      setCopied(false);
      setCountdown(0);
    } catch (error) {
      logger.warn('[MnemonicDisplay] Failed to clear clipboard:', error);
    }
  };

  const handleCopyConfirmed = async () => {
    try {
      await navigator.clipboard.writeText(mnemonic);
      setCopied(true);
      setShowCopyConfirm(false);

      // Start countdown
      const totalSeconds = CLIPBOARD_CLEAR_TIMEOUT / 1000;
      setCountdown(totalSeconds);

      // Update countdown every second
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
      countdownIntervalRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current);
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      toast({
        title: 'Copied to clipboard',
        description: `Recovery phrase copied. Clipboard will be cleared in ${totalSeconds} seconds for security.`,
      });

      // Schedule clipboard clear
      if (clearTimeoutRef.current) {
        clearTimeout(clearTimeoutRef.current);
      }
      clearTimeoutRef.current = setTimeout(async () => {
        await clearClipboard();
        toast({
          title: 'Clipboard cleared',
          description: 'Recovery phrase removed from clipboard for security.',
        });
      }, CLIPBOARD_CLEAR_TIMEOUT);
    } catch (error) {
      logger.error('[MnemonicDisplay] Failed to copy:', error);
      toast({
        title: 'Copy failed',
        description: 'Could not copy to clipboard',
        variant: 'destructive',
      });
    }
  };

  const handleCopyClick = () => {
    // If already copied and countdown is active, just show status
    if (copied && countdown > 0) {
      toast({
        title: 'Already copied',
        description: `Clipboard will be cleared in ${countdown} seconds.`,
      });
      return;
    }
    // Show confirmation dialog
    setShowCopyConfirm(true);
  };

  return (
    <div className="space-y-4">
      {showWarning && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Write down these 12 words and store them safely. Anyone with this phrase can access your funds. Never share it with anyone.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-3 gap-2">
            {words.map((word, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2 bg-muted rounded-md text-sm"
              >
                <span className="text-muted-foreground w-5 text-right">
                  {index + 1}.
                </span>
                <span className={isVisible ? '' : 'blur-sm select-none'}>
                  {word}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsVisible(!isVisible)}
          className="flex-1"
        >
          {isVisible ? (
            <>
              <EyeOff className="h-4 w-4 mr-2" />
              Hide
            </>
          ) : (
            <>
              <Eye className="h-4 w-4 mr-2" />
              Reveal
            </>
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleCopyClick}
          className="flex-1"
        >
          {copied && countdown > 0 ? (
            <>
              <Clock className="h-4 w-4 mr-2 text-amber-600" />
              Clears in {countdown}s
            </>
          ) : copied ? (
            <>
              <Check className="h-4 w-4 mr-2 text-primary" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4 mr-2" />
              Copy
            </>
          )}
        </Button>
      </div>

      {/* Copy Confirmation Dialog */}
      <AlertDialog open={showCopyConfirm} onOpenChange={setShowCopyConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Copy Recovery Phrase?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="text-left space-y-2">
                <p>
                  Your recovery phrase will be copied to the clipboard. This is sensitive information that gives full access to your wallet.
                </p>
                <p className="font-medium">
                  For security, the clipboard will be automatically cleared after 30 seconds.
                </p>
                <p className="text-amber-600 dark:text-amber-400">
                  Never share this phrase with anyone or paste it into untrusted applications.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleCopyConfirmed}>
              Copy to Clipboard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
