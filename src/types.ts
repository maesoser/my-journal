import type { JournalSession } from "./durable-objects/journal-session";

export interface Env {
  JOURNAL_SESSION: DurableObjectNamespace<JournalSession>;
  AI: Ai;
  ASSETS: Fetcher;
  DB: D1Database;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

// Workers AI types for models not yet in @cloudflare/workers-types
export type AiTextGenerationModel =
  | "@cf/meta/llama-3.1-8b-instruct"
  | "@cf/meta/llama-3.2-3b-instruct"
  | "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

export interface AiTextGenerationInput {
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stream?: boolean;
}

export interface AiTextGenerationOutput {
  response: string;
}

export async function runTextGeneration(
  ai: Ai,
  model: AiTextGenerationModel,
  input: AiTextGenerationInput
): Promise<AiTextGenerationOutput> {
  const result = await ai.run(model as Parameters<Ai["run"]>[0], input);
  return result as AiTextGenerationOutput;
}
