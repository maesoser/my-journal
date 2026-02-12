import { DurableObject } from "cloudflare:workers";
import type { Env, Message } from "../types";
import { getTodayDateString } from "../lib/utils";

export class JournalSession extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  async addMessage(message: Message): Promise<void> {
    const dateKey = getTodayDateString();
    const messages = await this.getMessages(dateKey);
    messages.push(message);
    await this.ctx.storage.put(`messages:${dateKey}`, messages);
  }

  async getMessages(dateKey?: string): Promise<Message[]> {
    const key = dateKey || getTodayDateString();
    const messages = await this.ctx.storage.get<Message[]>(`messages:${key}`);
    return messages || [];
  }

  async clearMessages(dateKey?: string): Promise<void> {
    const key = dateKey || getTodayDateString();
    await this.ctx.storage.delete(`messages:${key}`);
  }

  async getTranscript(dateKey?: string): Promise<string> {
    const messages = await this.getMessages(dateKey);
    if (messages.length === 0) {
      return "";
    }
    return messages
      .map((m) => `[${m.timestamp}] ${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");
  }
}
