import { useMemo } from 'react';
import Markdown, { type Components } from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { cn } from '@/lib/utils';

interface PolicyMarkdownProps {
  /** Raw markdown source string, e.g. from `usePolicyMarkdown(slug)`. */
  source: string;
  /**
   * Map of `{{name}}` placeholders to interpolate before render. Values are
   * escaped against the markdown literally — they're treated as plain text,
   * not as markdown — so user-supplied values can't smuggle in syntax.
   *
   * The escape strategy is conservative: backslash-escape markdown's special
   * characters. Combined with rehype-sanitize this keeps the rendered output
   * safe even if `values` ever holds untrusted content (today it's only
   * `appName` from `AppConfig`, which is operator-controlled).
   */
  values?: Record<string, string>;
  className?: string;
}

/** Escape markdown special characters in an interpolated value. */
function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}[\]()#+\-.!|<>])/g, '\\$1');
}

function interpolate(source: string, values: Record<string, string>): string {
  return source.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const v = values[key];
    return v === undefined ? match : escapeMarkdown(v);
  });
}

/**
 * Component overrides that match the typography of the legacy hand-rolled
 * `PrivacyPolicyPage` JSX (text-sm body, base-bold h2, inline-disc lists,
 * primary-colored external links opening in a new tab).
 */
const components: Components = {
  h1: ({ children, node: _n, ...rest }) => (
    <h1 {...rest} className="text-lg font-bold text-foreground">{children}</h1>
  ),
  h2: ({ children, node: _n, ...rest }) => (
    <h2 {...rest} className="text-base font-bold text-foreground mt-6">{children}</h2>
  ),
  h3: ({ children, node: _n, ...rest }) => (
    <h3 {...rest} className="text-sm font-bold text-foreground mt-4">{children}</h3>
  ),
  p: ({ children, node: _n, ...rest }) => (
    <p {...rest} className="mt-2">{children}</p>
  ),
  ul: ({ children, node: _n, ...rest }) => (
    <ul {...rest} className="list-disc list-inside space-y-1 ml-2 mt-2">{children}</ul>
  ),
  ol: ({ children, node: _n, ...rest }) => (
    <ol {...rest} className="list-decimal list-inside space-y-1 ml-2 mt-2">{children}</ol>
  ),
  li: ({ children, node: _n, ...rest }) => (
    <li {...rest}>{children}</li>
  ),
  strong: ({ children, node: _n, ...rest }) => (
    <strong {...rest} className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children, node: _n, ...rest }) => (
    <em {...rest}>{children}</em>
  ),
  a: ({ href, children, node: _n, ...rest }) => {
    const safe = sanitizeUrl(href);
    if (!safe) {
      return <span>{children}</span>;
    }
    return (
      <a
        {...rest}
        href={safe}
        target="_blank"
        rel="noopener noreferrer"
        className={cn('text-primary hover:underline', rest.className as string | undefined)}
      >
        {children}
      </a>
    );
  },
  hr: ({ node: _n, ...rest }) => (
    <hr {...rest} className="my-6 border-border" />
  ),
};

/**
 * Renders a markdown source as a Privacy / CSAE / long-form policy article
 * with consistent typography, sanitized HTML, and `{{placeholder}}`
 * interpolation. Wrap in the existing `<article>` container or pass a
 * `className` override.
 */
export function PolicyMarkdown({ source, values, className }: PolicyMarkdownProps) {
  const interpolated = useMemo(
    () => (values ? interpolate(source, values) : source),
    [source, values],
  );

  return (
    <div className={cn('space-y-2 text-sm text-foreground/90 leading-relaxed', className)}>
      <Markdown components={components} rehypePlugins={[rehypeSanitize]}>
        {interpolated}
      </Markdown>
    </div>
  );
}
