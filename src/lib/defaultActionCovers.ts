/**
 * Default cover images for actions.
 * Bold, eye-catching visuals related to civil unrest, protests, and human rights.
 *
 * Used by the action creation form as a gallery the author can pick from when
 * they don't want to upload a custom cover, and as a fallback for action cards
 * whose author never set an image.
 */
export const DEFAULT_ACTION_COVERS = [
  { id: 'cover2', url: '/challenge-covers/cover2.png', name: 'Raised Fists' },
  { id: 'cover5', url: '/challenge-covers/cover5.jpeg', name: 'People Power' },
  { id: 'cover6', url: '/challenge-covers/cover6.png', name: 'Solidarity' },
  { id: 'cover8', url: '/challenge-covers/cover8.png', name: 'Freedom' },
  { id: 'cover9', url: '/challenge-covers/cover9.png', name: 'Justice' },
  { id: 'cover10', url: '/challenge-covers/cover10.png', name: 'Revolution' },
] as const;

/** Default cover image when an action has none set. */
export const DEFAULT_COVER_IMAGE = '/challenge-covers/cover9.png';

/** Pick a random default cover image (used for variety in fallbacks). */
export function getRandomDefaultCover() {
  const index = Math.floor(Math.random() * DEFAULT_ACTION_COVERS.length);
  return DEFAULT_ACTION_COVERS[index];
}
