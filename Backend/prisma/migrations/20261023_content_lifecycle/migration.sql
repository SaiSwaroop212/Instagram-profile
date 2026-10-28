-- ============================================================================
-- Migration: 20261023_content_lifecycle
-- Add deleted_at and version columns to posts for author lifecycle management
-- ============================================================================

-- AlterTable: posts
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ(3);
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1;

-- Index for filtering deleted posts
CREATE INDEX IF NOT EXISTS "idx_posts_deleted_at" ON "posts" ("deleted_at");
