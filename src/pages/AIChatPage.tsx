import { useMemo } from 'react';
import { useSeoMeta } from '@unhead/react';
import Markdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { Bot, Send, Square, Trash2 } from 'lucide-react';

import { PageHeader } from '@/components/PageHeader';
import { useShakespeareCredits } from '@/hooks/useShakespeare';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useAppContext } from '@/hooks/useAppContext';
import { useAIChatSession } from '@/hooks/useAIChatSession';
import { LoginArea } from '@/components/auth/LoginArea';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { DorkThinking } from '@/components/DorkThinking';
import { useLayoutOptions } from '@/contexts/LayoutContext';

import type { DisplayMessage, ToolCall } from '@/lib/aiChatTools';

// ─── Page Component ───

export function AIChatPage() {
  const { config } = useAppContext();
  const { user } = useCurrentUser();
  const hasCredits = useShakespeareCredits();

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

  return <AgentChatView hasCredits={hasCredits} />;
}

// ─── Chat View ───

function AgentChatView({ hasCredits }: { hasCredits: boolean | null }) {
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
          <EmptyState hasCredits={hasCredits} onSuggestion={handleSend} />
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
                    <div className="prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-2 prose-code:text-xs prose-a:text-primary">
                      <Markdown rehypePlugins={[rehypeSanitize]}>
                        {streamingText}
                      </Markdown>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Loading indicator */}
            {(isStreaming || apiLoading) && !streamingText && messages[messages.length - 1]?.role === 'user' && (
              <div className="flex items-start">
                <div className="rounded-2xl px-4 py-3 bg-secondary/60 border border-border rounded-tl-md">
                  <DorkThinking />
                </div>
              </div>
            )}

            {/* Error display */}
            {apiError && (
              apiError.includes('run out of credits') ? (
                <ErrorBanner
                  heading="You've run out of credits."
                  body="Add more on"
                />
              ) : apiError.includes('Rate limited') ? (
                <ErrorBanner
                  heading="Rate limited."
                  body="You're sending messages too fast. Grab some credits on"
                />
              ) : (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-3">
                  {apiError}
                </div>
              )
            )}

            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>
      )}

      {/* Input Area — hidden when user has no credits */}
      {(hasCredits || hasCredits === null) && (
        <div className="shrink-0 px-4 pt-2 pb-4 sidebar:pb-3">
          <div className="max-w-2xl mx-auto flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={!selectedModel ? 'Loading...' : 'Send a message...'}
              disabled={!selectedModel || (isStreaming && !streamingText)}
              className="min-h-[44px] max-h-40 resize-none bg-secondary/50 border-border focus-visible:ring-1"
              rows={1}
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
      )}
    </main>
  );
}

// ─── Sub-Components ───

function ErrorBanner({ heading, body }: { heading: string; body: string }) {
  const shakespeareLink = (
    <a
      href="https://shakespeare.diy"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-primary hover:underline"
    >
      Shakespeare
    </a>
  );

  return (
    <div className="rounded-2xl bg-secondary/60 border border-border px-4 py-4 text-sm space-y-2">
      <p className="font-medium text-foreground">{heading}</p>
      <p className="text-muted-foreground">
        {body} {shakespeareLink} to keep chatting.
      </p>
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
  "What's happening on Nostr right now?",
];

function EmptyState({ hasCredits, onSuggestion }: { hasCredits: boolean | null; onSuggestion: (text: string) => void }) {
  const greeting = useMemo(() => AGENT_GREETINGS[Math.floor(Math.random() * AGENT_GREETINGS.length)], []);

  return (
    <div className="flex flex-col items-center justify-center gap-8 text-center select-none animate-in fade-in duration-500">
      <Bot className="size-12 text-primary" />
      <div className="space-y-2">
        <h2 className="text-base font-semibold tracking-tight text-foreground">Agent</h2>
        <p className="text-sm text-muted-foreground">{greeting}</p>
      </div>

      {hasCredits !== false && (
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
      )}

      {hasCredits === false && (
        <div className="flex flex-col items-center gap-4 max-w-xs">
          <p className="text-sm text-muted-foreground leading-relaxed">
            You need credits to use the Agent. Get some on Shakespeare to get started.
          </p>
          <a
            href="https://shakespeare.diy"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Get Credits
          </a>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: DisplayMessage }) {
  const isUser = message.role === 'user';

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
              <p className="whitespace-pre-wrap break-words">{message.content}</p>
            ) : (
              <div className="prose prose-sm max-w-none text-foreground prose-headings:text-foreground prose-strong:text-foreground prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-pre:my-2 prose-code:text-xs prose-a:text-primary">
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
