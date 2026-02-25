import type { Env } from "../types";

interface SearchResult {
  date: string;
  snippet: string;
  rank: number;
}

const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS = 50;

export async function handleSearch(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim();

  if (!query) {
    return Response.json({ error: "Query parameter 'q' is required" }, { status: 400 });
  }

  if (query.length < MIN_QUERY_LENGTH) {
    return Response.json(
      { error: `Query must be at least ${MIN_QUERY_LENGTH} characters` },
      { status: 400 }
    );
  }

  // Escape special FTS5 characters and prepare query
  // FTS5 uses double quotes for phrase matching, so we escape them
  const sanitizedQuery = query.replace(/"/g, '""');

  // Use FTS5 MATCH with snippet() for highlighted excerpts
  // snippet() parameters: table, column index (-1 for all), start mark, end mark, ellipsis, max tokens
  const result = await env.DB.prepare(
    `SELECT 
      date,
      snippet(journal_entries_fts, 1, '<mark>', '</mark>', '...', 32) as snippet,
      rank
    FROM journal_entries_fts
    WHERE journal_entries_fts MATCH ?
    ORDER BY rank
    LIMIT ?`
  ).bind(sanitizedQuery, MAX_RESULTS).all<SearchResult>();

  return Response.json({
    query,
    results: result.results,
  });
}
