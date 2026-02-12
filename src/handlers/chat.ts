import type { Env, Message } from "../types";
import { getSessionId } from "../lib/utils";

const CHAT_SYSTEM_PROMPT = `You are a thoughtful journaling assistant. Your role is to:
1. Listen actively and ask follow-up questions to help the user reflect
2. Encourage deeper exploration of thoughts and feelings
3. Be supportive but not overly effusive
4. Keep responses concise (2-3 sentences typically)
5. Remember this is for journaling - help capture meaningful moments and insights

Respond naturally to what the user shares.`;

export async function handleChat(
  request: Request,
  env: Env
): Promise<Response> {
  const body = await request.json<{ messages: { role: string; content: string }[] }>();
  const userMessages = body.messages || [];

  if (userMessages.length === 0) {
    return Response.json({ error: "No messages provided" }, { status: 400 });
  }

  const lastMessage = userMessages[userMessages.length - 1];
  if (lastMessage.role !== "user") {
    return Response.json({ error: "Last message must be from user" }, { status: 400 });
  }

  const sessionId = env.JOURNAL_SESSION.idFromName(getSessionId());
  const session = env.JOURNAL_SESSION.get(sessionId);

  const userMsg: Message = {
    role: "user",
    content: lastMessage.content,
    timestamp: new Date().toISOString(),
  };
  await session.addMessage(userMsg);

  const aiResponse = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [
      { role: "system", content: CHAT_SYSTEM_PROMPT },
      ...userMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ],
    max_tokens: 256,
  });

  const reply =
    "response" in aiResponse ? aiResponse.response : String(aiResponse);

  const assistantMsg: Message = {
    role: "assistant",
    content: reply || "",
    timestamp: new Date().toISOString(),
  };
  await session.addMessage(assistantMsg);

  return Response.json({ reply });
}
