import { Hono } from "hono";
import type { Env } from "./types";
import { JournalSession } from "./durable-objects/journal-session";
import { handleChat, handleGetMessages } from "./handlers/chat";
import { handleFinalize, handleArchiveList, handleArchiveGet, handleArchiveDownload, handleArchiveUpload } from "./handlers/archive";
import { handleScheduled } from "./handlers/scheduled";
import { handleSearch } from "./handlers/search";
import {
  handleListTasks,
  handleCreateTask,
  handleUpdateTask,
  handleDeleteTask,
  handleExtractTasks,
  handleEnrichTask,
} from "./handlers/tasks";

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

app.get("/search", async (c) => {
  return handleSearch(c.req.raw, c.env);
});

// ---- Tasks API ----
app.get("/tasks", async (c) => {
  return handleListTasks(c.req.raw, c.env);
});

app.post("/tasks", async (c) => {
  return handleCreateTask(c.req.raw, c.env);
});

app.patch("/tasks/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (isNaN(id)) return Response.json({ error: "Invalid id" }, { status: 400 });
  return handleUpdateTask(c.req.raw, c.env, id);
});

app.delete("/tasks/:id", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (isNaN(id)) return Response.json({ error: "Invalid id" }, { status: 400 });
  return handleDeleteTask(c.env, id);
});

app.post("/tasks/extract", async (c) => {
  return handleExtractTasks(c.req.raw, c.env);
});

app.post("/tasks/:id/enrich", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (isNaN(id)) return Response.json({ error: "Invalid id" }, { status: 400 });
  return handleEnrichTask(c.env, id);
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
