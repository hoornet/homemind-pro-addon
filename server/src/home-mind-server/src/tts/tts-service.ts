/**
 * Text-to-speech service.
 * Currently only the OpenAI TTS API is supported.
 * When TTS_PROVIDER is not set (or "none"), the service is disabled
 * and the /api/tts endpoint returns 501.
 */

import OpenAI from "openai";
import type { Config } from "../config.js";

export interface ITtsService {
  synthesize(text: string, language?: string): Promise<Buffer>;
}

export class OpenAITtsService implements ITtsService {
  private client: OpenAI;
  private model: string;
  private voice: string;

  constructor(apiKey: string, model: string, voice: string, baseUrl?: string) {
    this.client = new OpenAI({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });
    this.model = model;
    this.voice = voice;
  }

  async synthesize(text: string, _language?: string): Promise<Buffer> {
    // OpenAI TTS detects language automatically from input text — no explicit language param needed
    const response = await this.client.audio.speech.create({
      model: this.model,
      voice: this.voice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer",
      input: text,
    });
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

export function createTtsService(config: Config): ITtsService | null {
  if (config.ttsProvider === "none") return null;

  const apiKey = config.ttsApiKey ?? config.openaiApiKey;
  if (!apiKey) return null;

  return new OpenAITtsService(apiKey, config.ttsModel, config.ttsVoice, config.ttsBaseUrl ?? config.openaiBaseUrl);
}
