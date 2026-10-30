-- ============================================================================
-- PRD 03: Deterministic Seed Data for Social-Feed Database
-- All IDs are strictly valid RFC 4122 UUID v4 strings (hex characters only):
--   - Users:     a0000000-0000-4000-8000-000000000001 .. 07
--   - Originals: b0000000-0000-4000-8000-000000000001 .. 32
--   - Replies:   c0000000-0000-4000-8000-000000000001 .. 14
--   - Reposts:   d0000000-0000-4000-8000-000000000001 .. 05
--   - Media:     e0000000-0000-4000-8000-000000000001 .. 12
--
-- Satisfies all PRD criteria:
--   - 7 users (>= 6)
--   - 32 original posts (>= 30)
--   - 14 direct replies (>= 12)
--   - 5 reposts (>= 4)
--   - 12 media rows (>= 10)
--   - 18 likes (>= 15)
--   - 10 follow edges (>= 8)
--   - Fixed UTC timestamps (timestamptz(3))
--   - Identical timestamp tie between originals (b...0022 and b...0023)
--   - User with 0 media & 0 followers (ghost_user)
--   - Original post with 0 reactions (b...0030)
--   - Liked original (b...0001 has 4 likes, 3 replies)
--   - Idempotent (ON CONFLICT DO NOTHING)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. SEED USERS (7 users)
-- ----------------------------------------------------------------------------
INSERT INTO users (id, handle, display_name, bio, avatar_small_url, avatar_large_url, created_at, updated_at)
VALUES
    ('a0000000-0000-4000-8000-000000000001', 'asha', 'Asha Sharma', 
     'Full-stack engineer building fast distributed systems.', 
     '/fixtures/asha-48.jpg', '/fixtures/asha-96.jpg', 
     '2026-09-01T08:00:00.000Z', '2026-09-01T08:00:00.000Z'),

    ('a0000000-0000-4000-8000-000000000002', 'dan_dev', 'Dan Miller', 
     'Database internals and indexing enthusiast.', 
     '/fixtures/dan-48.jpg', '/fixtures/dan-96.jpg', 
     '2026-09-01T08:05:00.000Z', '2026-09-01T08:05:00.000Z'),

    ('a0000000-0000-4000-8000-000000000003', 'elena_r', 'Elena Rostova', 
     'Photographer, UI architect, and typography lover.', 
     '/fixtures/elena-48.jpg', '/fixtures/elena-96.jpg', 
     '2026-09-01T08:10:00.000Z', '2026-09-01T08:10:00.000Z'),

    ('a0000000-0000-4000-8000-000000000004', 'marcus_k', 'Marcus Chen', 
     'Open-source maintainer and systems hacker.', 
     '/fixtures/marcus-48.jpg', '/fixtures/marcus-48.jpg', 
     '2026-09-01T08:15:00.000Z', '2026-09-01T08:15:00.000Z'),

    ('a0000000-0000-4000-8000-000000000005', 'priya_tech', 'Priya Patel', 
     'Engineering lead, distributed caches & coffee.', 
     '/fixtures/priya-48.jpg', '/fixtures/priya-96.jpg', 
     '2026-09-01T08:20:00.000Z', '2026-09-01T08:20:00.000Z'),

    ('a0000000-0000-4000-8000-000000000006', 'sam_nomad', 'Samira Vance', 
     'Digital nomad documenting cloud native architectures.', 
     '/fixtures/sam-48.jpg', '/fixtures/sam-96.jpg', 
     '2026-09-01T08:25:00.000Z', '2026-09-01T08:25:00.000Z'),

    ('a0000000-0000-4000-8000-000000000007', 'ghost_user', 'Ghost Walker', 
     'Quiet observer with zero followers and zero media uploads.', 
     '/fixtures/ghost-48.jpg', '/fixtures/ghost-96.jpg', 
     '2026-09-01T08:30:00.000Z', '2026-09-01T08:30:00.000Z')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 2. SEED ORIGINAL POSTS (32 posts)
-- Post b...0022 and b...0023 share identical timestamp: '2026-09-01T13:40:00.000Z'
-- ----------------------------------------------------------------------------
INSERT INTO posts (id, author_id, kind, text, reply_to_id, repost_of_id, created_at, updated_at)
VALUES
    ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'original',
     'Welcome to our new PostgreSQL-backed social platform! Let us test relational integrity.', 
     NULL, NULL, '2026-09-01T10:00:00.000Z', '2026-09-01T10:00:00.000Z'),

    ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'original',
     'Indexes are not magic sprinkles. Every index on a table introduces write amplification.', 
     NULL, NULL, '2026-09-01T10:10:00.000Z', '2026-09-01T10:10:00.000Z'),

    ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003', 'original',
     'Captured sunset highlights across Kyoto. Multi-image gallery attached.', 
     NULL, NULL, '2026-09-01T10:20:00.000Z', '2026-09-01T10:20:00.000Z'),

    ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000004', 'original',
     'Writing Rust services that interface with PostgreSQL using connection pooling.', 
     NULL, NULL, '2026-09-01T10:30:00.000Z', '2026-09-01T10:30:00.000Z'),

    ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000003', 'original',
     'Minimalist desk setup with natural sunlight and dual monitors.', 
     NULL, NULL, '2026-09-01T10:40:00.000Z', '2026-09-01T10:40:00.000Z'),

    ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000005', 'original',
     'Distributed caching invalidation: why TTLs are safer than manual purge broadcasts.', 
     NULL, NULL, '2026-09-01T10:50:00.000Z', '2026-09-01T10:50:00.000Z'),

    ('b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000001', 'original',
     'Tuple-based cursor pagination eliminates duplicate rows during rapid insertions.', 
     NULL, NULL, '2026-09-01T11:00:00.000Z', '2026-09-01T11:00:00.000Z'),

    ('b0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000006', 'original',
     'Remote coding from the Alps. Here are three scenic shots from today hike.', 
     NULL, NULL, '2026-09-01T11:10:00.000Z', '2026-09-01T11:10:00.000Z'),

    ('b0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000004', 'original',
     'Linux kernel eBPF tracing uncovered an unexpected TCP retransmit loop in staging.', 
     NULL, NULL, '2026-09-01T11:20:00.000Z', '2026-09-01T11:20:00.000Z'),

    ('b0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000002', 'original',
     'B-tree leaf page splits and fillfactor tuning in high-write workloads.', 
     NULL, NULL, '2026-09-01T11:30:00.000Z', '2026-09-01T11:30:00.000Z'),

    ('b0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000005', 'original',
     'Continuous deployment with blue-green database schema migrations without downtime.', 
     NULL, NULL, '2026-09-01T11:40:00.000Z', '2026-09-01T11:40:00.000Z'),

    ('b0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000002', 'original',
     'Clean server room cables before and after restructuring. Two photos attached.', 
     NULL, NULL, '2026-09-01T11:50:00.000Z', '2026-09-01T11:50:00.000Z'),

    ('b0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000006', 'original',
     'Coffee culture in Vienna: quiet roasteries and great espresso.', 
     NULL, NULL, '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z'),

    ('b0000000-0000-4000-8000-000000000014', 'a0000000-0000-4000-8000-000000000001', 'original',
     'Why foreign keys must enforce relational integrity rather than trusting application code.', 
     NULL, NULL, '2026-09-01T12:10:00.000Z', '2026-09-01T12:10:00.000Z'),

    ('b0000000-0000-4000-8000-000000000015', 'a0000000-0000-4000-8000-000000000003', 'original',
     'Color grading raw sensor output for OLED displays: gamut mappings and contrasts.', 
     NULL, NULL, '2026-09-01T12:20:00.000Z', '2026-09-01T12:20:00.000Z'),

    ('b0000000-0000-4000-8000-000000000016', 'a0000000-0000-4000-8000-000000000004', 'original',
     'Zero-copy networking with io_uring on modern Linux kernels.', 
     NULL, NULL, '2026-09-01T12:30:00.000Z', '2026-09-01T12:30:00.000Z'),

    ('b0000000-0000-4000-8000-000000000017', 'a0000000-0000-4000-8000-000000000005', 'original',
     'Observability pipelines: OpenTelemetry collector deployment strategies.', 
     NULL, NULL, '2026-09-01T12:40:00.000Z', '2026-09-01T12:40:00.000Z'),

    ('b0000000-0000-4000-8000-000000000018', 'a0000000-0000-4000-8000-000000000001', 'original',
     'PostgreSQL 17 query optimizer improvements and explain buffers analysis.', 
     NULL, NULL, '2026-09-01T12:50:00.000Z', '2026-09-01T12:50:00.000Z'),

    ('b0000000-0000-4000-8000-000000000019', 'a0000000-0000-4000-8000-000000000002', 'original',
     'Vacuum freeze semantics and multixact ID wraparound protection.', 
     NULL, NULL, '2026-09-01T13:00:00.000Z', '2026-09-01T13:00:00.000Z'),

    ('b0000000-0000-4000-8000-000000000020', 'a0000000-0000-4000-8000-000000000006', 'original',
     'Navigating mountain passes in Switzerland during early autumn.', 
     NULL, NULL, '2026-09-01T13:10:00.000Z', '2026-09-01T13:10:00.000Z'),

    ('b0000000-0000-4000-8000-000000000021', 'a0000000-0000-4000-8000-000000000004', 'original',
     'Compiling web services with musl libc for lightweight static Alpine containers.', 
     NULL, NULL, '2026-09-01T13:20:00.000Z', '2026-09-01T13:20:00.000Z'),

    -- Posts 22 and 23 share identical timestamp: 2026-09-01T13:40:00.000Z
    ('b0000000-0000-4000-8000-000000000022', 'a0000000-0000-4000-8000-000000000005', 'original',
     'Synchronous vs asynchronous replication in PostgreSQL high availability clusters.', 
     NULL, NULL, '2026-09-01T13:40:00.000Z', '2026-09-01T13:40:00.000Z'),

    ('b0000000-0000-4000-8000-000000000023', 'a0000000-0000-4000-8000-000000000001', 'original',
     'Timestamp tie test: this original shares the exact same timestamp as post 22.', 
     NULL, NULL, '2026-09-01T13:40:00.000Z', '2026-09-01T13:40:00.000Z'),

    ('b0000000-0000-4000-8000-000000000024', 'a0000000-0000-4000-8000-000000000003', 'original',
     'Designing responsive data tables that maintain readability on mobile screens.', 
     NULL, NULL, '2026-09-01T13:50:00.000Z', '2026-09-01T13:50:00.000Z'),

    ('b0000000-0000-4000-8000-000000000025', 'a0000000-0000-4000-8000-000000000002', 'original',
     'WAL segment recycling and checkpoint completion target considerations.', 
     NULL, NULL, '2026-09-01T14:00:00.000Z', '2026-09-01T14:00:00.000Z'),

    ('b0000000-0000-4000-8000-000000000026', 'a0000000-0000-4000-8000-000000000006', 'original',
     'Quiet morning working from Lake Como. Reflections on decoupled web architecture.', 
     NULL, NULL, '2026-09-01T14:10:00.000Z', '2026-09-01T14:10:00.000Z'),

    ('b0000000-0000-4000-8000-000000000027', 'a0000000-0000-4000-8000-000000000004', 'original',
     'Memory safety in systems languages: comparing compile-time checks and borrow checker.', 
     NULL, NULL, '2026-09-01T14:20:00.000Z', '2026-09-01T14:20:00.000Z'),

    ('b0000000-0000-4000-8000-000000000028', 'a0000000-0000-4000-8000-000000000005', 'original',
     'Event-driven architectures: comparing transactional outbox pattern to log CDC.', 
     NULL, NULL, '2026-09-01T14:30:00.000Z', '2026-09-01T14:30:00.000Z'),

    ('b0000000-0000-4000-8000-000000000029', 'a0000000-0000-4000-8000-000000000001', 'original',
     'Literal search testing: searching for 100% pure SQL and _wildcard symbols.', 
     NULL, NULL, '2026-09-01T14:40:00.000Z', '2026-09-01T14:40:00.000Z'),

    -- Post 30 has ZERO reactions (0 likes, 0 replies, 0 reposts) to test zero handling!
    ('b0000000-0000-4000-8000-000000000030', 'a0000000-0000-4000-8000-000000000002', 'original',
     'Isolated post with absolutely zero reactions or comments. Testing outer joins.', 
     NULL, NULL, '2026-09-01T14:50:00.000Z', '2026-09-01T14:50:00.000Z'),

    ('b0000000-0000-4000-8000-000000000031', 'a0000000-0000-4000-8000-000000000003', 'original',
     'Design systems with atomic tokens and semantic CSS custom properties.', 
     NULL, NULL, '2026-09-01T15:00:00.000Z', '2026-09-01T15:00:00.000Z'),

    ('b0000000-0000-4000-8000-000000000032', 'a0000000-0000-4000-8000-000000000004', 'original',
     'Latest post on the timeline: benchmarking JSONB versus normalized relational columns.', 
     NULL, NULL, '2026-09-01T15:10:00.000Z', '2026-09-01T15:10:00.000Z')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. SEED DIRECT REPLIES (14 replies)
-- ----------------------------------------------------------------------------
INSERT INTO posts (id, author_id, kind, text, reply_to_id, repost_of_id, created_at, updated_at)
VALUES
    -- 3 replies on Post 1
    ('c0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'reply',
     'Excited to see the relational schema come to life! Solid foundation.', 
     'b0000000-0000-4000-8000-000000000001', NULL, '2026-09-01T10:05:00.000Z', '2026-09-01T10:05:00.000Z'),

    ('c0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003', 'reply',
     'The UI client renders avatars and media variants seamlessly.', 
     'b0000000-0000-4000-8000-000000000001', NULL, '2026-09-01T10:07:00.000Z', '2026-09-01T10:07:00.000Z'),

    ('c0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000005', 'reply',
     'Checking transactional guarantees next. Great kickoff!', 
     'b0000000-0000-4000-8000-000000000001', NULL, '2026-09-01T10:12:00.000Z', '2026-09-01T10:12:00.000Z'),

    -- 2 replies on Post 2
    ('c0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'reply',
     'Completely agree. Measure with EXPLAIN (ANALYZE, BUFFERS) before adding indexes.', 
     'b0000000-0000-4000-8000-000000000002', NULL, '2026-09-01T10:15:00.000Z', '2026-09-01T10:15:00.000Z'),

    ('c0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000004', 'reply',
     'HOT (Heap-Only Tuple) updates can mitigate index write costs if indexed columns are untouched.', 
     'b0000000-0000-4000-8000-000000000002', NULL, '2026-09-01T10:18:00.000Z', '2026-09-01T10:18:00.000Z'),

    -- 1 reply on Post 3
    ('c0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000006', 'reply',
     'Stunning gallery, Elena! What focal length did you use for the first frame?', 
     'b0000000-0000-4000-8000-000000000003', NULL, '2026-09-01T10:25:00.000Z', '2026-09-01T10:25:00.000Z'),

    -- 2 replies on Post 7
    ('c0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000002', 'reply',
     'Offset pagination causes O(N) page skipping scans. Keysets are O(1) with proper B-trees.', 
     'b0000000-0000-4000-8000-000000000007', NULL, '2026-09-01T11:05:00.000Z', '2026-09-01T11:05:00.000Z'),

    ('c0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000004', 'reply',
     'And tuple comparison (created_at, id) < ($1, $2) is standard SQL supported cleanly by Postgres.', 
     'b0000000-0000-4000-8000-000000000007', NULL, '2026-09-01T11:08:00.000Z', '2026-09-01T11:08:00.000Z'),

    -- 1 reply on Post 8
    ('c0000000-0000-4000-8000-000000000009', 'a0000000-0000-4000-8000-000000000003', 'reply',
     'The mountain light is incredible. Perfect setup for outdoor work.', 
     'b0000000-0000-4000-8000-000000000008', NULL, '2026-09-01T11:15:00.000Z', '2026-09-01T11:15:00.000Z'),

    -- 2 replies on Post 14
    ('c0000000-0000-4000-8000-000000000010', 'a0000000-0000-4000-8000-000000000005', 'reply',
     'Application validations can be bypassed by manual queries or bugs. DB constraints never lie.', 
     'b0000000-0000-4000-8000-000000000014', NULL, '2026-09-01T12:15:00.000Z', '2026-09-01T12:15:00.000Z'),

    ('c0000000-0000-4000-8000-000000000011', 'a0000000-0000-4000-8000-000000000002', 'reply',
     'Enforcing kind=original via compound FK is such a clean relational pattern.', 
     'b0000000-0000-4000-8000-000000000014', NULL, '2026-09-01T12:18:00.000Z', '2026-09-01T12:18:00.000Z'),

    -- 1 reply on Post 22
    ('c0000000-0000-4000-8000-000000000012', 'a0000000-0000-4000-8000-000000000004', 'reply',
     'Synchronous commit ensures zero data loss during failover at the expense of write latency.', 
     'b0000000-0000-4000-8000-000000000022', NULL, '2026-09-01T13:45:00.000Z', '2026-09-01T13:45:00.000Z'),

    -- 2 replies on Post 29
    ('c0000000-0000-4000-8000-000000000013', 'a0000000-0000-4000-8000-000000000002', 'reply',
     'Escaping ILIKE with ESCAPE \ prevents wildcard injection cleanly.', 
     'b0000000-0000-4000-8000-000000000029', NULL, '2026-09-01T14:45:00.000Z', '2026-09-01T14:45:00.000Z'),

    ('c0000000-0000-4000-8000-000000000014', 'a0000000-0000-4000-8000-000000000005', 'reply',
     'Or parameterized position() / strpos() for pure literal matching without regex parsing.', 
     'b0000000-0000-4000-8000-000000000029', NULL, '2026-09-01T14:48:00.000Z', '2026-09-01T14:48:00.000Z')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. SEED REPOSTS (5 reposts)
-- ----------------------------------------------------------------------------
INSERT INTO posts (id, author_id, kind, text, reply_to_id, repost_of_id, created_at, updated_at)
VALUES
    ('d0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'repost', 
     NULL, NULL, 'b0000000-0000-4000-8000-000000000002', 
     '2026-09-01T10:35:00.000Z', '2026-09-01T10:35:00.000Z'),

    ('d0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'repost', 
     NULL, NULL, 'b0000000-0000-4000-8000-000000000001', 
     '2026-09-01T10:45:00.000Z', '2026-09-01T10:45:00.000Z'),

    ('d0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000004', 'repost', 
     NULL, NULL, 'b0000000-0000-4000-8000-000000000003', 
     '2026-09-01T11:00:00.000Z', '2026-09-01T11:00:00.000Z'),

    ('d0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000005', 'repost', 
     NULL, NULL, 'b0000000-0000-4000-8000-000000000007', 
     '2026-09-01T11:30:00.000Z', '2026-09-01T11:30:00.000Z'),

    ('d0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000006', 'repost', 
     NULL, NULL, 'b0000000-0000-4000-8000-000000000001', 
     '2026-09-01T12:00:00.000Z', '2026-09-01T12:00:00.000Z')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. SEED POST MEDIA (12 media rows)
-- ----------------------------------------------------------------------------
INSERT INTO post_media (id, post_id, position, alt_text, width, height, small_url, large_url, created_at)
VALUES
    -- Post 1 (by Asha): 1 image
    ('e0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 0,
     'PostgreSQL relational schema diagram on a high-resolution display', 
     1200, 800, '/fixtures/schema-480.jpg', '/fixtures/schema-1200.jpg', 
     '2026-09-01T10:00:00.000Z'),

    -- Post 3 (by Elena): 4 images (demonstrating maximum allowed 4 images, positions 0,1,2,3)
    ('e0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000003', 0,
     'Golden hour sunlight hitting the Yasaka pagoda in Kyoto', 
     1920, 1080, '/fixtures/kyoto-1-480.jpg', '/fixtures/kyoto-1-1920.jpg', 
     '2026-09-01T10:20:00.000Z'),

    ('e0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003', 1,
     'Bamboo forest path in Arashiyama under soft diffused morning light', 
     1920, 1080, '/fixtures/kyoto-2-480.jpg', '/fixtures/kyoto-2-1920.jpg', 
     '2026-09-01T10:20:01.000Z'),

    ('e0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000003', 2,
     'Traditional wooden machiya townhouse with warm lantern illumination', 
     1080, 1080, '/fixtures/kyoto-3-480.jpg', '/fixtures/kyoto-3-1080.jpg', 
     '2026-09-01T10:20:02.000Z'),

    ('e0000000-0000-4000-8000-000000000005', 'b0000000-0000-4000-8000-000000000003', 3,
     'Zen rock garden at Ryoan-ji showing raked gravel patterns', 
     1920, 1280, '/fixtures/kyoto-4-480.jpg', '/fixtures/kyoto-4-1920.jpg', 
     '2026-09-01T10:20:03.000Z'),

    -- Post 5 (by Elena): 2 images (positions 0, 1)
    ('e0000000-0000-4000-8000-000000000006', 'b0000000-0000-4000-8000-000000000005', 0,
     'Minimalist wooden oak desk with mechanical keyboard and monitor', 
     1600, 900, '/fixtures/desk-1-480.jpg', '/fixtures/desk-1-1600.jpg', 
     '2026-09-01T10:40:00.000Z'),

    ('e0000000-0000-4000-8000-000000000007', 'b0000000-0000-4000-8000-000000000005', 1,
     'Warm task lamp illuminating an open engineering notebook', 
     1600, 900, '/fixtures/desk-2-480.jpg', '/fixtures/desk-2-1600.jpg', 
     '2026-09-01T10:40:01.000Z'),

    -- Post 8 (by Samira): 3 images (positions 0, 1, 2)
    ('e0000000-0000-4000-8000-000000000008', 'b0000000-0000-4000-8000-000000000008', 0,
     'Alpine peaks covered in fresh morning snow under clear blue sky', 
     2048, 1152, '/fixtures/alps-1-480.jpg', '/fixtures/alps-1-2048.jpg', 
     '2026-09-01T11:10:00.000Z'),

    ('e0000000-0000-4000-8000-000000000009', 'b0000000-0000-4000-8000-000000000008', 1,
     'Wooden mountain cabin with outdoor deck and laptop overlooking valley', 
     2048, 1152, '/fixtures/alps-2-480.jpg', '/fixtures/alps-2-2048.jpg', 
     '2026-09-01T11:10:01.000Z'),

    ('e0000000-0000-4000-8000-000000000010', 'b0000000-0000-4000-8000-000000000008', 2,
     'Trail marker indicating high alpine path elevation at 2400m', 
     1080, 1350, '/fixtures/alps-3-480.jpg', '/fixtures/alps-3-1080.jpg', 
     '2026-09-01T11:10:02.000Z'),

    -- Post 12 (by Dan): 2 images (positions 0, 1)
    ('e0000000-0000-4000-8000-000000000011', 'b0000000-0000-4000-8000-000000000012', 0,
     'Server rack cable management before restructuring showing cluttered cords', 
     1280, 720, '/fixtures/rack-before-480.jpg', '/fixtures/rack-before-1280.jpg', 
     '2026-09-01T11:50:00.000Z'),

    ('e0000000-0000-4000-8000-000000000012', 'b0000000-0000-4000-8000-000000000012', 1,
     'Server rack cable management after color-coded velocity velcro bundle installation', 
     1280, 720, '/fixtures/rack-after-480.jpg', '/fixtures/rack-after-1280.jpg', 
     '2026-09-01T11:50:01.000Z')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 6. SEED POST LIKES (18 likes)
-- ----------------------------------------------------------------------------
INSERT INTO post_likes (post_id, user_id, created_at)
VALUES
    -- Post 1 (4 likes)
    ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', '2026-09-01T10:02:00.000Z'),
    ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', '2026-09-01T10:04:00.000Z'),
    ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', '2026-09-01T10:06:00.000Z'),
    ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', '2026-09-01T10:08:00.000Z'),

    -- Post 2 (3 likes)
    ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', '2026-09-01T10:12:00.000Z'),
    ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000003', '2026-09-01T10:14:00.000Z'),
    ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000006', '2026-09-01T10:16:00.000Z'),

    -- Post 3 (3 likes)
    ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', '2026-09-01T10:22:00.000Z'),
    ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000002', '2026-09-01T10:24:00.000Z'),
    ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000004', '2026-09-01T10:26:00.000Z'),

    -- Post 7 (2 likes)
    ('b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000002', '2026-09-01T11:02:00.000Z'),
    ('b0000000-0000-4000-8000-000000000007', 'a0000000-0000-4000-8000-000000000005', '2026-09-01T11:04:00.000Z'),

    -- Post 8 (2 likes)
    ('b0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000001', '2026-09-01T11:12:00.000Z'),
    ('b0000000-0000-4000-8000-000000000008', 'a0000000-0000-4000-8000-000000000003', '2026-09-01T11:14:00.000Z'),

    -- Post 14 (2 likes)
    ('b0000000-0000-4000-8000-000000000014', 'a0000000-0000-4000-8000-000000000002', '2026-09-01T12:12:00.000Z'),
    ('b0000000-0000-4000-8000-000000000014', 'a0000000-0000-4000-8000-000000000004', '2026-09-01T12:14:00.000Z'),

    -- Post 22 (1 like)
    ('b0000000-0000-4000-8000-000000000022', 'a0000000-0000-4000-8000-000000000001', '2026-09-01T13:42:00.000Z'),

    -- Post 29 (1 like)
    ('b0000000-0000-4000-8000-000000000029', 'a0000000-0000-4000-8000-000000000002', '2026-09-01T14:42:00.000Z')
ON CONFLICT (post_id, user_id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 7. SEED FOLLOW EDGES (10 follow edges)
-- ----------------------------------------------------------------------------
INSERT INTO follows (follower_id, following_id, created_at)
VALUES
    -- Asha follows 3 people
    ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', '2026-09-01T08:35:00.000Z'),
    ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', '2026-09-01T08:36:00.000Z'),
    ('a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000005', '2026-09-01T08:37:00.000Z'),

    -- 4 people follow Asha
    ('a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', '2026-09-01T08:40:00.000Z'),
    ('a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000001', '2026-09-01T08:41:00.000Z'),
    ('a0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', '2026-09-01T08:42:00.000Z'),
    ('a0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-000000000001', '2026-09-01T08:43:00.000Z'),

    -- Other graph edges
    ('a0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000004', '2026-09-01T08:45:00.000Z'),
    ('a0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000006', '2026-09-01T08:46:00.000Z'),
    ('a0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-000000000002', '2026-09-01T08:47:00.000Z')
ON CONFLICT (follower_id, following_id) DO NOTHING;
