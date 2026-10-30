-- ============================================================================
-- Migration: 20261022_follow_privacy
-- Add is_private column to users, status column to follows, and status check constraint
-- ============================================================================

-- AlterTable: users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_private" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: follows
ALTER TABLE "follows" ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) NOT NULL DEFAULT 'accepted';

-- Constraint: ck_follows_valid_status
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_follows_valid_status'
    ) THEN
        ALTER TABLE "follows" ADD CONSTRAINT "ck_follows_valid_status" CHECK ("status" IN ('pending', 'accepted', 'rejected'));
    END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "idx_follows_following_status" ON "follows" ("following_id", "status");
CREATE INDEX IF NOT EXISTS "idx_follows_follower_status" ON "follows" ("follower_id", "status");
