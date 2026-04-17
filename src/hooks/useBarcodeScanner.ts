/**
 * Barcode Scanner Hook
 * Wrapper for @capacitor/barcode-scanner plugin
 */

import { useState } from 'react';
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerCameraDirection,
  CapacitorBarcodeScannerScanOrientation,
  CapacitorBarcodeScannerTypeHintALLOption,
} from '@capacitor/barcode-scanner';
import { Capacitor } from '@capacitor/core';

interface ScanResult {
  text: string;
  format: string;
}

interface UseBarcodeScanner {
  scanBarcode: () => Promise<ScanResult | null>;
  isScanning: boolean;
  error: string | null;
  isSupported: boolean;
}

export function useBarcodeScanner(): UseBarcodeScanner {
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if running on a native platform (Android/iOS)
  const isSupported = Capacitor.isNativePlatform();

  const scanBarcode = async (): Promise<ScanResult | null> => {
    if (!isSupported) {
      setError('Barcode scanner is only available on mobile devices');
      return null;
    }

    setIsScanning(true);
    setError(null);

    try {
      const result = await CapacitorBarcodeScanner.scanBarcode({
        hint: CapacitorBarcodeScannerTypeHintALLOption.ALL,
        scanInstructions: 'Scan a QR code',
        scanButton: false,
        cameraDirection: CapacitorBarcodeScannerCameraDirection.BACK,
        scanOrientation: CapacitorBarcodeScannerScanOrientation.ADAPTIVE,
      });

      setIsScanning(false);

      return {
        text: result.ScanResult,
        format: result.format.toString(),
      };
    } catch (err) {
      setIsScanning(false);
      const errorMessage = err instanceof Error ? err.message : 'Failed to scan barcode';
      setError(errorMessage);
      return null;
    }
  };

  return {
    scanBarcode,
    isScanning,
    error,
    isSupported,
  };
}
