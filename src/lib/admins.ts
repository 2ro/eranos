/**
 * Hardcoded admin npubs for the Agora platform.
 * Admins have special privileges including the ability to appoint organizers
 * and pin posts to country feeds.
 *
 * The list is currently identical to the Pathos admin set as a transitional
 * default while Agora is forked from Pathos. To rotate admins, edit
 * `ADMIN_NPUBS` below — the hex pubkey set is derived at module load time.
 */
const ADMIN_NPUBS = [
  'npub1hee433872q2gen90cqh2ypwcq9z7y5ugn23etrd2l2rrwpruss8qwmrsv6',
  'npub1zz2wwgst3mcdqj34wzha4xrn66mlcra0jyunwn2dzkq0nu5kd4qqx4e594',
  'npub1yxd53jkacz02yxfskkcmuwpscnfgzxx4mfpem6fs96a0jze8dfasgx3ylt',
  'npub1jvnpg4c6ljadf5t6ry0w9q0rnm4mksde87kglkrc993z46c39axsgq89sc',
  'npub1q3sle0kvfsehgsuexttt3ugjd8xdklxfwwkh559wxckmzddywnws6cd26p',
  'npub18ams6ewn5aj2n3wt2qawzglx9mr4nzksxhvrdc4gzrecw7n5tvjqctp424',
  'npub1scvyzz02ayma34hesz62pdrd5nhsmxp74hjq8msmfs9khh3r3drsnw68d8',
  'npub1ye5ptcxfyyxl5vjvdjar2ua3f0hynkjzpx552mu5snj3qmx5pzjscpknpr',
  'npub1zafcms4xya5ap9zr7xxr0jlrtrattwlesytn2s42030lzu0dwlzqpd26k5',
  'npub1q469xmf77nt9ltu4ks3excgts36ayt6v99ryn4rv2r2axmm4ye7q3vnkqp',
  'npub1yzfm42rzr3dj2h50flpvdl0uzrv22kv2y4ghve804w5xqu6lzqcqkyfxu5',
  'npub1gujeqakgt7fyp6zjggxhyy7ft623qtcaay5lkc8n8gkry4cvnrzqd3f67z',
  'npub1q4cgjdagapqacxjqqufyq6m5su29hy5h7x8pu5j7quyyp8g65pas4m0j8q', // sam test burner 1
  'npub1l6ugaq9x844ztd94dmk5ltr8xs4f0u3qdc9qf7kcn6ey6402xqlsswsjcw',
  'npub1e6tnvlr46lv3lwdu80r07kanhk6jcxy5r07w9umgv9kuhu9dl5hsk9gqft',
  'npub1nzhhfzfrvujey7qfad9hg3ngud36hy28nfn4u6x6nzg24pks0duss99uk6', // stats bot
] as const;

import { nip19 } from 'nostr-tools';

/** Derived hex pubkey set used for `authors` filters on admin-trusted events. */
export const ADMIN_PUBKEYS = ADMIN_NPUBS.map((npub) => {
  try {
    const decoded = nip19.decode(npub);
    if (decoded.type === 'npub') {
      return decoded.data;
    }
    return '';
  } catch {
    return '';
  }
}).filter(Boolean);

/** Check if a pubkey is an Agora admin. */
export function isAdmin(pubkey?: string): boolean {
  if (!pubkey) return false;
  return ADMIN_PUBKEYS.includes(pubkey);
}
