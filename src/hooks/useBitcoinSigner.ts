import { useEffect, useMemo, useState } from 'react';
import { useNostrLogin } from '@nostrify/react/login';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { type BtcSigner, hasBtcSigning } from '@/lib/bitcoin-signers';

export type BitcoinSignerCapability = 'supported' | 'unsupported' | 'unknown';

const knownUnsupportedBunkers = new Set<string>();

export function reportSignerUnsupported(pubkey: string): void {
  knownUnsupportedBunkers.add(pubkey);
  window.dispatchEvent(new CustomEvent('bitcoin-signer-unsupported', { detail: pubkey }));
}

export function clearSignerUnsupported(pubkey?: string): void {
  if (pubkey === undefined) {
    knownUnsupportedBunkers.clear();
  } else {
    knownUnsupportedBunkers.delete(pubkey);
  }
  window.dispatchEvent(new CustomEvent('bitcoin-signer-cleared', { detail: pubkey ?? '*' }));
}

export function useBitcoinSigner() {
  const { user } = useCurrentUser();
  const { logins } = useNostrLogin();
  const loginType = logins[0]?.type;

  const [extensionProbe, setExtensionProbe] = useState<BitcoinSignerCapability>(() => {
    if (loginType !== 'extension') return 'unknown';
    const n = (globalThis as { nostr?: Record<string, unknown> }).nostr;
    if (n && typeof n.signPsbt === 'function') return 'supported';
    if (n) return 'unsupported';
    return 'unknown';
  });

  useEffect(() => {
    if (loginType !== 'extension') return;

    let cancelled = false;
    const probe = () => {
      const n = (globalThis as { nostr?: Record<string, unknown> }).nostr;
      if (!n) return false;
      setExtensionProbe(typeof n.signPsbt === 'function' ? 'supported' : 'unsupported');
      return true;
    };

    if (probe()) return;
    const interval = setInterval(() => {
      if (cancelled) return;
      if (probe()) clearInterval(interval);
    }, 250);
    const stop = setTimeout(() => clearInterval(interval), 3000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(stop);
    };
  }, [loginType]);

  const [bunkerUnsupported, setBunkerUnsupported] = useState(() =>
    user ? knownUnsupportedBunkers.has(user.pubkey) : false,
  );

  useEffect(() => {
    if (!user) {
      setBunkerUnsupported(false);
      knownUnsupportedBunkers.clear();
      return;
    }
    setBunkerUnsupported(knownUnsupportedBunkers.has(user.pubkey));
  }, [user]);

  useEffect(() => {
    if (loginType !== 'bunker' || !user) return;
    const onUnsupported = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail === user.pubkey) setBunkerUnsupported(true);
    };
    const onCleared = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail === '*' || detail === user.pubkey) setBunkerUnsupported(false);
    };
    window.addEventListener('bitcoin-signer-unsupported', onUnsupported);
    window.addEventListener('bitcoin-signer-cleared', onCleared);
    return () => {
      window.removeEventListener('bitcoin-signer-unsupported', onUnsupported);
      window.removeEventListener('bitcoin-signer-cleared', onCleared);
    };
  }, [loginType, user]);

  const capability: BitcoinSignerCapability = useMemo(() => {
    if (!user) return 'unsupported';
    switch (loginType) {
      case 'nsec':
        return 'supported';
      case 'extension':
        return extensionProbe;
      case 'bunker':
        return bunkerUnsupported ? 'unsupported' : 'unknown';
      default:
        return hasBtcSigning(user.signer) ? 'unknown' : 'unsupported';
    }
  }, [user, loginType, extensionProbe, bunkerUnsupported]);

  const btcSigner = useMemo((): BtcSigner | null => {
    if (!user || capability === 'unsupported') return null;
    if (hasBtcSigning(user.signer)) return user.signer;
    return null;
  }, [user, capability]);

  return {
    capability,
    canSignPsbt: capability !== 'unsupported' && btcSigner !== null,
    signPsbt: btcSigner
      ? (psbtHex: string) => btcSigner.signPsbt(psbtHex)
      : null,
  };
}

export function isSignerCapabilityError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('does not support') ||
    msg.includes("doesn't support") ||
    msg.includes('signpsbt') ||
    msg.includes('sign_psbt')
  );
}
