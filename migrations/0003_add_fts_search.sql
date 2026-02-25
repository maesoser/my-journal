-- Migration: Add FTS5 full-text search for journal entries
-- This creates a virtual table for fast full-text search with snippet support

-- Create FTS5 virtual table for full-text search
-- Using content sync mode to avoid data duplication
CREATE VIRTUAL TABLE journal_entries_fts USING fts5(
  date,
  content,
  content='journal_entries',
  content_rowid='id'
);

-- Populate FTS index with existing data
INSERT INTO journal_entries_fts(rowid, date, content)
SELECT id, date, content FROM journal_entries WHERE content IS NOT NULL;

-- Trigger: Keep FTS index in sync on INSERT
CREATE TRIGGER journal_entries_ai AFTER INSERT ON journal_entries BEGIN
  INSERT INTO journal_entries_fts(rowid, date, content)
  VALUES (new.id, new.date, new.content);
END;

-- Trigger: Keep FTS index in sync on DELETE
CREATE TRIGGER journal_entries_ad AFTER DELETE ON journal_entries BEGIN
  INSERT INTO journal_entries_fts(journal_entries_fts, rowid, date, content)
  VALUES('delete', old.id, old.date, old.content);
END;

-- Trigger: Keep FTS index in sync on UPDATE
CREATE TRIGGER journal_entries_au AFTER UPDATE ON journal_entries BEGIN
  INSERT INTO journal_entries_fts(journal_entries_fts, rowid, date, content)
  VALUES('delete', old.id, old.date, old.content);
  INSERT INTO journal_entries_fts(rowid, date, content)
  VALUES (new.id, new.date, new.content);
END;
