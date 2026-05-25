import type { NostrEvent } from '@nostrify/nostrify';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { NoteCard } from '@/components/NoteCard';
import { cn } from '@/lib/utils';

/** Maximum nesting depth before collapsing the rest of the thread. */
const MAX_RENDER_DEPTH = 3;

export interface ReplyNode {
  event: NostrEvent;
  children: ReplyNode[];
  /** Sibling replies hidden from the inline thread chain. Revealed on demand. */
  hiddenChildren?: ReplyNode[];
}

/** Per-event customization hooks forwarded to each rendered `NoteCard`. */
interface ReplyListOptions {
  /** Renders a header row above each comment (e.g. pin controls). */
  renderItemHeader?: (event: NostrEvent) => ReactNode;
  /** Renders a badge inside each comment's author name row (e.g. role marker). */
  renderAuthorBadge?: (event: NostrEvent) => ReactNode;
  /**
   * Suppress the per-comment "Commenting on …" context line. The page
   * already establishes what's being commented on, so the row is just
   * noise.
   */
  hideCommentContext?: boolean;
  /**
   * Extra className applied to non-threaded leaf comments. Use this to
   * loosen vertical padding (e.g. `py-4`) on pages that want more
   * breathing room between items. Skipped for threaded mid-items so
   * the in-thread "butt up against next" layout is preserved.
   */
  leafCardClassName?: string;
}

/** Renders a fully threaded reply tree with collapsible deep branches. */
export function ThreadedReplyList({
  roots,
  ...options
}: { roots: ReplyNode[] } & ReplyListOptions) {
  return (
    <div>
      {roots.map((node) => (
        <ReplyThread key={node.event.id} node={node} depth={0} {...options} />
      ))}
    </div>
  );
}

function ReplyThread({
  node,
  depth,
  depthless,
  renderItemHeader,
  renderAuthorBadge,
  hideCommentContext,
  leafCardClassName,
}: { node: ReplyNode; depth: number; depthless?: boolean } & ReplyListOptions) {
  const [expanded, setExpanded] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const hasChildren = node.children.length > 0;
  const hiddenCount = node.hiddenChildren?.length ?? 0;
  const shouldCollapse = !depthless && depth >= MAX_RENDER_DEPTH && hasChildren && !expanded;

  if (shouldCollapse) {
    return (
      <div className="relative group/note">
        {renderItemHeader?.(node.event)}
        <NoteCard
          event={node.event}
          threaded
          authorBadge={renderAuthorBadge?.(node.event)}
          hideCommentContext={hideCommentContext}
        />
        <ExpandThreadButton count={countDescendants(node)} onClick={() => setExpanded(true)} isLast />
      </div>
    );
  }

  if (!hasChildren) {
    return (
      <div className="relative group/note">
        {renderItemHeader?.(node.event)}
        <NoteCard
          event={node.event}
          className={leafCardClassName}
          authorBadge={renderAuthorBadge?.(node.event)}
          hideCommentContext={hideCommentContext}
        />
      </div>
    );
  }

  // Once expanded past the depth cap, skip further caps for this subtree
  const childDepthless = depthless || expanded;

  return (
    <div className="relative group/note">
      {renderItemHeader?.(node.event)}
      <NoteCard
        event={node.event}
        threaded
        authorBadge={renderAuthorBadge?.(node.event)}
        hideCommentContext={hideCommentContext}
      />
      {/* Show hidden sibling count between parent and first child */}
      {hiddenCount > 0 && !showHidden && (
        <ExpandThreadButton count={hiddenCount} onClick={() => setShowHidden(true)} />
      )}
      {/* Revealed hidden siblings render as threaded items before the inline child */}
      {showHidden && node.hiddenChildren!.map((child) => (
        <div key={child.event.id} className="relative group/note">
          {renderItemHeader?.(child.event)}
          <NoteCard
            event={child.event}
            threaded
            threadedLineClassName="bg-primary/30"
            authorBadge={renderAuthorBadge?.(child.event)}
            hideCommentContext={hideCommentContext}
          />
        </div>
      ))}
      {node.children.map((child) => (
        <ReplyThread
          key={child.event.id}
          node={child}
          depth={depth + 1}
          depthless={childDepthless}
          renderItemHeader={renderItemHeader}
          renderAuthorBadge={renderAuthorBadge}
          hideCommentContext={hideCommentContext}
          leafCardClassName={leafCardClassName}
        />
      ))}
    </div>
  );
}

function countDescendants(node: ReplyNode): number {
  let count = 0;
  for (const child of node.children) {
    count += 1 + countDescendants(child);
  }
  return count;
}

function ExpandThreadButton({ count, onClick, isLast }: { count: number; onClick: () => void; isLast?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        // Soft, GoFundMe-style "Show more" affordance — no cascading dots,
        // just a thin connector that fades into the label. Sits flush
        // under the parent comment's avatar column so the eye follows the
        // thread naturally.
        "group flex items-center gap-3 w-full px-4 py-2.5 text-left hover:bg-secondary/30 transition-colors",
        isLast && "border-b border-border",
      )}
    >
      <div className="flex justify-center w-10 shrink-0">
        <div className="w-0.5 h-5 rounded-full bg-foreground/15 group-hover:bg-primary/40 transition-colors" />
      </div>
      <span className="text-sm text-primary font-medium group-hover:underline">
        Show {count} more {count === 1 ? 'reply' : 'replies'}
      </span>
    </button>
  );
}

// ── Flat interface (for pages that don't need full threading) ──

interface ThreadedReply {
  reply: NostrEvent;
  firstSubReply?: NostrEvent;
}

/** Renders replies as a flat list, each with at most one sub-reply hint. */
export function FlatThreadedReplyList({ replies }: { replies: ThreadedReply[] }) {
  return (
    <div>
      {replies.map(({ reply, firstSubReply }) => (
        <div key={reply.id}>
          <NoteCard event={reply} threaded={!!firstSubReply} />
          {firstSubReply && <NoteCard event={firstSubReply} threadedLast />}
        </div>
      ))}
    </div>
  );
}
