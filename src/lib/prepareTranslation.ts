/**
 * Utilities for preparing Nostr event content for translation.
 *
 * URLs, Nostr references, and hashtags should remain verbatim. Replacing them
 * with placeholders before translation avoids broken links or mangled tags.
 */

const TOKEN_RE = /(https?:\/\/[^\s]+)|(nostr:[a-z0-9]+)|(#[\p{L}\p{N}_]+)/giu;

interface PreparedText {
  /** The string to send to the translation service. */
  textToTranslate: string;
  /** Ordered original tokens, indexed by placeholder number. */
  tokens: string[];
}

export function prepareForTranslation(raw: string): PreparedText {
  const tokens: string[] = [];

  const textToTranslate = raw.replace(TOKEN_RE, (match) => {
    const index = tokens.length;
    tokens.push(match);
    return `{{T${index}}}`;
  });

  return { textToTranslate, tokens };
}

export function restoreTokens(translated: string, tokens: string[]): string {
  return translated.replace(/\{\{T(\d+)\}\}/g, (_, index) => tokens[Number(index)] ?? "");
}
