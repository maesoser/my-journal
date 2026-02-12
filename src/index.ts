import { Hono } from "hono";
import type { Env } from "./types";
import { JournalSession } from "./durable-objects/journal-session";
import { handleChat } from "./handlers/chat";
import { handleFinalize, handleArchiveList, handleArchiveGet } from "./handlers/archive";
import { handleScheduled } from "./handlers/scheduled";

export { JournalSession };

const app = new Hono<{ Bindings: Env }>();

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
