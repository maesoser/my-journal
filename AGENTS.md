# AGENTS.md - AI Agent Guidelines for my-journal

This document provides guidelines for AI coding agents working in this repository.

## Project Overview

A personal journaling application built on Cloudflare Workers using:
- **Hono** - Web framework
- **TypeScript** - Strict mode enabled
- **Durable Objects** - Session state management
- **R2** - Archive storage
- **D1** - SQLite database for metadata
- **Workers AI** - Llama 3.1 8B for chat and synthesis

## Build/Development Commands

```bash
# Start local development server
npm run dev

# Deploy to Cloudflare Workers
npm run deploy

# Test scheduled cron triggers locally
npm run test-scheduled

# Type check (no emit)
npx tsc --noEmit
```

### Wrangler Commands

```bash
# Run D1 migrations
wrangler d1 migrations apply my-journal-db

# Tail production logs
wrangler tail

# Access D1 database locally
wrangler d1 execute my-journal-db --local --command "SELECT * FROM journal_entries"
```

### Testing

**No test framework is currently configured.** If adding tests:
- Recommended: Vitest with `@cloudflare/vitest-pool-workers`
- Run single test: `npx vitest run path/to/test.ts`
- Run all tests: `npx vitest run`

## Project Structure

```
src/
├── index.ts              # Main entry, Hono app and route definitions
├── types.ts              # TypeScript interfaces (Env, Message, etc.)
├── durable-objects/
│   └── journal-session.ts # Durable Object for session state
├── handlers/
│   ├── archive.ts        # Archive endpoints
│   ├── chat.ts           # Chat endpoints
│   └── scheduled.ts      # Cron job handler
└── lib/
    ├── synthesis.ts      # AI journal synthesis
    └── utils.ts          # Utility functions

static/                   # Frontend assets (HTML, JS, CSS)
migrations/               # D1 SQL migrations
```

## Code Style Guidelines

### Formatting

- **Indentation:** 2 spaces
- **Quotes:** Double quotes for TypeScript (`"string"`), single quotes for JavaScript
- **Semicolons:** Required
- **Line length:** No strict limit, keep reasonable (~100 chars)
- **Trailing commas:** Yes, in multiline structures

### Imports

Order imports as follows:
1. External packages (e.g., `hono`, `cloudflare:workers`)
2. Type-only imports (use `import type`)
3. Internal relative imports

```typescript
// External packages
import { Hono } from "hono";
import { DurableObject } from "cloudflare:workers";

// Type-only imports
import type { Env, Message } from "./types";

// Internal modules
import { JournalSession } from "./durable-objects/journal-session";
import { handleChat } from "./handlers/chat";
```

### TypeScript Types

- **Prefer interfaces** over type aliases for object shapes
- **Export types** from dedicated `types.ts` file
- **Use string literal unions** for constrained values: `"user" | "assistant"`
- **Explicit return types** on exported functions
- **Use `Promise<Response>`** for async handler return types

```typescript
export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export async function handleChat(request: Request, env: Env): Promise<Response> {
  // ...
}
```

### Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Files | kebab-case | `journal-session.ts` |
| Directories | kebab-case | `durable-objects/` |
| Classes | PascalCase | `JournalSession` |
| Interfaces | PascalCase | `Env`, `Message` |
| Functions | camelCase, action prefix | `handleChat`, `getTodayDateString` |
| Constants | UPPER_SNAKE_CASE | `CHAT_SYSTEM_PROMPT` |
| Variables | camelCase | `userMessages`, `dateKey` |

### Error Handling

- **Early returns** with error responses for validation failures
- **Use `Response.json()`** for JSON error responses with appropriate status codes
- **No try-catch** for expected errors - let them propagate to the runtime
- **Console.log** for scheduled task logging

```typescript
// Validation error - early return
if (userMessages.length === 0) {
  return Response.json({ error: "No messages provided" }, { status: 400 });
}

// Not found
if (!transcript) {
  return Response.json({ error: "No messages found for this date" }, { status: 404 });
}
```

### Hono Routes

- Use typed bindings: `new Hono<{ Bindings: Env }>()`
- Extract `c.env` and `c.req.raw` in route handlers
- Delegate to handler functions in `handlers/` directory

```typescript
const app = new Hono<{ Bindings: Env }>();

app.get("/messages", async (c) => {
  return handleGetMessages(c.env);
});

app.post("/chat", async (c) => {
  return handleChat(c.req.raw, c.env);
});
```

### Durable Objects

- Extend `DurableObject` from `cloudflare:workers`
- Explicit constructor calling `super(ctx, env)`
- Use `this.ctx.storage` for state management
- Async methods with explicit return types

```typescript
export class JournalSession extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async addMessage(message: Message): Promise<void> {
    const messages = await this.ctx.storage.get<Message[]>("messages") || [];
    messages.push(message);
    await this.ctx.storage.put("messages", messages);
  }
}
```

### Workers AI Integration

- Use model ID: `@cf/meta/llama-3.1-8b-instruct`
- Type-narrow AI responses: `"response" in aiResponse`
- Keep system prompts as constants

```typescript
const aiResponse = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
  messages: [
    { role: "system", content: SYSTEM_PROMPT },
    ...userMessages,
  ],
  max_tokens: 256,
});

const reply = "response" in aiResponse ? aiResponse.response : String(aiResponse);
```

## Environment Bindings

The `Env` interface defines all Cloudflare bindings:

```typescript
interface Env {
  JOURNAL_SESSION: DurableObjectNamespace<JournalSession>;
  JOURNAL_BUCKET: R2Bucket;
  AI: Ai;
  ASSETS: Fetcher;
  DB: D1Database;
}
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Serve static frontend |
| GET | `/messages` | Get current session messages |
| POST | `/chat` | Send message and get AI response |
| GET | `/archive/:date` | Get archived journal for date |
| GET | `/archive` | List all archived journals |

## Frontend Guidelines

- **Vanilla JavaScript** - No framework
- **Tailwind CSS** via CDN
- **Single quotes** in JavaScript (differs from TypeScript)
- **Async/await** for fetch calls
- **CSS custom properties** for theming in `styles.css`
