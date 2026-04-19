/**
 * WASM Unsupported Error Component
 * 
 * Displays a friendly error message when WebAssembly is not supported
 * in the user's browser (e.g., iOS Lockdown Mode, outdated browsers)
 */

import { AlertTriangle, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface WasmUnsupportedErrorProps {
  /** Error message from WASM check (optional) */
  technicalDetails?: string;
  /** Callback when user clicks "Go Back" button (optional) */
  onBack?: () => void;
  /** Show minimal version without card wrapper */
  minimal?: boolean;
}

export function WasmUnsupportedError({ 
  technicalDetails, 
  onBack,
  minimal = false 
}: WasmUnsupportedErrorProps) {
  const content = (
    <>
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Browser Not Supported</AlertTitle>
        <AlertDescription className="mt-2 space-y-3">
          <p>
            Your web browser does not support the technology required for this wallet (WebAssembly).
          </p>
          
          <div className="space-y-2">
            <p className="font-medium">Common causes:</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>
                <strong>iOS Lockdown Mode:</strong> Disable in Settings → Privacy & Security
              </li>
              <li>
                <strong>Outdated browser:</strong> Update to the latest version of your browser
              </li>
              <li>
                <strong>Privacy extensions:</strong> Some privacy tools disable WebAssembly
              </li>
            </ul>
          </div>

          <div className="space-y-2">
            <p className="font-medium">Recommended browsers:</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Chrome, Firefox, Safari, or Edge (latest versions)</li>
              <li>Make sure Lockdown Mode is disabled (iOS/macOS)</li>
            </ul>
          </div>

          <div className="pt-2">
            <a
              href="https://developer.mozilla.org/en-US/docs/WebAssembly#browser_compatibility"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm inline-flex items-center gap-1 hover:underline"
            >
              Learn more about browser compatibility
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </AlertDescription>
      </Alert>

      {technicalDetails && (
        <div className="mt-4">
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer hover:text-foreground">
              Technical details
            </summary>
            <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-x-auto">
              {technicalDetails}
            </pre>
          </details>
        </div>
      )}

      {onBack && (
        <div className="mt-4">
          <Button variant="outline" onClick={onBack} className="w-full">
            Go Back
          </Button>
        </div>
      )}
    </>
  );

  if (minimal) {
    return <div className="space-y-4">{content}</div>;
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
          <AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <CardTitle>Wallet Unavailable</CardTitle>
        <CardDescription>
          This wallet cannot run in your current browser environment
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {content}
      </CardContent>
    </Card>
  );
}
