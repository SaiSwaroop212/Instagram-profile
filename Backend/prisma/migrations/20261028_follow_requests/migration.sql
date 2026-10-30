-- ============================================================================
-- Migration: 20261028_follow_requests
-- Update notification constraints to support follow_request
-- ============================================================================

ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "ck_notifications_valid_type";
ALTER TABLE "notifications" ADD CONSTRAINT "ck_notifications_valid_type" CHECK (
    "event_type" IN ('like', 'reply', 'repost', 'follow', 'follow_request')
);

ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "ck_notifications_post_target";
ALTER TABLE "notifications" ADD CONSTRAINT "ck_notifications_post_target" CHECK (
    ("event_type" IN ('like', 'reply', 'repost') AND "post_id" IS NOT NULL) OR
    ("event_type" IN ('follow', 'follow_request') AND "post_id" IS NULL)
);
