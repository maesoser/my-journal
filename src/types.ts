import type { JournalSession } from "./durable-objects/journal-session";

export interface Env {
  JOURNAL_SESSION: DurableObjectNamespace<JournalSession>;
  JOURNAL_BUCKET: R2Bucket;
  AI: Ai;
  ASSETS: Fetcher;
  DB: D1Database;
}

export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}
