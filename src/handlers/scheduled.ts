import type { Env } from "../types";
import { getTodayDateString } from "../lib/utils";
import { synthesizeJournal } from "../lib/synthesis";

export async function handleScheduled(env: Env): Promise<void> {
  const dateKey = getTodayDateString();
  const sessionId = env.JOURNAL_SESSION.idFromName(`session-${dateKey}`);
  const session = env.JOURNAL_SESSION.get(sessionId);

  const transcript = await session.getTranscript(dateKey);

  if (!transcript) {
    console.log(`No messages to synthesize for ${dateKey}`);
    return;
  }

  const markdown = await synthesizeJournal(env, transcript, dateKey);

  // Upsert journal entry in D1 with content
  const size = new TextEncoder().encode(markdown).length;
  await env.DB.prepare(
    `INSERT INTO journal_entries (date, size, content, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(date) DO UPDATE SET
       size = excluded.size,
       content = excluded.content,
       updated_at = datetime('now')`
  ).bind(dateKey, size, markdown).run();

  console.log(`Journal synthesized and saved for ${dateKey}`);
}
