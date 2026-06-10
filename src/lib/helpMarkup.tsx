/**
 * Shared inline-markup renderer used by Help/FAQ surfaces and the
 * Donor / Recipient guide pages.
 *
 * Supports a deliberately tiny syntax so authors can write content in plain
 * strings without pulling in a full markdown parser:
 *
 *   **bold**           →  <strong>bold</strong>
 *   [link text](url)   →  <a href="url" target="_blank" …>link text</a>
 *
 * The renderer returns an array of React nodes suitable for splatting into a
 * paragraph or span. It is intentionally non-recursive: bold inside a link or
 * vice versa is not supported (and not needed by current content).
 */

export function renderInlineMarkup(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Match **bold** or [text](url)
  const regex = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Push text before this match
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1] !== undefined) {
      // **bold**
      nodes.push(
        <strong key={match.index} className="font-semibold text-foreground">
          {match[1]}
        </strong>,
      );
    } else if (match[2] !== undefined && match[3] !== undefined) {
      // [text](url)
      nodes.push(
        <a
          key={match.index}
          href={match[3]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
        >
          {match[2]}
        </a>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  // Trailing text
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}
