import { useEffect, useState } from 'react';

/**
 * Observes an element and reports whether it has entered the viewport.
 *
 * Designed for "render the card immediately, but defer the card's
 * expensive data fetching until it's actually on screen" patterns — most
 * importantly the campaign grids, where eagerly fetching data for all
 * ~200 cards at once produced a burst of per-card network calls that
 * rate-limited every backend.
 *
 * Behaviour:
 *
 * - **Once-only by default** (`once: true`): the hook flips `inView` to
 *   `true` the first time the element intersects the viewport and then
 *   stops observing. This is what data-fetch gating wants — once a query
 *   has been allowed to run, TanStack Query's cache keeps the result, so
 *   there's no reason to tear it down when the element scrolls away.
 * - `rootMargin` pre-arms elements slightly before they scroll into view
 *   so data is already loading by the time the card is visible.
 *
 * SSR / no-IO environments: if `IntersectionObserver` is unavailable the
 * hook reports `inView: true` immediately so functionality degrades to the
 * old always-on behaviour rather than never loading.
 *
 * @example
 * const ref = useRef<HTMLDivElement>(null);
 * const inView = useInView(ref);
 * const { data } = useSomeExpensiveQuery(id, { enabled: inView });
 */
export function useInView(
  ref: React.RefObject<Element | null>,
  options: {
    /** Stop observing after the first intersection. Defaults to `true`. */
    once?: boolean;
    /** Margin around the root, e.g. `'200px'` to pre-arm. Defaults to `'200px'`. */
    rootMargin?: string;
    /** Intersection ratio threshold. Defaults to `0`. */
    threshold?: number;
  } = {},
): boolean {
  const { once = true, rootMargin = '200px', threshold = 0 } = options;
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // Degrade gracefully where IntersectionObserver doesn't exist.
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { rootMargin, threshold },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, once, rootMargin, threshold]);

  return inView;
}
