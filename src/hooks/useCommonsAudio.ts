import { useQuery } from '@tanstack/react-query';

/**
 * A playable derivative of a Commons audio file — the original OGG plus
 * any server-side transcodes (most commonly MP3). The `<audio>` element
 * is fed these as `<source>` tags so the browser picks the first one it
 * can actually decode.
 *
 * MP3 is the only format Safari / iOS WKWebView reliably plays from
 * Commons (Apple browsers don't natively support Ogg Vorbis), so resolving
 * derivatives — instead of using the raw `Special:FilePath` URL — is the
 * difference between "anthem plays everywhere" and "anthem plays only in
 * Chrome/Firefox".
 */
interface CommonsAudioDerivative {
  /** Direct upload.wikimedia.org URL for this derivative. */
  src: string;
  /** MIME type including codec hint where known. */
  type: string;
}

const ENDPOINT = 'https://commons.wikimedia.org/w/api.php';

async function fetchCommonsAudio(
  filename: string,
  signal?: AbortSignal,
): Promise<CommonsAudioDerivative[]> {
  // The MediaWiki API's `videoinfo` prop returns both the original file
  // and server-side transcodes (despite the "video" name, it works for
  // audio too — Commons treats time-based media uniformly). We only need
  // `derivatives` and `url` from each page.
  const url = new URL(ENDPOINT);
  url.searchParams.set('action', 'query');
  url.searchParams.set('titles', `File:${filename}`);
  url.searchParams.set('prop', 'videoinfo');
  url.searchParams.set('viprop', 'derivatives|url');
  url.searchParams.set('format', 'json');
  url.searchParams.set('origin', '*');

  const response = await fetch(url.toString(), {
    signal,
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) return [];

  interface VideoInfo {
    url?: string;
    derivatives?: { src?: string; type?: string }[];
  }
  interface ApiPage {
    videoinfo?: VideoInfo[];
  }
  interface ApiResponse {
    query?: { pages?: Record<string, ApiPage> };
  }

  const data = (await response.json()) as ApiResponse;
  const pages = data.query?.pages ?? {};
  const videoinfo = Object.values(pages)[0]?.videoinfo?.[0];
  if (!videoinfo) return [];

  // Use derivatives if present (covers both the original and any
  // transcodes). Fall back to the top-level `url` only when derivatives
  // is empty, which can happen for files Commons hasn't enqueued for
  // transcoding yet.
  const derivatives = (videoinfo.derivatives ?? [])
    .filter((d): d is { src: string; type: string } => !!d.src && !!d.type)
    .map((d) => ({
      // Strip Wikimedia's analytics query parameters — they add noise and
      // can break range requests on some CDN edges.
      src: d.src.replace(/[?&](?:utm_[^=]+|fastcgi)=[^&]*/g, '').replace(/[?&]$/, ''),
      type: d.type,
    }));

  if (derivatives.length > 0) return derivatives;

  if (videoinfo.url) {
    // Best-effort: guess MIME from extension when we only have the
    // original. Most Commons audio is OGG Vorbis.
    const ext = filename.split('.').pop()?.toLowerCase();
    const type =
      ext === 'mp3' ? 'audio/mpeg' :
      ext === 'oga' || ext === 'ogg' ? 'audio/ogg; codecs="vorbis"' :
      ext === 'opus' ? 'audio/ogg; codecs="opus"' :
      ext === 'flac' ? 'audio/flac' :
      ext === 'wav' ? 'audio/wav' :
      'audio/*';
    return [{ src: videoinfo.url.replace(/[?&](?:utm_[^=]+)=[^&]*/g, '').replace(/[?&]$/, ''), type }];
  }

  return [];
}

/**
 * Resolve a Commons audio filename (e.g. `Gloria al Bravo Pueblo instrumental.ogg`)
 * to a list of playable derivatives — original + any transcoded formats.
 *
 * Returns an empty array (never `undefined`) when there's nothing to play,
 * so consumers can early-return based on `derivatives.length === 0`.
 *
 * Cached for 24 h since the derivative list is effectively immutable for
 * any given file.
 */
export function useCommonsAudio(filename: string | null | undefined) {
  return useQuery({
    queryKey: ['commons-audio', filename ?? null],
    queryFn: ({ signal }) => fetchCommonsAudio(filename!, signal),
    enabled: !!filename,
    staleTime: 1000 * 60 * 60 * 24,
    gcTime: 1000 * 60 * 60 * 24 * 7,
    retry: 1,
  });
}
