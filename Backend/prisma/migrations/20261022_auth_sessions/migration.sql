-- ============================================================================
-- Migration: 20261022_auth_sessions
-- Add password_hash column to users and create auth_sessions table for stateful auth
-- ============================================================================

-- AlterTable: users
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" VARCHAR(255) NOT NULL DEFAULT 'V1_UNSET_PASSWORD';

-- CreateTable: auth_sessions
CREATE TABLE IF NOT EXISTS "auth_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_auth_sessions_token_hash" UNIQUE ("token_hash"),
    CONSTRAINT "fk_auth_sessions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

-- Performance / Lookup Indexes
CREATE INDEX IF NOT EXISTS "idx_auth_sessions_user_expires" ON "auth_sessions" ("user_id", "expires_at");
