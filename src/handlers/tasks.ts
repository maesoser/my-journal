import type {
  Env,
  Task,
  TaskCategory,
  TaskStatus,
  TaskCreateInput,
  TaskUpdateInput,
  ExtractedTask,
} from "../types";
import { runTextGeneration } from "../types";
import { getTodayDateString } from "../lib/utils";

// ============================================================
// AI helpers
// ============================================================

const EXTRACT_SYSTEM_PROMPT = `You are a task-extraction assistant for a personal journal.
Given a conversation between a user and a journaling AI, extract any actionable tasks the user mentions.
For each task output ONLY a JSON array of objects with this exact shape (no markdown, no explanation):
[
  {
    "title": "<short imperative task title>",
    "category": "must-do" | "maybe" | "backlog",
    "tags": ["work"|"personal"|"low-energy-task"],
    "estimate_minutes": <integer or null>
  }
]
Rules:
- category "must-do"  → urgent or time-sensitive tasks mentioned by the user
- category "maybe"    → nice-to-do, not urgent
- category "backlog"  → vague ideas, someday/maybe items
- tags must be from: work, personal, low-energy-task  (pick 1-2 that apply)
- estimate_minutes: your best AI estimate in minutes; null if impossible to guess
- If no tasks are found, return an empty array []
Return ONLY the JSON array, nothing else.`;

const ENRICH_SYSTEM_PROMPT = `You are a productivity assistant. Given a task title and optional notes,
respond with ONLY a JSON object with this exact shape (no markdown, no explanation):
{
  "estimate_minutes": <integer or null>,
  "tags": ["work"|"personal"|"low-energy-task"]
}
- estimate_minutes: realistic time estimate in minutes; null if impossible
- tags: 1-2 tags from the allowed list: work, personal, low-energy-task
Return ONLY the JSON object, nothing else.`;

function extractJson<T>(raw: string): T | null {
  // Strip markdown fences if present, then parse
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Fallback: try to find the first [ or { to end of ] or }
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try { return JSON.parse(arrMatch[0]) as T; } catch { /* ignore */ }
    }
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { return JSON.parse(objMatch[0]) as T; } catch { /* ignore */ }
    }
    return null;
  }
}

async function aiExtractTasks(
  env: Env,
  conversationText: string
): Promise<ExtractedTask[]> {
  const result = await runTextGeneration(env.AI, "@cf/meta/llama-3.1-8b-instruct", {
    messages: [
      { role: "system", content: EXTRACT_SYSTEM_PROMPT },
      { role: "user", content: conversationText },
    ],
    max_tokens: 512,
    temperature: 0.2,
  });

  const parsed = extractJson<ExtractedTask[]>(result.response || "[]");
  if (!Array.isArray(parsed)) return [];

  return parsed.filter(
    (t) =>
      typeof t.title === "string" &&
      t.title.trim() !== "" &&
      ["must-do", "maybe", "backlog"].includes(t.category)
  );
}

async function aiEnrichTask(
  env: Env,
  title: string,
  notes: string
): Promise<{ estimate_minutes: number | null; tags: string }> {
  const result = await runTextGeneration(env.AI, "@cf/meta/llama-3.1-8b-instruct", {
    messages: [
      { role: "system", content: ENRICH_SYSTEM_PROMPT },
      { role: "user", content: `Task: ${title}\nNotes: ${notes || "(none)"}` },
    ],
    max_tokens: 128,
    temperature: 0.2,
  });

  const parsed = extractJson<{ estimate_minutes: number | null; tags: string[] }>(
    result.response || "{}"
  );

  if (!parsed) {
    return { estimate_minutes: null, tags: "" };
  }

  const tags = Array.isArray(parsed.tags)
    ? parsed.tags
        .filter((t) => ["work", "personal", "low-energy-task"].includes(t))
        .join(",")
    : "";

  return {
    estimate_minutes: typeof parsed.estimate_minutes === "number" ? parsed.estimate_minutes : null,
    tags,
  };
}

// ============================================================
// DB helpers
// ============================================================

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as number,
    title: row.title as string,
    notes: (row.notes as string) ?? "",
    category: row.category as TaskCategory,
    status: row.status as TaskStatus,
    tags: (row.tags as string) ?? "",
    estimate_minutes: row.estimate_minutes as number | null,
    due_date: (row.due_date as string) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    source_date: (row.source_date as string) ?? null,
  };
}

// ============================================================
// Scheduled: roll uncompleted daily tasks to backlog
// ============================================================

export async function rolloverTasksToBacklog(env: Env): Promise<void> {
  const today = getTodayDateString();
  // Move all open must-do / maybe tasks from past days to backlog
  await env.DB.prepare(
    `UPDATE tasks
     SET category = 'backlog', updated_at = datetime('now')
     WHERE status = 'open'
       AND category IN ('must-do', 'maybe')
       AND (due_date IS NULL OR due_date < ?)
       AND created_at < ?`
  )
    .bind(today, today + "T00:00:00")
    .run();
}

// ============================================================
// Route handlers
// ============================================================

/** GET /tasks — list all open tasks (optionally filter by category or status) */
export async function handleListTasks(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const category = url.searchParams.get("category");
  const status = url.searchParams.get("status") ?? "open";

  let query = "SELECT * FROM tasks WHERE 1=1";
  const params: (string | number)[] = [];

  if (status !== "all") {
    query += " AND status = ?";
    params.push(status);
  }
  if (category) {
    query += " AND category = ?";
    params.push(category);
  }

  query += " ORDER BY CASE category WHEN 'must-do' THEN 0 WHEN 'maybe' THEN 1 ELSE 2 END, created_at DESC";

  const stmt = env.DB.prepare(query);
  const result = await stmt.bind(...params).all<Record<string, unknown>>();
  const tasks = (result.results ?? []).map(rowToTask);

  return Response.json({ tasks });
}

/** POST /tasks — create a task manually */
export async function handleCreateTask(
  request: Request,
  env: Env
): Promise<Response> {
  const body = await request.json<TaskCreateInput>();

  if (!body.title?.trim()) {
    return Response.json({ error: "title is required" }, { status: 400 });
  }

  const category: TaskCategory = body.category ?? "maybe";
  const notes = body.notes ?? "";

  // AI enrichment (best-effort)
  const enriched = await aiEnrichTask(env, body.title.trim(), notes).catch(() => ({
    estimate_minutes: null,
    tags: "",
  }));

  const tags = body.tags ?? enriched.tags;
  const estimate = body.estimate_minutes ?? enriched.estimate_minutes;

  const result = await env.DB.prepare(
    `INSERT INTO tasks (title, notes, category, tags, estimate_minutes, due_date, source_date)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     RETURNING *`
  )
    .bind(
      body.title.trim(),
      notes,
      category,
      tags,
      estimate ?? null,
      body.due_date ?? null,
      body.source_date ?? null
    )
    .first<Record<string, unknown>>();

  if (!result) {
    return Response.json({ error: "Failed to create task" }, { status: 500 });
  }

  return Response.json({ task: rowToTask(result) }, { status: 201 });
}

/** PATCH /tasks/:id — update a task (category, status, title, notes, tags, estimate, due_date) */
export async function handleUpdateTask(
  request: Request,
  env: Env,
  id: number
): Promise<Response> {
  const body = await request.json<TaskUpdateInput>();

  const fields: string[] = [];
  const params: (string | number | null)[] = [];

  if (body.title !== undefined) { fields.push("title = ?"); params.push(body.title.trim()); }
  if (body.notes !== undefined) { fields.push("notes = ?"); params.push(body.notes); }
  if (body.category !== undefined) { fields.push("category = ?"); params.push(body.category); }
  if (body.status !== undefined) { fields.push("status = ?"); params.push(body.status); }
  if (body.tags !== undefined) { fields.push("tags = ?"); params.push(body.tags); }
  if (body.estimate_minutes !== undefined) { fields.push("estimate_minutes = ?"); params.push(body.estimate_minutes ?? null); }
  if (body.due_date !== undefined) { fields.push("due_date = ?"); params.push(body.due_date ?? null); }

  if (fields.length === 0) {
    return Response.json({ error: "No fields to update" }, { status: 400 });
  }

  fields.push("updated_at = datetime('now')");
  params.push(id);

  const result = await env.DB.prepare(
    `UPDATE tasks SET ${fields.join(", ")} WHERE id = ? RETURNING *`
  )
    .bind(...params)
    .first<Record<string, unknown>>();

  if (!result) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  return Response.json({ task: rowToTask(result) });
}

/** DELETE /tasks/:id — hard delete (only used for permanent removal) */
export async function handleDeleteTask(
  env: Env,
  id: number
): Promise<Response> {
  await env.DB.prepare("DELETE FROM tasks WHERE id = ?").bind(id).run();
  return Response.json({ ok: true });
}

/**
 * POST /tasks/extract
 * Reads today's journal messages from the Durable Object and extracts tasks via AI.
 * Skips titles that are already in the DB (exact match, case-insensitive).
 */
export async function handleExtractTasks(
  request: Request,
  env: Env
): Promise<Response> {
  const body = await request.json<{ messages: Array<{ role: string; content: string }> }>();
  const messages = body.messages ?? [];

  if (messages.length === 0) {
    return Response.json({ tasks: [] });
  }

  // Format conversation for the extraction prompt
  const conversationText = messages
    .map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.content}`)
    .join("\n");

  const extracted = await aiExtractTasks(env, conversationText);
  if (extracted.length === 0) {
    return Response.json({ tasks: [] });
  }

  // Deduplicate against existing tasks (case-insensitive title match)
  const existing = await env.DB.prepare(
    "SELECT LOWER(title) as ltitle FROM tasks WHERE status != 'removed'"
  ).all<{ ltitle: string }>();
  const existingTitles = new Set((existing.results ?? []).map((r) => r.ltitle));

  const today = getTodayDateString();
  const inserted: Task[] = [];

  for (const t of extracted) {
    if (existingTitles.has(t.title.toLowerCase())) continue;

    const tags = Array.isArray(t.tags)
      ? t.tags
          .filter((tag) => ["work", "personal", "low-energy-task"].includes(tag))
          .join(",")
      : "";

    const row = await env.DB.prepare(
      `INSERT INTO tasks (title, notes, category, tags, estimate_minutes, source_date)
       VALUES (?, '', ?, ?, ?, ?)
       RETURNING *`
    )
      .bind(
        t.title.trim(),
        t.category,
        tags,
        t.estimate_minutes ?? null,
        today
      )
      .first<Record<string, unknown>>();

    if (row) {
      inserted.push(rowToTask(row));
      existingTitles.add(t.title.toLowerCase());
    }
  }

  return Response.json({ tasks: inserted }, { status: 201 });
}

/**
 * POST /tasks/:id/enrich
 * Re-runs AI enrichment (tags + estimate) for an existing task.
 */
export async function handleEnrichTask(
  env: Env,
  id: number
): Promise<Response> {
  const existing = await env.DB.prepare("SELECT * FROM tasks WHERE id = ?")
    .bind(id)
    .first<Record<string, unknown>>();

  if (!existing) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  const enriched = await aiEnrichTask(
    env,
    existing.title as string,
    (existing.notes as string) ?? ""
  );

  const result = await env.DB.prepare(
    `UPDATE tasks
     SET tags = ?, estimate_minutes = ?, updated_at = datetime('now')
     WHERE id = ?
     RETURNING *`
  )
    .bind(enriched.tags, enriched.estimate_minutes ?? null, id)
    .first<Record<string, unknown>>();

  if (!result) {
    return Response.json({ error: "Failed to enrich task" }, { status: 500 });
  }

  return Response.json({ task: rowToTask(result) });
}
