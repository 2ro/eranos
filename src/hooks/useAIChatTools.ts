import { useCallback, useMemo } from 'react';
import { useNostr } from '@nostrify/react';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useSavedFeeds } from '@/hooks/useSavedFeeds';
import { truncateToolResult } from '@/lib/tools/truncateToolResult';
import { toolToOpenAI } from '@/lib/tools/toolToOpenAI';

import { SearchUsersTool } from '@/lib/tools/SearchUsersTool';
import { SearchFollowPacksTool } from '@/lib/tools/SearchFollowPacksTool';
import { FetchPageTool } from '@/lib/tools/FetchPageTool';
import { FetchEventTool } from '@/lib/tools/FetchEventTool';
import { GetFeedTool } from '@/lib/tools/GetFeedTool';

import type { Tool, ToolContext, ToolResult } from '@/lib/tools/Tool';

// ─── Tool Registry ───

/** All registered tools, keyed by name. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TOOL_REGISTRY: Record<string, Tool<any>> = {
  search_users: SearchUsersTool,
  search_follow_packs: SearchFollowPacksTool,
  fetch_page: FetchPageTool,
  fetch_event: FetchEventTool,
  get_feed: GetFeedTool,
};

/** OpenAI-formatted tool definitions derived from the registry. */
export const TOOLS = Object.entries(TOOL_REGISTRY).map(
  ([name, tool]) => toolToOpenAI(name, tool),
);

/** Short human-readable summaries for each tool (name → first sentence of description). */
export const TOOL_SUMMARIES: { name: string; summary: string }[] = Object.entries(TOOL_REGISTRY).map(
  ([name, tool]) => ({
    name,
    summary: tool.description.split(/[.\n]/)[0].trim(),
  }),
);

// ─── Hook ───

export function useAIChatTools() {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { config } = useAppContext();
  const { savedFeeds } = useSavedFeeds();

  /** Build a ToolContext from current hook values. */
  const buildContext = useCallback((): ToolContext => ({
    nostr,
    user: user ? { pubkey: user.pubkey } : undefined,
    config: {
      corsProxy: config.corsProxy,
      feedSettings: config.feedSettings,
    },
    savedFeeds,
  }), [nostr, user, config, savedFeeds]);

  const executeToolCall = useCallback(async (name: string, rawArgs: Record<string, unknown>): Promise<ToolResult> => {
    const tool = TOOL_REGISTRY[name];
    if (!tool) {
      return { result: JSON.stringify({ error: `Unknown tool: ${name}` }) };
    }

    try {
      // Validate and parse args through the tool's Zod schema.
      const args = tool.inputSchema.parse(rawArgs);
      const ctx = buildContext();
      const toolResult = await tool.execute(args, ctx);

      return {
        result: truncateToolResult(toolResult.result),
        nostrEvent: toolResult.nostrEvent,
      };
    } catch (err) {
      return { result: JSON.stringify({ error: `Tool "${name}" failed: ${err instanceof Error ? err.message : 'Unknown error'}` }) };
    }
  }, [buildContext]);

  // Expose savedFeeds for the system prompt (saved feed labels)
  const savedFeedsMemo = useMemo(() => savedFeeds, [savedFeeds]);

  return { executeToolCall, savedFeeds: savedFeedsMemo };
}
