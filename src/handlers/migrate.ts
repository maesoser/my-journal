/**
 * Migration handler to move journal content from R2 to D1.
 *
 * This is a one-time migration script. After running it successfully:
 * 1. Verify the data in D1 matches R2
 * 2. Remove this file and the /migrate route from index.ts
 * 3. Remove the JOURNAL_BUCKET binding from wrangler.toml
 *
 * Usage: POST /migrate
 */

// Temporary interface that includes R2 bucket for migration
interface MigrationEnv {
  JOURNAL_BUCKET: R2Bucket;
  DB: D1Database;
}

interface MigrationResult {
  date: string;
  status: "migrated" | "skipped" | "error";
  message?: string;
}

export async function handleMigration(env: MigrationEnv): Promise<Response> {
  const results: MigrationResult[] = [];
  let cursor: string | undefined;
  let totalMigrated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // Paginate through all R2 objects
  do {
    const list = await env.JOURNAL_BUCKET.list({ cursor });

    for (const object of list.objects) {
      // Only process .md files
      if (!object.key.endsWith(".md")) {
        results.push({
          date: object.key,
          status: "skipped",
          message: "Not a markdown file",
        });
        totalSkipped++;
        continue;
      }

      const dateKey = object.key.replace(".md", "");

      try {
        // Fetch the R2 object content
        const r2Object = await env.JOURNAL_BUCKET.get(object.key);

        if (!r2Object) {
          results.push({
            date: dateKey,
            status: "error",
            message: "R2 object not found",
          });
          totalErrors++;
          continue;
        }

        const content = await r2Object.text();
        const size = new TextEncoder().encode(content).length;

        // Upsert into D1 with content
        await env.DB.prepare(
          `INSERT INTO journal_entries (date, size, content, updated_at)
           VALUES (?, ?, ?, datetime('now'))
           ON CONFLICT(date) DO UPDATE SET
             size = excluded.size,
             content = excluded.content,
             updated_at = datetime('now')`
        ).bind(dateKey, size, content).run();

        results.push({
          date: dateKey,
          status: "migrated",
        });
        totalMigrated++;
      } catch (error) {
        results.push({
          date: dateKey,
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        });
        totalErrors++;
      }
    }

    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);

  return Response.json({
    summary: {
      total: results.length,
      migrated: totalMigrated,
      skipped: totalSkipped,
      errors: totalErrors,
    },
    results,
  });
}
