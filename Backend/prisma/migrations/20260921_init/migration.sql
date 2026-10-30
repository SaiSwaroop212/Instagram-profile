-- ============================================================================
-- Prisma Initial Migration: 20260921_init
-- Database: PostgreSQL 17
-- Matches Stage B reviewed schema DDL exactly
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateTable: users
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "handle" VARCHAR(30) NOT NULL,
    "display_name" VARCHAR(50) NOT NULL,
    "bio" TEXT NOT NULL DEFAULT '',
    "avatar_small_url" TEXT NOT NULL,
    "avatar_large_url" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_users_handle" UNIQUE ("handle"),
    CONSTRAINT "ck_users_handle_format" CHECK (
        "handle" = lower("handle") AND 
        "handle" ~ '^[a-z0-9_]{1,30}$'
    ),
    CONSTRAINT "ck_users_display_name_nonempty" CHECK (
        char_length(trim("display_name")) BETWEEN 1 AND 50
    ),
    CONSTRAINT "ck_users_avatar_small_url_nonempty" CHECK (
        char_length(trim("avatar_small_url")) > 0
    ),
    CONSTRAINT "ck_users_avatar_large_url_nonempty" CHECK (
        char_length(trim("avatar_large_url")) > 0
    )
);

-- CreateTable: posts
CREATE TABLE "posts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "author_id" UUID NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "text" VARCHAR(280),
    "reply_to_id" UUID,
    "repost_of_id" UUID,
    "reply_target_kind" VARCHAR(10) GENERATED ALWAYS AS (
        CASE WHEN "reply_to_id" IS NOT NULL THEN 'original' ELSE NULL END
    ) STORED,
    "repost_target_kind" VARCHAR(10) GENERATED ALWAYS AS (
        CASE WHEN "repost_of_id" IS NOT NULL THEN 'original' ELSE NULL END
    ) STORED,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_posts_id_kind" UNIQUE ("id", "kind"),
    CONSTRAINT "fk_posts_author" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT,
    CONSTRAINT "fk_posts_reply_target" FOREIGN KEY ("reply_to_id", "reply_target_kind") REFERENCES "posts"("id", "kind") ON DELETE RESTRICT,
    CONSTRAINT "fk_posts_repost_target" FOREIGN KEY ("repost_of_id", "repost_target_kind") REFERENCES "posts"("id", "kind") ON DELETE RESTRICT,
    CONSTRAINT "ck_posts_valid_kind" CHECK ("kind" IN ('original', 'reply', 'repost')),
    CONSTRAINT "ck_posts_original_shape" CHECK (
        "kind" <> 'original' OR (
            "text" IS NOT NULL AND 
            char_length(trim("text")) BETWEEN 1 AND 280 AND 
            "reply_to_id" IS NULL AND 
            "repost_of_id" IS NULL
        )
    ),
    CONSTRAINT "ck_posts_reply_shape" CHECK (
        "kind" <> 'reply' OR (
            "text" IS NOT NULL AND 
            char_length(trim("text")) BETWEEN 1 AND 280 AND 
            "reply_to_id" IS NOT NULL AND 
            "repost_of_id" IS NULL
        )
    ),
    CONSTRAINT "ck_posts_repost_shape" CHECK (
        "kind" <> 'repost' OR (
            "text" IS NULL AND 
            "reply_to_id" IS NULL AND 
            "repost_of_id" IS NOT NULL
        )
    ),
    CONSTRAINT "ck_posts_no_self_reply" CHECK ("reply_to_id" IS NULL OR "reply_to_id" <> "id"),
    CONSTRAINT "ck_posts_no_self_repost" CHECK ("repost_of_id" IS NULL OR "repost_of_id" <> "id")
);

-- Unique index for reposts
CREATE UNIQUE INDEX "uq_posts_user_repost" ON "posts" ("author_id", "repost_of_id") WHERE "kind" = 'repost';

-- CreateTable: post_media
CREATE TABLE "post_media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "post_id" UUID NOT NULL,
    "position" SMALLINT NOT NULL,
    "alt_text" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "small_url" TEXT NOT NULL,
    "large_url" TEXT NOT NULL,
    "media_target_kind" VARCHAR(10) GENERATED ALWAYS AS ('original') STORED,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "post_media_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fk_post_media_post" FOREIGN KEY ("post_id", "media_target_kind") REFERENCES "posts"("id", "kind") ON DELETE CASCADE,
    CONSTRAINT "ck_post_media_position_range" CHECK ("position" BETWEEN 0 AND 3),
    CONSTRAINT "uq_post_media_post_position" UNIQUE ("post_id", "position"),
    CONSTRAINT "ck_post_media_dimensions_positive" CHECK ("width" > 0 AND "height" > 0),
    CONSTRAINT "ck_post_media_alt_text_nonempty" CHECK (char_length(trim("alt_text")) > 0),
    CONSTRAINT "ck_post_media_small_url_nonempty" CHECK (char_length(trim("small_url")) > 0),
    CONSTRAINT "ck_post_media_large_url_nonempty" CHECK (char_length(trim("large_url")) > 0)
);

-- CreateTable: post_likes
CREATE TABLE "post_likes" (
    "post_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "post_likes_pkey" PRIMARY KEY ("post_id", "user_id"),
    CONSTRAINT "fk_post_likes_post" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE,
    CONSTRAINT "fk_post_likes_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

-- CreateTable: follows
CREATE TABLE "follows" (
    "follower_id" UUID NOT NULL,
    "following_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "follows_pkey" PRIMARY KEY ("follower_id", "following_id"),
    CONSTRAINT "fk_follows_follower" FOREIGN KEY ("follower_id") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "fk_follows_following" FOREIGN KEY ("following_id") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "ck_follows_no_self_follow" CHECK ("follower_id" <> "following_id")
);

-- CreateTable: notifications
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recipient_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "event_type" VARCHAR(20) NOT NULL,
    "post_id" UUID,
    "source_event_id" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_notifications_source_event_id" UNIQUE ("source_event_id"),
    CONSTRAINT "fk_notifications_recipient" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "fk_notifications_actor" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE CASCADE,
    CONSTRAINT "fk_notifications_post" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE
);

-- Performance Indexes
CREATE INDEX "idx_posts_feed" ON "posts" ("created_at" DESC, "id" DESC) WHERE "kind" = 'original';
CREATE INDEX "idx_posts_replies" ON "posts" ("reply_to_id", "created_at" DESC, "id" DESC) WHERE "kind" = 'reply';
CREATE INDEX "idx_posts_author_originals" ON "posts" ("author_id", "created_at" DESC, "id" DESC) WHERE "kind" = 'original';
CREATE INDEX "idx_post_media_post_order" ON "post_media" ("post_id", "position" ASC);
CREATE INDEX "idx_post_media_cursor" ON "post_media" ("created_at" DESC, "id" DESC);
CREATE INDEX "idx_follows_reverse" ON "follows" ("following_id", "follower_id");
CREATE INDEX "idx_post_likes_user" ON "post_likes" ("user_id", "post_id");
CREATE INDEX "idx_notifications_recipient" ON "notifications" ("recipient_id", "read_at", "created_at" DESC);
