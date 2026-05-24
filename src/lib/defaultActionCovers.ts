/**
 * Default cover images for actions.
 * Bold, eye-catching visuals related to civil unrest, protests, and human rights.
 *
 * Hosted on Blossom rather than served from /public so that when an action
 * author picks one of these as their cover, the URL we publish in the
 * kind-36639 `image` tag resolves on any Nostr client — not just on Agora's
 * own origin.
 */
export const DEFAULT_ACTION_COVERS = [
  { id: 'cover2', url: 'https://blossom.dreamith.to/a5d3927951b9daae21f9709490f290497fb9fa4221649c72ba9762f28503a7ef.png', name: 'Raised Fists' },
  { id: 'cover5', url: 'https://blossom.dreamith.to/2fd48baee85401398924963c6184aa78bd111d1d5bd760c16ba551c13a5fe7c8.jpeg', name: 'People Power' },
  { id: 'cover6', url: 'https://blossom.dreamith.to/3733b1c19f862a5092d606616c8df9a4523f228fe0a36ff11521898f89e8f2f6.png', name: 'Solidarity' },
  { id: 'cover8', url: 'https://blossom.dreamith.to/18cba00ca60a37aaf7e1970bede27b271c75366fdad671756444632448b9288e.png', name: 'Freedom' },
  { id: 'cover9', url: 'https://blossom.dreamith.to/798305829a160757bcf7ad5c28f5e7382bcf7f087beb9fad83648950910e15f5.png', name: 'Justice' },
  { id: 'cover10', url: 'https://blossom.dreamith.to/95ac031f7161c30ec7ec2d7ffaaff96807aab1df04a981cc29c28f06966b4b98.png', name: 'Revolution' },
] as const;

/** Default cover image when an action has none set. */
export const DEFAULT_COVER_IMAGE = 'https://blossom.dreamith.to/798305829a160757bcf7ad5c28f5e7382bcf7f087beb9fad83648950910e15f5.png';

