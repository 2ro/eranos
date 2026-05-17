import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useSeoMeta } from '@unhead/react';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { Bot, Loader2, Send, Square, Trash2 } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useAIChatSession } from '@/hooks/useAIChatSession';
import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useLayoutOptions } from '@/contexts/LayoutContext';

import type { DisplayMessage, ToolCall } from '@/lib/aiChatTools';

// ─── Slash Commands ───

const SLASH_COMMANDS = [
  { command: '/clear', description: 'Clear conversation history' },
  { command: '/new', description: 'Start a new conversation' },
  { command: '/tools', description: 'List available tools' },
];

// ─── Page Component ───

export function AIChatPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();

  useSeoMeta({
    title: `Agent | ${config.appName}`,
    description: 'Chat with your AI agent',
  });

  useLayoutOptions({ noOverscroll: true });

  if (!user) {
    return (
      <main className="flex flex-col items-center justify-center p-6 gap-6">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <Bot className="size-12 text-primary" />
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Agent</h1>
            <p className="text-muted-foreground">Log in with your Nostr account to start using the Agent.</p>
          </div>
          <LoginArea className="mt-2" />
        </div>
      </main>
    );
  }

  return <AgentChatView />;
}

// ─── Chat View ───

function AgentChatView() {
  const {
    messages,
    input,
    setInput,
    isStreaming,
    streamingText,
    selectedModel,
    apiLoading,
    apiError,
    messagesEndRef,
    capacity,
    lastPromptTokens,
    contextWindow,
    storageBytes,
    maxStorageBytes,
    handleSend,
    handleStop,
    handleKeyDown,
    handleClear,
  } = useAIChatSession();

  return (
    <main className="flex flex-col ai-chat-height sidebar:h-dvh overflow-hidden">
      {/* Header */}
      <PageHeader titleContent={
        <div className="hidden sidebar:flex items-center gap-2 flex-1 min-w-0">
          <Bot className="size-5" />
          <h1 className="text-xl font-bold truncate">Agent</h1>
        </div>
      }>
        <div className="flex items-center gap-2 ml-auto">
          <CapacityRing
            capacity={capacity}
            promptTokens={lastPromptTokens}
            contextWindow={contextWindow}
            storageBytes={storageBytes}
            maxStorageBytes={maxStorageBytes}
          />
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={handleClear}
            disabled={messages.length === 0}
            title="Clear conversation"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </PageHeader>

      {/* Messages Area */}
      {messages.length === 0 && !streamingText ? (
        <div className="flex-1 flex items-center justify-center px-4">
          <EmptyState onSuggestion={handleSend} />
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
            {messages.map((msg) => (
              msg.role !== 'tool_result' && <MessageBubble key={msg.id} message={msg} />
            ))}

            {/* Streaming text */}
            {streamingText && (
              <div className="flex items-start">
                <div className="flex flex-col gap-1 max-w-[85%] min-w-0">
                  <div className="rounded-2xl px-4 py-2.5 text-sm bg-secondary/60 border border-border rounded-tl-md">
                    <div className="prose prose-sm max-w-none overflow-wrap-anywhere text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-2 prose-code:text-xs prose-code:text-primary prose-code:font-medium prose-a:text-primary">
                      <Markdown rehypePlugins={[rehypeSanitize]}>
                        {streamingText}
                      </Markdown>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Loading indicator */}
            {(isStreaming || apiLoading) && !streamingText && <ThinkingIndicator />}

            {/* Error display */}
            {apiError && (
              apiError.includes('run out of credits') ? (
                <ErrorBanner
                  heading="Agent is temporarily unavailable."
                  body="Please try again in a moment."
                />
              ) : apiError.includes('Rate limited') ? (
                <ErrorBanner
                  heading="Rate limited."
                  body="You're sending messages too fast. Please wait a moment and try again."
                />
              ) : null
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      )}

      {/* Input Area */}
      <div className="shrink-0 px-4 pt-2 pb-4 sidebar:pb-3">
        <div className="max-w-2xl mx-auto flex items-end gap-2">
          <SlashCommandInput
            value={input}
            onChange={setInput}
            onKeyDown={handleKeyDown}
            onSend={handleSend}
            placeholder={!selectedModel ? 'Loading...' : 'Send a message...'}
            disabled={!selectedModel || (isStreaming && !streamingText)}
          />
          {isStreaming ? (
            <Button
              onClick={handleStop}
              size="icon"
              variant="outline"
              className="size-11 shrink-0 rounded-xl"
              title="Stop generating"
            >
              <Square className="size-4" />
            </Button>
          ) : (
            <Button
              onClick={() => handleSend()}
              disabled={!input.trim() || !selectedModel}
              size="icon"
              className="size-11 shrink-0 rounded-xl"
            >
              <Send className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}

// ─── Sub-Components ───

function ThinkingIndicator() {
  return (
    <div className="flex items-start">
      <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-md border border-border bg-secondary/60 px-4 py-3 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" />
        <span>Thinking...</span>
      </div>
    </div>
  );
}

function ErrorBanner({ heading, body }: { heading: string; body: string }) {
  return (
    <div className="rounded-2xl bg-secondary/60 border border-border px-4 py-4 text-sm space-y-2">
      <p className="font-medium text-foreground">{heading}</p>
      <p className="text-muted-foreground">{body}</p>
    </div>
  );
}

const AGENT_GREETINGS = [
  "How can I help you today?",
  "What would you like to know?",
  "Ready when you are.",
];

const SUGGESTIONS = [
  "What are my friends talking about?",
  "What's happening in the world?",
];

function EmptyState({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  const greeting = useMemo(() => AGENT_GREETINGS[Math.floor(Math.random() * AGENT_GREETINGS.length)], []);

  return (
    <div className="flex flex-col items-center justify-center gap-8 text-center select-none animate-in fade-in duration-500">
      <Bot className="size-12 text-primary" />
      <div className="space-y-2">
        <h2 className="text-base font-semibold tracking-tight text-foreground">Agent</h2>
        <p className="text-sm text-muted-foreground">{greeting}</p>
      </div>

      <div className="flex flex-wrap justify-center gap-2 max-w-md">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onSuggestion(s)}
            className="px-4 py-2 rounded-full text-sm border border-border bg-secondary/40 hover:bg-secondary/80 text-foreground transition-colors"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: DisplayMessage }) {
  const isUser = message.role === 'user';

  // System notices — info vs error styling
  if (message.noticeVariant) {
    const isError = message.noticeVariant === 'error';
    return (
      <div className="flex items-start">
        <div className="max-w-[85%] min-w-0">
          <div className={cn(
            'rounded-2xl px-4 py-2.5 text-sm rounded-tl-md border',
            isError
              ? 'bg-red-500/15 border-red-500/25 text-red-700 dark:text-red-400'
              : 'bg-primary/15 border-primary/25 text-primary',
          )}>
            <div className={cn(
              'prose prose-sm max-w-none overflow-wrap-anywhere prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-code:text-xs',
              isError
                ? 'text-red-700 dark:text-red-400 prose-strong:text-red-800 dark:prose-strong:text-red-300 prose-code:text-red-600 dark:prose-code:text-red-400 marker:text-red-700 dark:marker:text-red-400'
                : 'text-primary prose-strong:text-primary prose-code:text-primary/80 marker:text-primary',
            )}>
              <Markdown rehypePlugins={[rehypeSanitize]}>
                {message.content}
              </Markdown>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex items-start', isUser && 'justify-end')}>
      <div className={cn('flex flex-col gap-1 max-w-[85%] min-w-0', isUser && 'items-end')}>
        {/* Hide the bubble entirely when the assistant message is empty (tool-only turn) */}
        {(isUser || message.content.trim()) && (
          <div
            className={cn(
              'rounded-2xl px-4 py-2.5 text-sm',
              isUser
                ? 'bg-primary text-primary-foreground rounded-tr-md'
                : 'bg-secondary/60 border border-border rounded-tl-md',
            )}
          >
            {isUser ? (
              <p className="whitespace-pre-wrap overflow-wrap-anywhere">{message.content}</p>
            ) : (
              <div className="prose prose-sm max-w-none overflow-wrap-anywhere text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-2 prose-code:text-xs prose-code:text-primary prose-code:font-medium prose-a:text-primary">
                <Markdown rehypePlugins={[rehypeSanitize]}>
                  {message.content}
                </Markdown>
              </div>
            )}
          </div>
        )}

        {/* Tool call indicators */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {message.toolCalls.map((tc) => (
              <ToolCallBadge key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        <span className="text-[10px] text-muted-foreground/60 px-1">
          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
}

/** Text input with a slash-command autocomplete dropdown. */
function SlashCommandInput({ value, onChange, onKeyDown, onSend, placeholder, disabled }: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSend: (override?: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [menuDismissed, setMenuDismissed] = useState(false);

  // Filter commands based on input
  const matches = useMemo(() => {
    if (!value.startsWith('/') || menuDismissed) return [];
    const typed = value.toLowerCase();
    return SLASH_COMMANDS.filter((c) => c.command.startsWith(typed));
  }, [value, menuDismissed]);

  const showMenu = matches.length > 0 && !disabled;

  // Reset selection when matches change
  useEffect(() => {
    setSelectedIndex(0);
  }, [matches.length]);

  // Un-dismiss when input stops being a slash command or is cleared
  useEffect(() => {
    if (!value.startsWith('/')) setMenuDismissed(false);
  }, [value]);

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setMenuDismissed(true);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showMenu]);

  const selectCommand = useCallback((cmd: string) => {
    onChange(cmd);
    setMenuDismissed(true);
    // Auto-send slash commands immediately
    onSend(cmd);
  }, [onChange, onSend]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (showMenu) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + matches.length) % matches.length);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % matches.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        selectCommand(matches[selectedIndex].command);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMenuDismissed(true);
        return;
      }
    }
    // Fall through to parent handler (Enter → send, etc.)
    onKeyDown(e);
  }, [showMenu, matches, selectedIndex, selectCommand, onKeyDown]);

  return (
    <div ref={wrapperRef} className="relative flex-1 min-w-0">
      {/* Autocomplete menu */}
      {showMenu && (
        <div className="absolute bottom-full left-0 right-0 mb-1.5 rounded-xl border border-border bg-popover shadow-lg overflow-hidden animate-in fade-in-0 slide-in-from-bottom-2 duration-150 z-10">
          {matches.map((cmd, i) => (
            <button
              key={cmd.command}
              className={cn(
                'w-full flex items-center gap-3 px-3.5 py-2.5 text-left text-sm transition-colors',
                i === selectedIndex ? 'bg-secondary' : 'hover:bg-secondary/50',
              )}
              onMouseEnter={() => setSelectedIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault(); // Keep textarea focus
                selectCommand(cmd.command);
              }}
            >
              <span className="font-mono text-xs font-semibold text-foreground">{cmd.command}</span>
              <span className="text-muted-foreground text-xs">{cmd.description}</span>
            </button>
          ))}
        </div>
      )}
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="min-h-[44px] max-h-40 resize-none bg-secondary/50 border-border focus-visible:ring-1"
        rows={1}
      />
    </div>
  );
}

/** Conversation capacity ring — appears at ≥75% usage. */
function CapacityRing({ capacity, promptTokens, contextWindow, storageBytes, maxStorageBytes }: {
  capacity: number;
  promptTokens: number;
  contextWindow: number;
  storageBytes: number;
  maxStorageBytes: number;
}) {
  if (capacity < 0.75) return null;

  const pct = Math.min(capacity * 100, 100);
  const size = 20;
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  // Color: amber at 75-89%, red at 90%+
  const ringColor = pct >= 90 ? 'text-destructive' : 'text-amber-500';

  const tokenPct = contextWindow > 0 ? ((promptTokens / contextWindow) * 100).toFixed(0) : '\u2014';
  const storageMB = (storageBytes / (1024 * 1024)).toFixed(1);
  const maxMB = (maxStorageBytes / (1024 * 1024)).toFixed(0);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="cursor-help shrink-0">
            <svg width={size} height={size} className="transform -rotate-90" viewBox={`0 0 ${size} ${size}`}>
              <circle
                cx={size / 2} cy={size / 2} r={radius}
                fill="none" stroke="currentColor" strokeWidth={strokeWidth}
                className="text-muted/30"
              />
              <circle
                cx={size / 2} cy={size / 2} r={radius}
                fill="none" stroke="currentColor" strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                className={`${ringColor} transition-all duration-300 ease-in-out`}
              />
            </svg>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">
            Tokens: {promptTokens.toLocaleString()} / {contextWindow.toLocaleString()} ({tokenPct}%)
            <br />
            Storage: {storageMB} / {maxMB} MB
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ToolCallBadge({ toolCall }: { toolCall: ToolCall }) {
  let resultParsed: { success?: boolean; error?: string } = {};
  try {
    resultParsed = JSON.parse(toolCall.result || '{}');
  } catch {
    // ignore
  }

  const isSuccess = resultParsed.success === true || !resultParsed.error;

  const TOOL_LABELS: Record<string, string> = {
    get_feed: 'Read feed',
    search_users: 'Search users',
    search_follow_packs: 'Search follow packs',
    fetch_page: 'Fetch page',
    fetch_event: 'Fetch event',
  };

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium',
      isSuccess
        ? 'bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20'
        : 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-500/20',
    )}>
      {resultParsed.error || TOOL_LABELS[toolCall.name] || toolCall.name}
    </span>
  );
}
