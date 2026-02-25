import { Hono } from "hono";
import type { Env } from "./types";
import { JournalSession } from "./durable-objects/journal-session";
import { handleChat, handleGetMessages } from "./handlers/chat";
import { handleFinalize, handleArchiveList, handleArchiveGet, handleArchiveDownload, handleArchiveUpload } from "./handlers/archive";
import { handleScheduled } from "./handlers/scheduled";
import { handleMigration } from "./handlers/migrate";

export { JournalSession };

const app = new Hono<{ Bindings: Env }>();

app.get("/messages", async (c) => {
  return handleGetMessages(c.env);
});

app.post("/chat", async (c) => {
  return handleChat(c.req.raw, c.env);
});

app.post("/finalize", async (c) => {
  return handleFinalize(c.req.raw, c.env);
});

app.get("/archive", async (c) => {
  return handleArchiveList(c.env);
});

app.get("/archive/entry", async (c) => {
  return handleArchiveGet(c.req.raw, c.env);
});

app.get("/archive/download", async (c) => {
  return handleArchiveDownload(c.req.raw, c.env);
});

app.post("/archive/upload", async (c) => {
  return handleArchiveUpload(c.req.raw, c.env);
});

// Temporary migration route - remove after migration is complete
// Requires JOURNAL_BUCKET binding in wrangler.toml during migration
app.post("/migrate", async (c) => {
  // Cast to include R2 bucket for migration purposes
  const migrationEnv = c.env as unknown as { JOURNAL_BUCKET: R2Bucket; DB: D1Database };
  return handleMigration(migrationEnv);
});

app.get("/*", async (c) => {
  const url = new URL(c.req.url);
  if (url.pathname === "/") {
    url.pathname = "/index.html";
  }
  return c.env.ASSETS.fetch(new Request(url.toString(), c.req.raw));
});

export default {
  fetch: app.fetch,

  async scheduled(
    controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    ctx.waitUntil(handleScheduled(env));
  },
};
