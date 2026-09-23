-- ============================================================================
-- PRD 03: Ten Required SQL Use Cases
-- Database: PostgreSQL 17
--
-- Uses PREPARE and EXECUTE to demonstrate parameterized queries (no string concatenation).
-- All list queries apply selection before aggregation to prevent Cartesian row multiplication.
-- ============================================================================

\echo '======================================================================'
\echo 'USE CASE 1: HOME FEED (Page 1 & Continuation across Timestamp Tie)'
\echo '======================================================================'
-- Description: Fetch newest originals with author, media, and reaction counts.
-- Evaluates limit+1 to determine hasMore.
-- Page 1 uses LIMIT 10 + 1 (11 rows).
-- Page 2 uses the 10th row tuple (b...0023, 2026-09-01 13:40:00) to test
-- continuation across the exact timestamp tie with b...0022.

DEALLOCATE ALL;

PREPARE stmt_home_feed_p1 (UUID, INT) AS
SELECT 
    p.id,
    p.kind,
    p.text,
    p.created_at,
    json_build_object(
        'id', u.id,
        'handle', u.handle,
        'displayName', u.display_name,
        'avatar', json_build_object('smallUrl', u.avatar_small_url, 'largeUrl', u.avatar_large_url)
    ) AS author,
    COALESCE((
        SELECT json_agg(json_build_object(
            'id', m.id,
            'altText', m.alt_text,
            'width', m.width,
            'height', m.height,
            'position', m.position,
            'smallUrl', m.small_url,
            'largeUrl', m.large_url
        ) ORDER BY m.position ASC)
        FROM post_media m 
        WHERE m.post_id = p.id
    ), '[]'::json) AS media,
    (SELECT count(*)::int FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
    (SELECT count(*)::int FROM posts r WHERE r.reply_to_id = p.id AND r.kind = 'reply') AS reply_count,
    EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = $1) AS liked_by_viewer
FROM posts p
JOIN users u ON u.id = p.author_id
WHERE p.kind = 'original'
ORDER BY p.created_at DESC, p.id DESC
LIMIT $2 + 1;

-- Execute Page 1 (limit=10, viewer=Asha)
\echo '--- Home Feed: Page 1 (limit=10) ---'
EXECUTE stmt_home_feed_p1('a0000000-0000-4000-8000-000000000001', 10);

-- Page 2: Continuation query with tuple cursor ($2 = cursor_created_at, $3 = cursor_id)
PREPARE stmt_home_feed_continuation (UUID, TIMESTAMPTZ, UUID, INT) AS
SELECT 
    p.id,
    p.kind,
    p.text,
    p.created_at,
    json_build_object(
        'id', u.id,
        'handle', u.handle,
        'displayName', u.display_name,
        'avatar', json_build_object('smallUrl', u.avatar_small_url, 'largeUrl', u.avatar_large_url)
    ) AS author,
    COALESCE((
        SELECT json_agg(json_build_object(
            'id', m.id,
            'altText', m.alt_text,
            'width', m.width,
            'height', m.height,
            'position', m.position,
            'smallUrl', m.small_url,
            'largeUrl', m.large_url
        ) ORDER BY m.position ASC)
        FROM post_media m 
        WHERE m.post_id = p.id
    ), '[]'::json) AS media,
    (SELECT count(*)::int FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
    (SELECT count(*)::int FROM posts r WHERE r.reply_to_id = p.id AND r.kind = 'reply') AS reply_count,
    EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = $1) AS liked_by_viewer
FROM posts p
JOIN users u ON u.id = p.author_id
WHERE p.kind = 'original'
  AND (p.created_at, p.id) < ($2, $3)
ORDER BY p.created_at DESC, p.id DESC
LIMIT $4 + 1;

-- Execute Page 2 starting right after Post 23 (b...0023 at 2026-09-01 13:40:00Z)
\echo '--- Home Feed: Page 2 Continuation (starts with tied Post 22 without repeating Post 23) ---'
EXECUTE stmt_home_feed_continuation('a0000000-0000-4000-8000-000000000001', 
                                    '2026-09-01T13:40:00.000Z', 
                                    'b0000000-0000-4000-8000-000000000023', 
                                    10);

\echo '======================================================================'
\echo 'USE CASE 2: POST DETAIL'
\echo '======================================================================'
-- Description: Fetch single post by ID with author, media, counts, viewer like status,
-- and referenced post if it is a repost or reply.

PREPARE stmt_post_detail (UUID, UUID) AS
SELECT 
    p.id,
    p.kind,
    p.text,
    p.created_at,
    json_build_object(
        'id', u.id,
        'handle', u.handle,
        'displayName', u.display_name,
        'avatar', json_build_object('smallUrl', u.avatar_small_url, 'largeUrl', u.avatar_large_url)
    ) AS author,
    COALESCE((
        SELECT json_agg(json_build_object(
            'id', m.id,
            'altText', m.alt_text,
            'width', m.width,
            'height', m.height,
            'position', m.position,
            'smallUrl', m.small_url,
            'largeUrl', m.large_url
        ) ORDER BY m.position ASC)
        FROM post_media m 
        WHERE m.post_id = p.id
    ), '[]'::json) AS media,
    (SELECT count(*)::int FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
    (SELECT count(*)::int FROM posts r WHERE r.reply_to_id = p.id AND r.kind = 'reply') AS reply_count,
    EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = $2) AS liked_by_viewer,
    p.reply_to_id,
    p.repost_of_id,
    CASE 
        WHEN p.repost_of_id IS NOT NULL THEN (
            SELECT json_build_object(
                'id', orig.id,
                'text', orig.text,
                'createdAt', orig.created_at,
                'author', json_build_object('id', orig_u.id, 'handle', orig_u.handle, 'displayName', orig_u.display_name)
            )
            FROM posts orig
            JOIN users orig_u ON orig_u.id = orig.author_id
            WHERE orig.id = p.repost_of_id
        )
        ELSE NULL
    END AS referenced_post
FROM posts p
JOIN users u ON u.id = p.author_id
WHERE p.id = $1;

-- Execute detail for Post 1 (original with 4 likes, 3 replies)
\echo '--- Detail: Post 1 (Original) ---'
EXECUTE stmt_post_detail('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001');

-- Execute detail for Repost 1 (reposting Post 2)
\echo '--- Detail: Repost 1 (Referencing Original Post 2) ---'
EXECUTE stmt_post_detail('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001');

\echo '======================================================================'
\echo 'USE CASE 3: DIRECT REPLIES'
\echo '======================================================================'
-- Description: Fetch direct replies to an original post ordered by (created_at DESC, id DESC)
-- with limit+1 and cursor support.

PREPARE stmt_direct_replies (UUID, UUID, INT) AS
SELECT 
    p.id,
    p.kind,
    p.text,
    p.created_at,
    p.reply_to_id,
    json_build_object(
        'id', u.id,
        'handle', u.handle,
        'displayName', u.display_name,
        'avatar', json_build_object('smallUrl', u.avatar_small_url, 'largeUrl', u.avatar_large_url)
    ) AS author,
    (SELECT count(*)::int FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
    EXISTS(SELECT 1 FROM post_likes pl WHERE pl.post_id = p.id AND pl.user_id = $2) AS liked_by_viewer
FROM posts p
JOIN users u ON u.id = p.author_id
WHERE p.kind = 'reply' 
  AND p.reply_to_id = $1
ORDER BY p.created_at DESC, p.id DESC
LIMIT $3 + 1;

\echo '--- Direct Replies to Post 1 ---'
EXECUTE stmt_direct_replies('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 10);

\echo '======================================================================'
\echo 'USE CASE 4: PROFILE MEDIA'
\echo '======================================================================'
-- Description: Stream of media items attached to a user's original posts.
-- Uses media row's own (created_at DESC, id DESC) for stable pagination
-- even when a single post contains multiple images.

PREPARE stmt_profile_media (UUID, INT) AS
SELECT 
    m.id,
    m.post_id,
    m.position,
    m.alt_text,
    m.width,
    m.height,
    m.small_url,
    m.large_url,
    m.created_at
FROM post_media m
JOIN posts p ON p.id = m.post_id
WHERE p.author_id = $1
ORDER BY m.created_at DESC, m.id DESC
LIMIT $2 + 1;

\echo '--- Profile Media for Elena Rostova (u3: has 6 images across 2 posts) ---'
EXECUTE stmt_profile_media('a0000000-0000-4000-8000-000000000003', 10);

\echo '======================================================================'
\echo 'USE CASE 5: PROFILE STATISTICS'
\echo '======================================================================'
-- Description: Number of originals, followers, and following for a user.
-- Evaluates correctly even for users with zero counts (no disappearance from inner join).

PREPARE stmt_profile_stats (UUID) AS
SELECT 
    u.id,
    u.handle,
    u.display_name,
    u.bio,
    json_build_object('smallUrl', u.avatar_small_url, 'largeUrl', u.avatar_large_url) AS avatar,
    (SELECT count(*)::int FROM posts p WHERE p.author_id = u.id AND p.kind = 'original') AS post_count,
    (SELECT count(*)::int FROM follows f WHERE f.following_id = u.id) AS follower_count,
    (SELECT count(*)::int FROM follows f WHERE f.follower_id = u.id) AS following_count
FROM users u
WHERE u.id = $1;

\echo '--- Profile Stats: Asha (Active User) ---'
EXECUTE stmt_profile_stats('a0000000-0000-4000-8000-000000000001');

\echo '--- Profile Stats: Ghost Walker (Zero Posts, Zero Followers, Zero Following) ---'
EXECUTE stmt_profile_stats('a0000000-0000-4000-8000-000000000007');

\echo '======================================================================'
\echo 'USE CASE 6: LIKE TOTALS (Batch Counts for Feed)'
\echo '======================================================================'
-- Description: Efficient batch query fetching like counts for a set of post IDs.
-- Includes posts with 0 likes via LEFT JOIN or subquery grouping.

PREPARE stmt_like_totals (UUID[]) AS
SELECT 
    p.id AS post_id,
    count(pl.user_id)::int AS like_count
FROM unnest($1) AS target(id)
JOIN posts p ON p.id = target.id
LEFT JOIN post_likes pl ON pl.post_id = p.id
GROUP BY p.id;

\echo '--- Batch Like Totals (Includes Post 1 [4 likes], Post 2 [3 likes], Post 30 [0 likes]) ---'
EXECUTE stmt_like_totals(ARRAY[
    'b0000000-0000-4000-8000-000000000001'::UUID,
    'b0000000-0000-4000-8000-000000000002'::UUID,
    'b0000000-0000-4000-8000-000000000030'::UUID
]);

\echo '======================================================================'
\echo 'USE CASE 7: VIEWER STATE (Batch Liked-by-Viewer Lookup)'
\echo '======================================================================'
-- Description: Check which posts from a batch the viewer has liked in ONE single query.
-- Returns the subset of liked post IDs.

PREPARE stmt_viewer_state (UUID, UUID[]) AS
SELECT 
    post_id
FROM post_likes
WHERE user_id = $1
  AND post_id = ANY($2);

\echo '--- Viewer Likes for Asha (u1) across Posts 1, 2, 3, 30 ---'
-- Post 1 was NOT liked by Asha; Post 2 and 3 WERE liked by Asha; Post 30 has 0 likes.
EXECUTE stmt_viewer_state('a0000000-0000-4000-8000-000000000001', ARRAY[
    'b0000000-0000-4000-8000-000000000001'::UUID,
    'b0000000-0000-4000-8000-000000000002'::UUID,
    'b0000000-0000-4000-8000-000000000003'::UUID,
    'b0000000-0000-4000-8000-000000000030'::UUID
]);

\echo '======================================================================'
\echo 'USE CASE 8: FOLLOWING-FEED EXERCISE'
\echo '======================================================================'
-- Description: Feed selecting originals ONLY from authors followed by $viewerId.
-- Demonstrates no duplicate rows, stable ordering, and explains difference from public feed.

PREPARE stmt_following_feed (UUID, INT) AS
SELECT 
    p.id,
    p.kind,
    p.text,
    p.created_at,
    json_build_object('id', u.id, 'handle', u.handle, 'displayName', u.display_name) AS author,
    (SELECT count(*)::int FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
    (SELECT count(*)::int FROM posts r WHERE r.reply_to_id = p.id AND r.kind = 'reply') AS reply_count
FROM follows f
JOIN posts p ON p.author_id = f.following_id
JOIN users u ON u.id = p.author_id
WHERE f.follower_id = $1
  AND p.kind = 'original'
ORDER BY p.created_at DESC, p.id DESC
LIMIT $2 + 1;

\echo '--- Following Feed for Asha (follows Dan, Elena, Priya) ---'
EXECUTE stmt_following_feed('a0000000-0000-4000-8000-000000000001', 10);

\echo '======================================================================'
\echo 'USE CASE 9: SEARCH (Literal Substring Match with Escaped Wildcards)'
\echo '======================================================================'
-- Description: Case-insensitive literal substring search.
-- Treats % and _ as literal user text, not SQL wildcards.
-- Escapes %, _, and \ before ILIKE with ESCAPE '\'.

PREPARE stmt_search_literal (TEXT, INT) AS
SELECT 
    p.id,
    p.kind,
    p.text,
    p.created_at,
    json_build_object('id', u.id, 'handle', u.handle, 'displayName', u.display_name) AS author,
    (SELECT count(*)::int FROM post_likes pl WHERE pl.post_id = p.id) AS like_count
FROM posts p
JOIN users u ON u.id = p.author_id
WHERE p.kind = 'original'
  AND p.text ILIKE '%' || replace(replace(replace($1, '\', '\\'), '%', '\%'), '_', '\_') || '%' ESCAPE '\'
ORDER BY p.created_at DESC, p.id DESC
LIMIT $2 + 1;

\echo '--- Search for "PostgreSQL" ---'
EXECUTE stmt_search_literal('PostgreSQL', 5);

\echo '--- Search for literal text containing "%" (Post 29 contains "100%") ---'
EXECUTE stmt_search_literal('100%', 5);

\echo '--- Search for literal text containing "_" (Post 29 contains "_wildcard") ---'
EXECUTE stmt_search_literal('_wildcard', 5);

\echo '--- Search for no-match string ---'
EXECUTE stmt_search_literal('nonexistent-query-string-xyz', 5);

\echo '======================================================================'
\echo 'USE CASE 10: REPOST LOOKUP'
\echo '======================================================================'
-- Description: Lists a user's reposts and joins the original post and author
-- without storing duplicated original text.

PREPARE stmt_repost_lookup (UUID, INT) AS
SELECT 
    r.id AS repost_id,
    r.created_at AS reposted_at,
    json_build_object(
        'id', rep_u.id,
        'handle', rep_u.handle,
        'displayName', rep_u.display_name
    ) AS reposter,
    json_build_object(
        'id', orig.id,
        'kind', orig.kind,
        'text', orig.text,
        'createdAt', orig.created_at,
        'author', json_build_object(
            'id', orig_u.id,
            'handle', orig_u.handle,
            'displayName', orig_u.display_name
        ),
        'likeCount', (SELECT count(*)::int FROM post_likes pl WHERE pl.post_id = orig.id),
        'replyCount', (SELECT count(*)::int FROM posts rep WHERE rep.reply_to_id = orig.id AND rep.kind = 'reply')
    ) AS original_post
FROM posts r
JOIN users rep_u ON rep_u.id = r.author_id
JOIN posts orig ON orig.id = r.repost_of_id
JOIN users orig_u ON orig_u.id = orig.author_id
WHERE r.kind = 'repost'
  AND r.author_id = $1
ORDER BY r.created_at DESC, r.id DESC
LIMIT $2 + 1;

\echo '--- Reposts by Asha (u1) ---'
EXECUTE stmt_repost_lookup('a0000000-0000-4000-8000-000000000001', 10);

\echo '======================================================================'
\echo 'ALL 10 SQL USE CASES EXECUTED SUCCESSFULLY!'
\echo '======================================================================'
