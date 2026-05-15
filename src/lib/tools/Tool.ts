import type { z } from 'zod';
import type { NostrEvent } from '@nostrify/nostrify';

/** Result returned by a tool's execute method. */
export interface ToolResult {
  /** JSON string returned to the AI as the tool result. */
  result: string;
  /** A Nostr event published by the tool, rendered inline in the chat. */
  nostrEvent?: NostrEvent;
}

/** Tool interface — each tool defines its schema, description, and execution logic. */
export interface Tool<TParams = unknown> {
  /** Human-readable description shown to the AI model. */
  description: string;
  /** Zod schema for validating and parsing tool arguments. */
  inputSchema: z.ZodType<TParams>;
  /** Execute the tool with validated arguments. */
  execute(args: TParams, ctx: ToolContext): Promise<ToolResult>;
}

/**
 * Runtime context injected into every tool execution.
 *
 * Holds the dependencies that come from React hooks (nostr, user, config, etc.)
 * so that Tool classes remain plain objects without hook coupling.
 */
export interface ToolContext {
  /** Nostr protocol client for querying events. */
  nostr: {
    query: (filters: import('@nostrify/nostrify').NostrFilter[], opts?: { signal?: AbortSignal }) => Promise<NostrEvent[]>;
    group: (relays: string[]) => {
      query: (filters: import('@nostrify/nostrify').NostrFilter[], opts?: { signal?: AbortSignal }) => Promise<NostrEvent[]>;
    };
  };
  /** Currently logged-in user, or undefined if not logged in. */
  user?: {
    pubkey: string;
  };
  /** App configuration values. */
  config: {
    corsProxy: string;
    feedSettings: import('@/contexts/AppContext').FeedSettings;
  };
  /** Saved feed definitions. */
  savedFeeds: Array<{
    id: string;
    label: string;
    filter: Record<string, unknown>;
    vars: Array<{ name: string; tagName: string; pointer: string }>;
    createdAt: number;
  }>;
}
