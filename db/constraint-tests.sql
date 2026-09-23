-- ============================================================================
-- PRD 03: Constraint and Relational Integrity Test Suite
-- Database: PostgreSQL 17
--
-- Executes negative tests inside DO $$ ... $$ blocks or SAVEPOINTs to verify
-- that the database engine rejects invalid data and maintains relational guarantees.
-- ============================================================================

\echo '======================================================================'
\echo 'STARTING CONSTRAINT TEST SUITE'
\echo '======================================================================'

-- ----------------------------------------------------------------------------
-- TEST 1: Unique User Handle
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    INSERT INTO users (id, handle, display_name, avatar_small_url, avatar_large_url)
    VALUES ('a0000000-0000-4000-8000-000000000099', 'asha', 'Duplicate Asha', '/a.jpg', '/a.jpg');
    RAISE EXCEPTION 'TEST 1 FAILED: Duplicate handle was allowed';
EXCEPTION
    WHEN unique_violation THEN
        RAISE NOTICE '[PASS] TEST 1: Duplicate user handle rejected by unique constraint (uq_users_handle)';
END $$;

-- ----------------------------------------------------------------------------
-- TEST 2: Normalized Lowercase Handle & Regex Format
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    INSERT INTO users (id, handle, display_name, avatar_small_url, avatar_large_url)
    VALUES ('a0000000-0000-4000-8000-000000000099', 'UppercaseHandle', 'Invalid Handle', '/a.jpg', '/a.jpg');
    RAISE EXCEPTION 'TEST 2 FAILED: Uppercase handle was allowed';
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE '[PASS] TEST 2: Non-lowercase handle rejected by check constraint (ck_users_handle_format)';
END $$;

DO $$
BEGIN
    INSERT INTO users (id, handle, display_name, avatar_small_url, avatar_large_url)
    VALUES ('a0000000-0000-4000-8000-000000000099', 'invalid handle with spaces', 'Invalid Handle', '/a.jpg', '/a.jpg');
    RAISE EXCEPTION 'TEST 2B FAILED: Handle with spaces was allowed';
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE '[PASS] TEST 2B: Handle with spaces rejected by regex check (ck_users_handle_format)';
END $$;

-- ----------------------------------------------------------------------------
-- TEST 3: Orphan Foreign Key on Post Author
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    INSERT INTO posts (id, author_id, kind, text)
    VALUES ('b0000000-0000-4000-8000-000000000099', 'a0000000-0000-4000-8000-999999999999', 'original', 'Orphan author post');
    RAISE EXCEPTION 'TEST 3 FAILED: Post with nonexistent author was allowed';
EXCEPTION
    WHEN foreign_key_violation THEN
        RAISE NOTICE '[PASS] TEST 3: Orphan author insert rejected by foreign key (fk_posts_author)';
END $$;

-- ----------------------------------------------------------------------------
-- TEST 4: One User Can Like a Post Once (Composite Primary Key Violation)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    -- Asha already liked Post 2 in the seed data
    INSERT INTO post_likes (post_id, user_id)
    VALUES ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'TEST 4 FAILED: Duplicate like was allowed';
EXCEPTION
    WHEN unique_violation THEN
        RAISE NOTICE '[PASS] TEST 4: Duplicate post like rejected by composite primary key (pk_post_likes)';
END $$;

-- ----------------------------------------------------------------------------
-- TEST 5: No Duplicate Follow Pair
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    -- Asha already follows Dan in the seed data
    INSERT INTO follows (follower_id, following_id)
    VALUES ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'TEST 5 FAILED: Duplicate follow edge was allowed';
EXCEPTION
    WHEN unique_violation THEN
        RAISE NOTICE '[PASS] TEST 5: Duplicate follow edge rejected by composite primary key (pk_follows)';
END $$;

-- ----------------------------------------------------------------------------
-- TEST 6: No Self-Follow
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    INSERT INTO follows (follower_id, following_id)
    VALUES ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'TEST 6 FAILED: Self-follow was allowed';
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE '[PASS] TEST 6: Self-follow rejected by check constraint (ck_follows_no_self_follow)';
END $$;

-- ----------------------------------------------------------------------------
-- TEST 7: Original Post Text Validation (Empty, Whitespace-only, > 280 code points)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    INSERT INTO posts (id, author_id, kind, text)
    VALUES ('b0000000-0000-4000-8000-000000000099', 'a0000000-0000-4000-8000-000000000001', 'original', '   ');
    RAISE EXCEPTION 'TEST 7A FAILED: Whitespace-only post text was allowed';
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE '[PASS] TEST 7A: Whitespace-only text rejected by check constraint (ck_posts_original_shape)';
END $$;

DO $$
BEGIN
    INSERT INTO posts (id, author_id, kind, text)
    VALUES ('b0000000-0000-4000-8000-000000000099', 'a0000000-0000-4000-8000-000000000001', 'original', repeat('x', 281));
    RAISE EXCEPTION 'TEST 7B FAILED: Post text exceeding 280 characters was allowed';
EXCEPTION
    WHEN check_violation OR string_data_right_truncation THEN
        RAISE NOTICE '[PASS] TEST 7B: Post text > 280 chars rejected by length constraint';
END $$;

-- ----------------------------------------------------------------------------
-- TEST 8: Repost Invariants (No Text, Target Required, No Reply Target)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    -- Repost cannot contain text
    INSERT INTO posts (id, author_id, kind, text, repost_of_id)
    VALUES ('d0000000-0000-4000-8000-000000000099', 'a0000000-0000-4000-8000-000000000001', 'repost', 
            'Illegal text on repost', 'b0000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'TEST 8A FAILED: Repost with text was allowed';
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE '[PASS] TEST 8A: Repost with text rejected by check constraint (ck_posts_repost_shape)';
END $$;

DO $$
BEGIN
    -- Repost cannot have NULL repost_of_id
    INSERT INTO posts (id, author_id, kind, text, repost_of_id)
    VALUES ('d0000000-0000-4000-8000-000000000099', 'a0000000-0000-4000-8000-000000000001', 'repost', 
            NULL, NULL);
    RAISE EXCEPTION 'TEST 8B FAILED: Repost without repost_of_id was allowed';
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE '[PASS] TEST 8B: Repost without target rejected by check constraint (ck_posts_repost_shape)';
END $$;

-- ----------------------------------------------------------------------------
-- TEST 9: No User Can Repost the Same Original Twice
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    -- User 1 (Asha) already reposted Post 2 in the seed data (d...0001)
    INSERT INTO posts (id, author_id, kind, text, repost_of_id)
    VALUES ('d0000000-0000-4000-8000-000000000099', 'a0000000-0000-4000-8000-000000000001', 'repost', 
            NULL, 'b0000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'TEST 9 FAILED: Duplicate repost by same user was allowed';
EXCEPTION
    WHEN unique_violation THEN
        RAISE NOTICE '[PASS] TEST 9: Duplicate repost rejected by unique index (uq_posts_user_repost)';
END $$;

-- ----------------------------------------------------------------------------
-- TEST 10: Repost Target and Reply Target Must Be an Original (Not Reply or Repost)
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    -- Attempt to reply to a reply (c...0001) rather than an original
    INSERT INTO posts (id, author_id, kind, text, reply_to_id)
    VALUES ('c0000000-0000-4000-8000-000000000099', 'a0000000-0000-4000-8000-000000000001', 'reply', 
            'Attempting to reply to a reply', 'c0000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'TEST 10A FAILED: Reply targeting a reply was allowed';
EXCEPTION
    WHEN foreign_key_violation THEN
        RAISE NOTICE '[PASS] TEST 10A: Reply targeting non-original rejected by compound foreign key (fk_posts_reply_target)';
END $$;

DO $$
BEGIN
    -- Attempt to repost a repost (d...0001) rather than an original
    INSERT INTO posts (id, author_id, kind, text, repost_of_id)
    VALUES ('d0000000-0000-4000-8000-000000000099', 'a0000000-0000-4000-8000-000000000003', 'repost', 
            NULL, 'd0000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'TEST 10B FAILED: Repost targeting a repost was allowed';
EXCEPTION
    WHEN foreign_key_violation THEN
        RAISE NOTICE '[PASS] TEST 10B: Repost targeting non-original rejected by compound foreign key (fk_posts_repost_target)';
END $$;

-- ----------------------------------------------------------------------------
-- TEST 11: Media Belongs ONLY to an Original
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    -- Attempt to attach media to a reply (c...0001)
    INSERT INTO post_media (id, post_id, position, alt_text, width, height, small_url, large_url)
    VALUES ('e0000000-0000-4000-8000-000000000099', 'c0000000-0000-4000-8000-000000000001', 0, 
            'Image on reply', 800, 600, '/s.jpg', '/l.jpg');
    RAISE EXCEPTION 'TEST 11 FAILED: Media attached to a reply was allowed';
EXCEPTION
    WHEN foreign_key_violation THEN
        RAISE NOTICE '[PASS] TEST 11: Media attached to non-original rejected by compound foreign key (fk_post_media_post)';
END $$;

-- ----------------------------------------------------------------------------
-- TEST 12: Media Position Range (0-3) and Duplicate Position Within Post
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    -- Attempt position 4 (out of range 0..3)
    INSERT INTO post_media (id, post_id, position, alt_text, width, height, small_url, large_url)
    VALUES ('e0000000-0000-4000-8000-000000000099', 'b0000000-0000-4000-8000-000000000001', 4, 
            'Image with position 4', 800, 600, '/s.jpg', '/l.jpg');
    RAISE EXCEPTION 'TEST 12A FAILED: Media position 4 was allowed';
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE '[PASS] TEST 12A: Media position > 3 rejected by check constraint (ck_post_media_position_range)';
END $$;

DO $$
BEGIN
    -- Attempt duplicate position 0 on Post 1 (position 0 already exists in seed)
    INSERT INTO post_media (id, post_id, position, alt_text, width, height, small_url, large_url)
    VALUES ('e0000000-0000-4000-8000-000000000099', 'b0000000-0000-4000-8000-000000000001', 0, 
            'Duplicate position 0', 800, 600, '/s.jpg', '/l.jpg');
    RAISE EXCEPTION 'TEST 12B FAILED: Duplicate media position within post was allowed';
EXCEPTION
    WHEN unique_violation THEN
        RAISE NOTICE '[PASS] TEST 12B: Duplicate media position rejected by unique constraint (uq_post_media_post_position)';
END $$;

-- ----------------------------------------------------------------------------
-- TEST 13: Media Dimensions Positive & Non-empty Alt Text / URLs
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    -- Width <= 0
    INSERT INTO post_media (id, post_id, position, alt_text, width, height, small_url, large_url)
    VALUES ('e0000000-0000-4000-8000-000000000099', 'b0000000-0000-4000-8000-000000000002', 0, 
            'Zero width', 0, 600, '/s.jpg', '/l.jpg');
    RAISE EXCEPTION 'TEST 13A FAILED: Media width 0 was allowed';
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE '[PASS] TEST 13A: Non-positive media width rejected by check constraint (ck_post_media_dimensions_positive)';
END $$;

DO $$
BEGIN
    -- Empty alt text
    INSERT INTO post_media (id, post_id, position, alt_text, width, height, small_url, large_url)
    VALUES ('e0000000-0000-4000-8000-000000000099', 'b0000000-0000-4000-8000-000000000002', 0, 
            '   ', 800, 600, '/s.jpg', '/l.jpg');
    RAISE EXCEPTION 'TEST 13B FAILED: Empty alt text was allowed';
EXCEPTION
    WHEN check_violation THEN
        RAISE NOTICE '[PASS] TEST 13B: Whitespace alt text rejected by check constraint (ck_post_media_alt_text_nonempty)';
END $$;

\echo '======================================================================'
\echo 'ALL CONSTRAINT TESTS PASSED SUCCESSFULLY!'
\echo '======================================================================'
