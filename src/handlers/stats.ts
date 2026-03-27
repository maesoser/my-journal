import type { Env } from "../types";
import { getTodayDateString } from "../lib/utils";

// ── Types ─────────────────────────────────────────────────────

interface DayRecord {
  date: string; // YYYY-MM-DD
}

export interface StatsResponse {
  currentStreak: number;   // consecutive days up to and including today
  longestStreak: number;
  totalDays: number;
  heatmap: HeatmapDay[];   // last 365 days, oldest first
  todayHasEntry: boolean;
}

export interface HeatmapDay {
  date: string;   // YYYY-MM-DD
  hasEntry: boolean;
}

// ── Helpers ───────────────────────────────────────────────────

/** Return YYYY-MM-DD for a Date object (UTC-safe local arithmetic). */
function dateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** Add `n` days to a YYYY-MM-DD string. */
function addDays(date: string, n: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return dateStr(d);
}

/**
 * Compute current and longest streak from a sorted (ascending) list of
 * YYYY-MM-DD date strings that have finalized entries.
 *
 * "today" is included automatically — if the user has messages but hasn't
 * finalized yet the caller passes `todayHasMessages: true` and we treat
 * today as a written day.
 */
function computeStreaks(
  entryDates: Set<string>,
  today: string
): { currentStreak: number; longestStreak: number } {
  let currentStreak = 0;
  let longestStreak = 0;
  let streak = 0;
  let cursor = today;

  // Walk backwards from today to find the current streak
  while (entryDates.has(cursor)) {
    currentStreak++;
    cursor = addDays(cursor, -1);
  }

  // Walk all dates in ascending order for longest streak
  if (entryDates.size > 0) {
    const sorted = Array.from(entryDates).sort();
    streak = 1;
    longestStreak = 1;

    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === addDays(sorted[i - 1], 1)) {
        streak++;
        if (streak > longestStreak) longestStreak = streak;
      } else {
        streak = 1;
      }
    }
  }

  // current streak might exceed computed longest (e.g. all days are today)
  if (currentStreak > longestStreak) longestStreak = currentStreak;

  return { currentStreak, longestStreak };
}

// ── Handler ───────────────────────────────────────────────────

/**
 * GET /stats
 *
 * Optional query param: `today_has_entry=1`
 * The frontend passes this when the Durable Object already has messages for
 * today (even before the entry is finalized), so today counts toward the streak.
 */
export async function handleStats(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const todayHasMessages = url.searchParams.get("today_has_entry") === "1";
  const today = getTodayDateString();

  // Fetch all entry dates from D1 (just the date column, no content needed)
  const result = await env.DB.prepare(
    `SELECT date FROM journal_entries ORDER BY date ASC`
  ).all<DayRecord>();

  const dbDates: DayRecord[] = result.results ?? [];

  // Build a set of dates that "count" — finalized entries + today if active
  const entrySet = new Set<string>(dbDates.map((r) => r.date));
  if (todayHasMessages) entrySet.add(today);

  // Streak computation
  const { currentStreak, longestStreak } = computeStreaks(entrySet, today);

  // Build heatmap for the last 365 days (oldest → newest)
  const heatmap: HeatmapDay[] = [];
  for (let i = 364; i >= 0; i--) {
    const d = addDays(today, -i);
    heatmap.push({ date: d, hasEntry: entrySet.has(d) });
  }

  const response: StatsResponse = {
    currentStreak,
    longestStreak,
    totalDays: entrySet.size,
    todayHasEntry: entrySet.has(today),
    heatmap,
  };

  return Response.json(response);
}
