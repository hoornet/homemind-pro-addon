/**
 * LLM Interface
 *
 * Provider-agnostic interfaces for chat and fact extraction.
 * Concrete implementations (Anthropic, OpenAI, etc.) implement these.
 */

import type { ExtractedFact, Fact } from "../memory/types.js";

// Chat types (LLM-agnostic)
export interface ChatRequest {
  message: string;
  userId: string;
  conversationId?: string;
  isVoice?: boolean;
  customPrompt?: string;
  /** Optional images (data URLs or https URLs) for vision-capable models. */
  images?: string[];
  /**
   * The caller's UI language (e.g. "sl", "en-US"). Used only as a tie-breaker
   * in the system prompt when the user's own words don't indicate a language.
   */
  language?: string;
}

/**
 * Structured failure information emitted when chat produces no usable
 * response (no text and no tool call). The HA integration surfaces
 * `hint` to the user instead of the generic "I received your request but
 * got no response." fallback, so failures are diagnosable from HA Assist
 * without needing server logs.
 */
export interface ChatError {
  code:
    | "EMPTY_CONTENT"
    | "MAX_TOKENS_TRUNCATED"
    | "CONTENT_FILTERED";
  hint: string;
}

export interface ChatResponse {
  response: string;
  toolsUsed: string[];
  factsLearned: number;
  error?: ChatError;
}

export type StreamCallback = (chunk: string) => void;

/**
 * What a caller can watch while a reply is produced. A bare `onChunk`
 * function is the historical form and is still accepted everywhere a
 * ChatStreamEvents is; `toStreamEvents` normalizes the two.
 */
export interface ChatStreamEvents {
  /** Text of the reply as the model writes it, every turn included. */
  onChunk?: StreamCallback;
  /**
   * A new assistant message begins: one per model turn. The text before a
   * batch of tool calls and the answer after it are different messages, and a
   * caller that renders them needs the seam.
   */
  onTurn?: () => void;
  /**
   * The server's own heads-up, sent before a batch of tools that will take a
   * while when the model wrote nothing of its own first. Not part of the
   * reply and never stored; a caller may show it and move on.
   */
  onStatus?: (text: string) => void;
}

export function toStreamEvents(
  arg: StreamCallback | ChatStreamEvents | undefined
): ChatStreamEvents {
  if (!arg) return {};
  return typeof arg === "function" ? { onChunk: arg } : arg;
}

// Provider interfaces
export interface IChatEngine {
  chat(request: ChatRequest, events?: StreamCallback | ChatStreamEvents): Promise<ChatResponse>;
}

export interface IFactExtractor {
  extract(
    userMessage: string,
    assistantResponse: string,
    existingFacts?: Fact[]
  ): Promise<ExtractedFact[]>;
}
