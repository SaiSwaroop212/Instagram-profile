-- ============================================================================
-- PRD 03: Relational Modeling & Schema DDL for Social-Feed Database
-- Database: PostgreSQL 17
-- ============================================================================

-- Ensure pgcrypto extension is available for UUID generation (PostgreSQL 13+ also has built-in gen_random_uuid())
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Clean existing schema objects if resetting
DROP TABLE IF EXISTS post_likes CASCADE;
DROP TABLE IF EXISTS follows CASCADE;
DROP TABLE IF EXISTS post_media CASCADE;
DROP TABLE IF EXISTS posts CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- ----------------------------------------------------------------------------
-- 1. Table: users
-- Core user entity representing authors, followers, and authenticated viewers.
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    handle VARCHAR(30) NOT NULL,
    display_name VARCHAR(50) NOT NULL,
    bio TEXT NOT NULL DEFAULT '',
    avatar_small_url TEXT NOT NULL,
    avatar_large_url TEXT NOT NULL,
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    -- Constraints
    CONSTRAINT uq_users_handle UNIQUE (handle),
    CONSTRAINT ck_users_handle_format CHECK (
        handle = lower(handle) AND 
        handle ~ '^[a-z0-9_]{1,30}$'
    ),
    CONSTRAINT ck_users_display_name_nonempty CHECK (
        char_length(trim(display_name)) BETWEEN 1 AND 50
    ),
    CONSTRAINT ck_users_avatar_small_url_nonempty CHECK (
        char_length(trim(avatar_small_url)) > 0
    ),
    CONSTRAINT ck_users_avatar_large_url_nonempty CHECK (
        char_length(trim(avatar_large_url)) > 0
    )
);

-- ----------------------------------------------------------------------------
-- 2. Table: posts
-- Unified relational model for originals, direct replies, and reposts.
-- Enforces kind-specific invariants via table-level CHECK constraints.
-- ----------------------------------------------------------------------------
CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    author_id UUID NOT NULL,
    kind VARCHAR(10) NOT NULL,
    text VARCHAR(280),
    reply_to_id UUID,
    repost_of_id UUID,
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),
    updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    -- Generated columns for compound foreign keys guaranteeing target kind is 'original'
    reply_target_kind VARCHAR(10) GENERATED ALWAYS AS (
        CASE WHEN reply_to_id IS NOT NULL THEN 'original' ELSE NULL END
    ) STORED,
    repost_target_kind VARCHAR(10) GENERATED ALWAYS AS (
        CASE WHEN repost_of_id IS NOT NULL THEN 'original' ELSE NULL END
    ) STORED,

    -- Foreign Key: Author (RESTRICT on delete to prevent accidental orphaned content)
    CONSTRAINT fk_posts_author FOREIGN KEY (author_id) 
        REFERENCES users(id) ON DELETE RESTRICT,

    -- Compound uniqueness required for compound foreign keys referencing (id, kind)
    CONSTRAINT uq_posts_id_kind UNIQUE (id, kind),

    -- Foreign Keys enforcing existence AND kind='original' at the database engine level
    CONSTRAINT fk_posts_reply_target FOREIGN KEY (reply_to_id, reply_target_kind) 
        REFERENCES posts(id, kind) ON DELETE RESTRICT,
    CONSTRAINT fk_posts_repost_target FOREIGN KEY (repost_of_id, repost_target_kind) 
        REFERENCES posts(id, kind) ON DELETE RESTRICT,

    -- Allowed kinds
    CONSTRAINT ck_posts_valid_kind CHECK (
        kind IN ('original', 'reply', 'repost')
    ),

    -- Original invariants: text must be 1-280 chars, no reply_to_id, no repost_of_id
    CONSTRAINT ck_posts_original_shape CHECK (
        kind <> 'original' OR (
            text IS NOT NULL AND 
            char_length(trim(text)) BETWEEN 1 AND 280 AND 
            reply_to_id IS NULL AND 
            repost_of_id IS NULL
        )
    ),

    -- Reply invariants: text must be 1-280 chars, reply_to_id is required, no repost_of_id
    CONSTRAINT ck_posts_reply_shape CHECK (
        kind <> 'reply' OR (
            text IS NOT NULL AND 
            char_length(trim(text)) BETWEEN 1 AND 280 AND 
            reply_to_id IS NOT NULL AND 
            repost_of_id IS NULL
        )
    ),

    -- Repost invariants: text must be NULL, reply_to_id must be NULL, repost_of_id is required
    CONSTRAINT ck_posts_repost_shape CHECK (
        kind <> 'repost' OR (
            text IS NULL AND 
            reply_to_id IS NULL AND 
            repost_of_id IS NOT NULL
        )
    ),

    -- Self-reference prevention
    CONSTRAINT ck_posts_no_self_reply CHECK (
        reply_to_id IS NULL OR reply_to_id <> id
    ),
    CONSTRAINT ck_posts_no_self_repost CHECK (
        repost_of_id IS NULL OR repost_of_id <> id
    )
);

-- Unique index ensuring no user can repost the same original twice
CREATE UNIQUE INDEX uq_posts_user_repost 
    ON posts (author_id, repost_of_id) 
    WHERE kind = 'repost';

-- ----------------------------------------------------------------------------
-- 3. Table: post_media
-- Images attached to posts. Product rules specify 0-4 images per original post.
-- ----------------------------------------------------------------------------
CREATE TABLE post_media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL,
    position SMALLINT NOT NULL,
    alt_text TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    small_url TEXT NOT NULL,
    large_url TEXT NOT NULL,
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    -- Generated column to enforce that media attaches ONLY to original posts
    media_target_kind VARCHAR(10) GENERATED ALWAYS AS ('original') STORED,

    -- Foreign Key referencing (id, kind) on posts to enforce target is an original post
    CONSTRAINT fk_post_media_post FOREIGN KEY (post_id, media_target_kind) 
        REFERENCES posts(id, kind) ON DELETE CASCADE,

    -- Position constraints: zero-based index 0..3 (enforces max 4 images)
    CONSTRAINT ck_post_media_position_range CHECK (
        position BETWEEN 0 AND 3
    ),

    -- Composite uniqueness: each position unique within a post
    CONSTRAINT uq_post_media_post_position UNIQUE (post_id, position),

    -- Content validation constraints
    CONSTRAINT ck_post_media_dimensions_positive CHECK (
        width > 0 AND height > 0
    ),
    CONSTRAINT ck_post_media_alt_text_nonempty CHECK (
        char_length(trim(alt_text)) > 0
    ),
    CONSTRAINT ck_post_media_small_url_nonempty CHECK (
        char_length(trim(small_url)) > 0
    ),
    CONSTRAINT ck_post_media_large_url_nonempty CHECK (
        char_length(trim(large_url)) > 0
    )
);

-- ----------------------------------------------------------------------------
-- 4. Table: post_likes
-- Association table for user likes on posts (originals or replies).
-- Natural composite primary key (post_id, user_id) guarantees exact uniqueness.
-- ----------------------------------------------------------------------------
CREATE TABLE post_likes (
    post_id UUID NOT NULL,
    user_id UUID NOT NULL,
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    -- Primary Key: composite pair guarantees one like per user per post
    CONSTRAINT pk_post_likes PRIMARY KEY (post_id, user_id),

    -- Foreign Keys
    CONSTRAINT fk_post_likes_post FOREIGN KEY (post_id) 
        REFERENCES posts(id) ON DELETE CASCADE,
    CONSTRAINT fk_post_likes_user FOREIGN KEY (user_id) 
        REFERENCES users(id) ON DELETE CASCADE
);

-- ----------------------------------------------------------------------------
-- 5. Table: follows
-- Directed follow graph between users.
-- Natural composite primary key (follower_id, following_id) prevents duplicates.
-- ----------------------------------------------------------------------------
CREATE TABLE follows (
    follower_id UUID NOT NULL,
    following_id UUID NOT NULL,
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    -- Primary Key
    CONSTRAINT pk_follows PRIMARY KEY (follower_id, following_id),

    -- Foreign Keys
    CONSTRAINT fk_follows_follower FOREIGN KEY (follower_id) 
        REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_follows_following FOREIGN KEY (following_id) 
        REFERENCES users(id) ON DELETE CASCADE,

    -- Self-follow prevention
    CONSTRAINT ck_follows_no_self_follow CHECK (
        follower_id <> following_id
    )
);

-- ============================================================================
-- PERFORMANCE INDEXES
-- Designed for the 10 access paths in PRD 03.
-- Note: Primary keys and UNIQUE constraints automatically generate btree indexes.
-- ============================================================================

-- 1. Home Feed: Newest originals first with tuple cursor (created_at DESC, id DESC)
CREATE INDEX idx_posts_feed 
    ON posts (created_at DESC, id DESC) 
    WHERE kind = 'original';

-- 2. Direct Replies: Look up direct replies for an original, newest first
CREATE INDEX idx_posts_replies 
    ON posts (reply_to_id, created_at DESC, id DESC) 
    WHERE kind = 'reply';

-- 3. Profile originals: Filter originals by author with descending timestamp
CREATE INDEX idx_posts_author_originals 
    ON posts (author_id, created_at DESC, id DESC) 
    WHERE kind = 'original';

-- 4. Repost lookup: Look up user reposts with newest first
CREATE INDEX idx_posts_author_reposts 
    ON posts (author_id, created_at DESC, id DESC) 
    WHERE kind = 'repost';

-- 5. Post Media: Display order within post
CREATE INDEX idx_post_media_post_order 
    ON post_media (post_id, position ASC);

-- 6. Profile Media: Stream of media across a user's originals, ordered by (created_at DESC, id DESC)
CREATE INDEX idx_post_media_cursor 
    ON post_media (created_at DESC, id DESC);

-- 7. Follows reverse index: Select who follows a user (for follower counts and graph traversal)
CREATE INDEX idx_follows_reverse 
    ON follows (following_id, follower_id);

-- 8. Post Likes reverse index: Look up all posts liked by a specific user (for viewer state batch lookups)
CREATE INDEX idx_post_likes_user 
    ON post_likes (user_id, post_id);
