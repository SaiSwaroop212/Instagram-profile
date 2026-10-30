-- ============================================================================
-- PRD 03: Seed Manifest Verification Script
-- Outputs:
--   1. Total entity counts (users, originals, replies, reposts, media, likes, follows)
--   2. One user's profile statistics (Asha: followers, following, originals)
--   3. One original post's reaction counts (Post 1: likes, replies, media)
--   4. Edge cases verification (timestamp tie, zero-reaction post, zero-follower user)
-- ============================================================================

\echo '----------------------------------------------------------------------'
\echo '1. SEED ENTITY COUNTS'
\echo '----------------------------------------------------------------------'
SELECT 
    (SELECT count(*) FROM users) AS user_count,
    (SELECT count(*) FROM posts WHERE kind = 'original') AS original_post_count,
    (SELECT count(*) FROM posts WHERE kind = 'reply') AS reply_count,
    (SELECT count(*) FROM posts WHERE kind = 'repost') AS repost_count,
    (SELECT count(*) FROM posts) AS total_posts,
    (SELECT count(*) FROM post_media) AS media_count,
    (SELECT count(*) FROM post_likes) AS like_count,
    (SELECT count(*) FROM follows) AS follow_edge_count;

\echo '----------------------------------------------------------------------'
\echo '2. USER PROFILE STATS: ASHA (a0000000-0000-4000-8000-000000000001)'
\echo '----------------------------------------------------------------------'
SELECT 
    u.id,
    u.handle,
    u.display_name,
    (SELECT count(*) FROM posts p WHERE p.author_id = u.id AND p.kind = 'original') AS original_post_count,
    (SELECT count(*) FROM follows f WHERE f.following_id = u.id) AS follower_count,
    (SELECT count(*) FROM follows f WHERE f.follower_id = u.id) AS following_count
FROM users u
WHERE u.id = 'a0000000-0000-4000-8000-000000000001';

\echo '----------------------------------------------------------------------'
\echo '3. POST REACTION COUNTS: POST 1 (b0000000-0000-4000-8000-000000000001)'
\echo '----------------------------------------------------------------------'
SELECT 
    p.id,
    p.kind,
    p.text,
    (SELECT count(*) FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
    (SELECT count(*) FROM posts r WHERE r.reply_to_id = p.id AND r.kind = 'reply') AS reply_count,
    (SELECT count(*) FROM posts rep WHERE rep.repost_of_id = p.id AND rep.kind = 'repost') AS repost_count,
    (SELECT count(*) FROM post_media pm WHERE pm.post_id = p.id) AS media_count
FROM posts p
WHERE p.id = 'b0000000-0000-4000-8000-000000000001';

\echo '----------------------------------------------------------------------'
\echo '4. TIMESTAMP TIE VERIFICATION (Posts sharing identical created_at)'
\echo '----------------------------------------------------------------------'
SELECT 
    id, author_id, kind, created_at, text
FROM posts
WHERE created_at = '2026-09-01T13:40:00.000Z'
ORDER BY id DESC;

\echo '----------------------------------------------------------------------'
\echo '5. ZERO REACTION POST VERIFICATION (Post 30)'
\echo '----------------------------------------------------------------------'
SELECT 
    p.id,
    p.text,
    (SELECT count(*) FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
    (SELECT count(*) FROM posts r WHERE r.reply_to_id = p.id) AS reply_count
FROM posts p
WHERE p.id = 'b0000000-0000-4000-8000-000000000030';

\echo '----------------------------------------------------------------------'
\echo '6. ZERO-FOLLOWER / ZERO-MEDIA USER VERIFICATION (Ghost Walker)'
\echo '----------------------------------------------------------------------'
SELECT 
    u.id,
    u.handle,
    (SELECT count(*) FROM follows f WHERE f.following_id = u.id) AS follower_count,
    (SELECT count(*) FROM follows f WHERE f.follower_id = u.id) AS following_count,
    (SELECT count(*) FROM post_media pm JOIN posts p ON pm.post_id = p.id WHERE p.author_id = u.id) AS media_count
FROM users u
WHERE u.handle = 'ghost_user';
