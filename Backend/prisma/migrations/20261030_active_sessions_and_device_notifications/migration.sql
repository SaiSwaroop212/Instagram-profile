-- ============================================================================
-- Migration: 20261030_active_sessions_and_device_notifications
-- Support active session device tracking & NEW_LOGIN notifications
-- ============================================================================

-- AlterTable auth_sessions
ALTER TABLE "auth_sessions" ADD COLUMN IF NOT EXISTS "device_type" VARCHAR(50) DEFAULT 'unknown';
ALTER TABLE "auth_sessions" ADD COLUMN IF NOT EXISTS "browser" VARCHAR(50) DEFAULT 'unknown';
ALTER TABLE "auth_sessions" ADD COLUMN IF NOT EXISTS "os" VARCHAR(50) DEFAULT 'unknown';
ALTER TABLE "auth_sessions" ADD COLUMN IF NOT EXISTS "ip_address" VARCHAR(45);
ALTER TABLE "auth_sessions" ADD COLUMN IF NOT EXISTS "user_agent" TEXT;

-- AlterTable notifications
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- Update notification constraints to support NEW_LOGIN and new_login
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "ck_notifications_valid_type";
ALTER TABLE "notifications" ADD CONSTRAINT "ck_notifications_valid_type" CHECK (
    "event_type" IN ('like', 'reply', 'repost', 'follow', 'follow_request', 'NEW_LOGIN', 'new_login')
);

ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "ck_notifications_post_target";
ALTER TABLE "notifications" ADD CONSTRAINT "ck_notifications_post_target" CHECK (
    ("event_type" IN ('like', 'reply', 'repost') AND "post_id" IS NOT NULL) OR
    ("event_type" IN ('follow', 'follow_request', 'NEW_LOGIN', 'new_login') AND "post_id" IS NULL)
);

ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "ck_notifications_no_self_notification";
ALTER TABLE "notifications" ADD CONSTRAINT "ck_notifications_no_self_notification" CHECK (
    "recipient_id" <> "actor_id" OR "event_type" IN ('NEW_LOGIN', 'new_login')
);
