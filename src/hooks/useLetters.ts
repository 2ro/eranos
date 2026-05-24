import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from './useCurrentUser';
import {
  type Letter,
  type LetterContent,
  type Stationery,
} from '@/lib/letterTypes';

/** Result of decrypting a letter — includes extracted presentation data */
interface DecryptedLetter {
  content: LetterContent;
  stationery?: Stationery;
}

/** Decrypt a letter's content using NIP-44 and extract presentation fields */
export function useDecryptLetter(letter: Letter | undefined) {
  const { user } = useCurrentUser();

  return useQuery({
    queryKey: ['letter-decrypt', letter?.event.id, user?.pubkey],
    queryFn: async (): Promise<DecryptedLetter | null> => {
      if (!user || !letter) return null;
      if (!user.signer.nip44) {
        throw new Error('NIP-44 encryption not supported by your signer');
      }

      const otherPubkey = letter.sender === user.pubkey
        ? letter.recipient
        : letter.sender;

      try {
        const decrypted = await user.signer.nip44.decrypt(otherPubkey, letter.event.content);
        const parsed = JSON.parse(decrypted) as LetterContent;
        if (!parsed.body && (!parsed.stickers || parsed.stickers.length === 0)) return null;

        return {
          content: parsed,
          stationery: parsed.stationery,
        };
      } catch {
        return null;
      }
    },
    enabled: !!user && !!letter && !!letter.event.content,
    retry: false,
  });
}
