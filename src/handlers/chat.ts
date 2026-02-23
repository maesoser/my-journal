import type { Env, Message, AiTextGenerationInput } from "../types";
import { runTextGeneration } from "../types";
import { getSessionId, getTodayDateString } from "../lib/utils";

const CHAT_SYSTEM_PROMPT = `You are a minimal journaling assistant. Your role is to:
1. Acknowledge what the user shares with brief, supportive responses
2. ONLY ask follow-up questions if the user seems to want to explore something deeper
3. Accept entries without commentary when the user is simply logging information
4. NEVER assume or infer emotions, mood, or feelings unless explicitly stated
5. Keep responses very brief (1-2 sentences maximum, often just acknowledgment)
6. Default to simple confirmations like "Got it", "Noted", "Recorded" for factual entries
Examples of good responses:
- User: "Had a meeting with John about Q2 planning" → "Noted."
- User: "Feeling anxious about the presentation" → "I hear you. What's weighing on you most?"
- User: "Finished the project documentation" → "Nice work getting that done."
- User: "Ate lunch at 2pm" → "Got it."
Be a passive recorder first, conversational companion second. Let the user drive the depth of reflection.`;

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

  const dateKey = getTodayDateString();
  const sessionId = env.JOURNAL_SESSION.idFromName(getSessionId());
  const session = env.JOURNAL_SESSION.get(sessionId);

  const userMsg: Message = {
    role: "user",
    content: lastMessage.content,
    timestamp: new Date().toISOString(),
  };
  await session.addMessage(userMsg);

  // Fetch full conversation history from Durable Object (sliding window of last 20 messages)
  const storedMessages = await session.getMessages(dateKey);
  const recentMessages = storedMessages.slice(-20);

  const aiResponse = await runTextGeneration(env.AI, "@cf/meta/llama-3.1-8b-instruct", {
    messages: [
      { role: "system", content: CHAT_SYSTEM_PROMPT },
      ...recentMessages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    ],
    max_tokens: 256,
  });

  const reply = aiResponse.response || "";

  const assistantMsg: Message = {
    role: "assistant",
    content: reply || "",
    timestamp: new Date().toISOString(),
  };
  await session.addMessage(assistantMsg);

  return Response.json({ reply });
}

export async function handleGetMessages(env: Env): Promise<Response> {
  const dateKey = getTodayDateString();
  const sessionId = env.JOURNAL_SESSION.idFromName(getSessionId());
  const session = env.JOURNAL_SESSION.get(sessionId);

  const messages = await session.getMessages(dateKey);

  return Response.json({ messages });
}
