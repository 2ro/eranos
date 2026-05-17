import type { NostrSigner } from '@nostrify/types';
import { NSecSigner, NBrowserSigner, NConnectSigner } from '@nostrify/nostrify';
import type { NConnectSignerOpts } from '@nostrify/nostrify';

import { signPsbtLocal } from '@/lib/bitcoin';

export interface BtcSigner extends NostrSigner {
  signPsbt(psbtHex: string): Promise<string>;
}

export function hasBtcSigning(signer: NostrSigner): signer is BtcSigner {
  return typeof (signer as BtcSigner).signPsbt === 'function';
}

export class NSecSignerBtc extends NSecSigner implements BtcSigner {
  readonly #secretKeyBytes: Uint8Array;

  constructor(secretKey: Uint8Array) {
    super(secretKey);
    this.#secretKeyBytes = new Uint8Array(secretKey);
  }

  async signPsbt(psbtHex: string): Promise<string> {
    const privateKeyHex = Buffer.from(this.#secretKeyBytes).toString('hex');
    return signPsbtLocal(psbtHex, privateKeyHex);
  }
}

export class NBrowserSignerBtc extends NBrowserSigner implements BtcSigner {
  constructor(opts?: { timeout?: number }) {
    super(opts);
  }

  async signPsbt(psbtHex: string): Promise<string> {
    const nostr = await (this as unknown as { awaitNostr(): Promise<Record<string, unknown>> }).awaitNostr();

    if (typeof nostr.signPsbt !== 'function') {
      throw new Error(
        "Your browser extension doesn't support sending Bitcoin. Try a different extension, or log in with your secret key.",
      );
    }

    const signPsbt = nostr.signPsbt as (hex: string) => Promise<string>;
    return signPsbt(psbtHex);
  }
}

const CAPABILITY_ERROR_PATTERNS = [
  /unknown\s+(method|command)/i,
  /not\s+(implemented|supported|found)/i,
  /unsupported\s+method/i,
  /method\s+not\s+found/i,
  /invalid\s+method/i,
  /no\s+such\s+method/i,
];

function looksLikeCapabilityError(msg: string): boolean {
  return CAPABILITY_ERROR_PATTERNS.some((re) => re.test(msg));
}

export class NConnectSignerBtc extends NConnectSigner implements BtcSigner {
  constructor(opts: NConnectSignerOpts) {
    super(opts);
  }

  async signPsbt(psbtHex: string): Promise<string> {
    const cmd = (this as unknown as { cmd(method: string, params: string[]): Promise<string> }).cmd;
    try {
      return await cmd.call(this, 'sign_psbt', [psbtHex]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (looksLikeCapabilityError(msg)) {
        throw new Error(
          `Your remote signer doesn't support sending Bitcoin. Update your signer, or log in with your secret key. (${msg})`,
        );
      }
      throw error;
    }
  }
}
