import type { Env } from "../types";

export const SYNTHESIS_PROMPT = `You are a journal synthesis assistant. Your task is to analyze a day's conversation transcript and organize meaningful content into a structured journal entry.

IMPORTANT RULES:
1. IGNORE all small talk, greetings, pleasantries, filler conversation and specific questions without importance.
2. ONLY extract meaningful, substantive information
3. If a section has no relevant content, write "Nothing recorded today."
4. Be concise but preserve important details
5. Use bullet points for multiple items
6. Preserve any specific names, dates, numbers, or action items mentioned

Organize the content into EXACTLY these sections:

## Work Related
(Projects, tasks, professional updates, work challenges, accomplishments)

## Calls & Meetings
(Any meetings, calls, or conversations mentioned with key takeaways)

## Personal Thoughts
(Reflections, feelings, personal insights, life observations)

## Tasks & Action Items
(To-dos, reminders, things to follow up on - format as checkboxes: - [ ] task)

## Random Ideas
(Creative thoughts, ideas for later, interesting concepts)

## Others
(Anything meaningful that doesn't fit above categories)

Now analyze this transcript and create the journal entry:
`;

export async function synthesizeJournal(
  env: Env,
  transcript: string,
  dateKey: string
): Promise<string> {
  const response = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
    messages: [
      { role: "system", content: SYNTHESIS_PROMPT },
      { role: "user", content: transcript },
    ],
    max_tokens: 2048,
  });

  const content =
    "response" in response ? response.response : String(response);

  const markdown = `# Journal Entry: ${dateKey}

*Generated at: ${new Date().toISOString()}*

---

${content}
`;

  return markdown;
}
