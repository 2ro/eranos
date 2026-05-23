import { type ImgHTMLAttributes, useState } from 'react';

import { MediaPlaceholder } from '@/components/MediaPlaceholder';
import { useAppContext } from '@/hooks/useAppContext';
import { useImageProxy } from '@/hooks/useImageProxy';
import { cn } from '@/lib/utils';

interface ProxiedImageProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'onError'> {
  /** Original image URL. Required. */
  src: string;
  /** Target width passed to the image proxy. */
  width: number;
  /** Blurhash from the event's imeta tag, surfaced when a placeholder is shown. */
  blurhash?: string;
  /**
   * When `true` and `lowBandwidthMode` is enabled but no proxy is configured,
   * render a tap-to-load placeholder instead of loading the image immediately.
   * Set this on feed/gallery surfaces; leave it off for contexts where the
   * user has already opted in to viewing the image (lightbox, avatars, hover
   * cards).
   *
   * Defaults to `false`.
   */
  gated?: boolean;
  /** Label rendered on the tap-to-load placeholder. */
  placeholderLabel?: string;
  /** Optional callback fired after a load error has been fully resolved. */
  onLoadError?: () => void;
}

/**
 * Image element that routes its `src` through the configured image proxy
 * (`config.imageProxy`) at a per-context `width`. Handles the two failure
 * modes that matter for low-bandwidth users:
 *
 *   1. **Proxy fails (5xx, timeout, unreachable)** — falls back via
 *      `onError`. If `lowBandwidthMode` is on, falls back to the
 *      tap-to-load placeholder so we don't silently load the original
 *      megabytes. Otherwise falls back to the original URL.
 *
 *   2. **Proxy disabled + low-bandwidth + `gated`** — renders the placeholder
 *      up front. The user taps to load the image (proxied if available,
 *      original otherwise).
 *
 * Avatars, lightbox images, and other "already-consented" surfaces should
 * pass `gated={false}` (the default) so they always load.
 */
export function ProxiedImage({
  src,
  width,
  blurhash,
  gated = false,
  placeholderLabel,
  onLoadError,
  className,
  ...rest
}: ProxiedImageProps) {
  const { config } = useAppContext();
  const proxy = useImageProxy();

  const hasProxy = Boolean(config.imageProxy);
  const lowBandwidth = config.lowBandwidthMode;

  // Whether to gate behind a tap-to-load placeholder. Only applies when
  // the user is in low-bandwidth mode AND the proxy is disabled — otherwise
  // images load normally (proxy is doing the bandwidth work).
  const shouldGate = gated && lowBandwidth && !hasProxy;

  const [revealed, setRevealed] = useState(!shouldGate);
  const [proxyFailed, setProxyFailed] = useState(false);

  // Resolve the final src:
  //   - proxy succeeded:   proxied URL
  //   - proxy failed, low-bandwidth: bail to placeholder (handled below)
  //   - proxy failed, normal mode:   original URL
  const proxiedSrc = proxy(src, width);
  const usingProxy = proxiedSrc !== src;
  const finalSrc = !usingProxy || proxyFailed ? src : proxiedSrc;

  // Show placeholder when:
  //   - user hasn't revealed (gated + low-bandwidth + no proxy)
  //   - proxy failed in a gated context while user is low-bandwidth
  //     (don't silently load original bytes the user didn't ask for)
  //
  // The placeholder fills its parent and does NOT receive the <img>'s
  // className — img classes like `h-auto block` would collapse the
  // placeholder's flex centering. Callers should size the surrounding
  // container, not the placeholder.
  const fellBackToPlaceholder = gated && proxyFailed && lowBandwidth && usingProxy && !revealed;
  if (!revealed || fellBackToPlaceholder) {
    return (
      <MediaPlaceholder
        blurhash={blurhash}
        onReveal={() => setRevealed(true)}
        label={placeholderLabel}
      />
    );
  }

  return (
    <img
      {...rest}
      src={finalSrc}
      className={cn(className)}
      onError={() => {
        // First failure: swap proxied → original. If we're in a gated +
        // low-bandwidth context, fall to placeholder instead so we don't
        // silently download the (potentially huge) original.
        if (usingProxy && !proxyFailed) {
          if (gated && lowBandwidth) {
            setRevealed(false);
          }
          setProxyFailed(true);
          return;
        }
        onLoadError?.();
      }}
    />
  );
}
