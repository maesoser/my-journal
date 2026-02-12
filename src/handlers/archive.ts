import type { Env } from "../types";
import { getTodayDateString } from "../lib/utils";
import { synthesizeJournal } from "../lib/synthesis";

export async function handleFinalize(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const dateKey = url.searchParams.get("date") || getTodayDateString();

  const sessionId = env.JOURNAL_SESSION.idFromName(`session-${dateKey}`);
  const session = env.JOURNAL_SESSION.get(sessionId);

  const transcript = await session.getTranscript(dateKey);

  if (!transcript) {
    return Response.json(
      { error: "No messages found for this date" },
      { status: 404 }
    );
  }

  const markdown = await synthesizeJournal(env, transcript, dateKey);

  await env.JOURNAL_BUCKET.put(`${dateKey}.md`, markdown, {
    httpMetadata: { contentType: "text/markdown" },
  });

  // Upsert journal entry in D1
  const size = new TextEncoder().encode(markdown).length;
  await env.DB.prepare(
    `INSERT INTO journal_entries (date, size, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(date) DO UPDATE SET size = excluded.size, updated_at = datetime('now')`
  ).bind(dateKey, size).run();

  // We don't want to clear the session because we could keep building today's journal entry
  // await session.clearMessages(dateKey);

  return Response.json({
    success: true,
    date: dateKey,
    size,
    message: "Journal synthesized and saved to R2",
  });
}

export async function handleArchiveList(env: Env): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT date, size, keywords, created_at, updated_at FROM journal_entries ORDER BY date DESC`
  ).all();

  return Response.json({ archives: result.results });
}

export async function handleArchiveGet(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const dateKey = url.searchParams.get("date");

  if (!dateKey) {
    return Response.json({ error: "Date parameter required" }, { status: 400 });
  }

  const object = await env.JOURNAL_BUCKET.get(`${dateKey}.md`);

  if (!object) {
    return Response.json(
      { error: "Journal not found for this date" },
      { status: 404 }
    );
  }

  const content = await object.text();
  return Response.json({ date: dateKey, content });
}
