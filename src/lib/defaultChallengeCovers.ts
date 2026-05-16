/**
 * Default cover images for actions/challenges.
 * Bold, eye-catching visuals related to civil unrest, protests, and human rights.
 *
 * Used by the action creation form as a gallery the author can pick from when
 * they don't want to upload a custom cover, and as a fallback for action cards
 * whose author never set an image.
 */
export const DEFAULT_CHALLENGE_COVERS = [
  { id: 'cover1', url: '/challenge-covers/cover1.png', name: 'Protest March' },
  { id: 'cover2', url: '/challenge-covers/cover2.png', name: 'Raised Fists' },
  { id: 'cover3', url: '/challenge-covers/cover3.png', name: 'Unity' },
  { id: 'cover4', url: '/challenge-covers/cover4.jpeg', name: 'Demonstration' },
  { id: 'cover5', url: '/challenge-covers/cover5.jpeg', name: 'People Power' },
  { id: 'cover6', url: '/challenge-covers/cover6.png', name: 'Solidarity' },
  { id: 'cover7', url: '/challenge-covers/cover7.png', name: 'Resistance' },
  { id: 'cover8', url: '/challenge-covers/cover8.png', name: 'Freedom' },
  { id: 'cover9', url: '/challenge-covers/cover9.png', name: 'Justice' },
  { id: 'cover10', url: '/challenge-covers/cover10.png', name: 'Revolution' },
  { id: 'cover11', url: '/challenge-covers/cover11.png', name: 'Change' },
] as const;

/** Default cover image when an action has none set. */
export const DEFAULT_COVER_IMAGE = '/challenge-covers/cover9.png';

/** Pick a random default cover image (used for variety in fallbacks). */
export function getRandomDefaultCover() {
  const index = Math.floor(Math.random() * DEFAULT_CHALLENGE_COVERS.length);
  return DEFAULT_CHALLENGE_COVERS[index];
}
