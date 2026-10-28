-- ============================================================================
-- Migration: 20261023_notifications_constraints
-- Create notifications table with constraints and indexes
-- ============================================================================

CREATE TABLE IF NOT EXISTS "notifications" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "recipient_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "actor_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "event_type" VARCHAR(20) NOT NULL,
    "post_id" UUID REFERENCES "posts"("id") ON DELETE CASCADE,
    "source_event_id" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "uq_notifications_source_event_id" UNIQUE ("source_event_id"),
    CONSTRAINT "ck_notifications_valid_type" CHECK (
        "event_type" IN ('like', 'reply', 'repost', 'follow')
    ),
    CONSTRAINT "ck_notifications_post_target" CHECK (
        ("event_type" IN ('like', 'reply', 'repost') AND "post_id" IS NOT NULL) OR
        ("event_type" = 'follow' AND "post_id" IS NULL)
    ),
    CONSTRAINT "ck_notifications_no_self_notification" CHECK (
        "recipient_id" <> "actor_id"
    )
);

CREATE INDEX IF NOT EXISTS "idx_notifications_recipient_feed"
    ON "notifications" ("recipient_id", "created_at" DESC, "id" DESC);

CREATE INDEX IF NOT EXISTS "idx_notifications_recipient_unread"
    ON "notifications" ("recipient_id", "created_at" DESC)
    WHERE "read_at" IS NULL;
