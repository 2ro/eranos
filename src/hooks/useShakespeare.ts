// Types for Shakespeare API (compatible with OpenAI ChatCompletionMessageParam)
interface ToolCallFunction {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | null | Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: {
      url: string;
    };
  }>;
  /** Present on assistant messages that invoke tools. */
  tool_calls?: ToolCallFunction[];
  /** Present on tool result messages — must match a tool_calls[].id from the preceding assistant message. */
  tool_call_id?: string;
}

