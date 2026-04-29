import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { bech32 } from '@scure/base';

import { useAuthor } from '@/hooks/useAuthor';

/**
 * Resolves the LNURL zap receipt signer pubkey for a given Nostr user.
 * Results are cached per pubkey+lightning address, so multiple goal cards
 * for the same beneficiary share a single LNURL fetch.
 */
export function useLnurlSigner(pubkey: string) {
  const author = useAuthor(pubkey);
  const lnAddr = author.data?.metadata?.lud16 ?? author.data?.metadata?.lud06;

  return useQuery({
    queryKey: ['lnurl-signer', pubkey, lnAddr],
    queryFn: async (c) => {
      return resolveZapReceiptSigner(author.data?.event, c.signal) ?? null;
    },
    enabled: !!lnAddr,
    staleTime: 5 * 60_000,
  });
}

async function resolveZapReceiptSigner(profileEvent: NostrEvent | undefined, signal?: AbortSignal): Promise<string | undefined> {
  if (!profileEvent) return undefined;

  let lnurl = '';
  try {
    const metadata = JSON.parse(profileEvent.content) as { lud06?: string; lud16?: string };
    if (metadata.lud06) {
      const { words } = bech32.decode(metadata.lud06, 1000);
      lnurl = new TextDecoder().decode(new Uint8Array(bech32.fromWords(words)));
    } else if (metadata.lud16) {
      const [name, domain] = metadata.lud16.split('@');
      if (!name || !domain) return undefined;
      lnurl = new URL(`/.well-known/lnurlp/${name}`, `https://${domain}`).toString();
    }
  } catch {
    return undefined;
  }

  if (!lnurl) return undefined;

  try {
    const res = await fetch(lnurl, {
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000),
    });
    if (!res.ok) return undefined;
    const body = await res.json() as { allowsNostr?: boolean; nostrPubkey?: string };
    return body.allowsNostr && /^[a-f0-9]{64}$/.test(body.nostrPubkey ?? '')
      ? body.nostrPubkey
      : undefined;
  } catch {
    return undefined;
  }
}
