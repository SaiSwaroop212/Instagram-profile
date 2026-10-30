-- ============================================================================
-- Migration: 20261022_user_deactivation
-- Add deactivated_at column to users table for account deactivation lifecycle
-- ============================================================================

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "deactivated_at" TIMESTAMPTZ(3);
