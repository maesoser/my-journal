-- Migration: Add content column and remove keywords column
-- This migration moves journal content storage from R2 to D1

-- Add content column to store journal markdown
ALTER TABLE journal_entries ADD COLUMN content TEXT;

-- Remove unused keywords column
ALTER TABLE journal_entries DROP COLUMN keywords;
