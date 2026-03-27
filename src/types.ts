import type { JournalSession } from "./durable-objects/journal-session";

// ---- Task types ----

export type TaskCategory = "must-do" | "maybe" | "backlog";
export type TaskStatus   = "open" | "done" | "removed";

export interface Task {
  id: number;
  title: string;
  notes: string;
  category: TaskCategory;
  status: TaskStatus;
  tags: string;           // comma-separated, e.g. "work,personal"
  estimate_minutes: number | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
  source_date: string | null;
}

export interface TaskCreateInput {
  title: string;
  notes?: string;
  category?: TaskCategory;
  tags?: string;
  estimate_minutes?: number | null;
  due_date?: string | null;
  source_date?: string | null;
}

export interface TaskUpdateInput {
  title?: string;
  notes?: string;
  category?: TaskCategory;
  status?: TaskStatus;
  tags?: string;
  estimate_minutes?: number | null;
  due_date?: string | null;
}

// AI-extracted task shape returned from the extraction prompt
export interface ExtractedTask {
  title: string;
  category: TaskCategory;
  tags: string[];
  estimate_minutes: number | null;
}

// ---- App env ----

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
