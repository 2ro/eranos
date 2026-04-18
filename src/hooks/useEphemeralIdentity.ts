import { useState, useCallback, useEffect, useMemo } from 'react';
import { getPublicKey, nip19 } from 'nostr-tools';

/**
 * Anonymous "ghost" identity used for ephemeral geo chat (kinds 20000/20001).
 *
 * The private key lives only in React state — it is **not** persisted, so the
 * identity dies with the tab. Only the chosen nickname is persisted in
 * localStorage, so a returning visitor keeps the same display handle even
 * though their pubkey rotates.
 */
export interface EphemeralIdentity {
  privateKey: Uint8Array;
  pubkey: string;
  npub: string;
  nickname: string;
}

const NICKNAME_STORAGE_KEY = 'agora-ephemeral-nickname';

const NICKNAME_ADJECTIVES = [
  'stealth', 'shadow', 'ghost', 'phantom', 'wisp', 'echo', 'veil', 'mist', 'haze', 'aura',
];
const NICKNAME_NOUNS = [
  'agent', 'runner', 'operative', 'scout', 'watcher', 'sentry', 'guardian', 'ranger', 'hunter', 'tracker',
];

function generateRandomNickname(): string {
  const adjective = NICKNAME_ADJECTIVES[Math.floor(Math.random() * NICKNAME_ADJECTIVES.length)];
  const noun = NICKNAME_NOUNS[Math.floor(Math.random() * NICKNAME_NOUNS.length)];
  const number = Math.floor(Math.random() * 9999) + 1;
  return `${adjective}${noun}${number}`;
}

function generatePrivateKey(): Uint8Array {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return array;
}

export interface UseEphemeralIdentityReturn {
  identity: EphemeralIdentity | null;
  generateIdentity: () => EphemeralIdentity;
  updateNickname: (nickname: string) => void;
  clearIdentity: () => void;
}

export function useEphemeralIdentity(): UseEphemeralIdentityReturn {
  const [identity, setIdentity] = useState<EphemeralIdentity | null>(null);

  // If a nickname is already persisted, eagerly mint a fresh keypair against
  // it on mount so chat surfaces have an identity to use without waiting on
  // an explicit `generateIdentity()` call.
  useEffect(() => {
    if (identity) return;
    const storedNickname = localStorage.getItem(NICKNAME_STORAGE_KEY);
    if (!storedNickname) return;
    const privateKey = generatePrivateKey();
    const pubkey = getPublicKey(privateKey);
    setIdentity({
      privateKey,
      pubkey,
      npub: nip19.npubEncode(pubkey),
      nickname: storedNickname,
    });
  }, [identity]);

  const generateIdentity = useCallback(() => {
    const privateKey = generatePrivateKey();
    const pubkey = getPublicKey(privateKey);
    const storedNickname = localStorage.getItem(NICKNAME_STORAGE_KEY);
    const nickname = storedNickname || generateRandomNickname();
    const newIdentity: EphemeralIdentity = {
      privateKey,
      pubkey,
      npub: nip19.npubEncode(pubkey),
      nickname,
    };
    setIdentity(newIdentity);
    return newIdentity;
  }, []);

  const updateNickname = useCallback((newNickname: string) => {
    setIdentity((prev) => (prev ? { ...prev, nickname: newNickname } : prev));
    localStorage.setItem(NICKNAME_STORAGE_KEY, newNickname);
  }, []);

  const clearIdentity = useCallback(() => {
    setIdentity(null);
    localStorage.removeItem(NICKNAME_STORAGE_KEY);
  }, []);

  // Memoise the return object so consumers using it as a useEffect dep don't
  // re-fire on every render. Without this, `useChatSession`'s identity effect
  // re-runs every render → can interact poorly with downstream ref callbacks.
  return useMemo(
    () => ({ identity, generateIdentity, updateNickname, clearIdentity }),
    [identity, generateIdentity, updateNickname, clearIdentity],
  );
}
