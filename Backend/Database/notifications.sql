-- ============================================================================
-- PRD 03: Optional Extension — Notification Modeling
-- Database: PostgreSQL 17
--
-- Models:
--   - Recipient, actor, event_type ('like', 'reply', 'repost', 'follow')
--   - Target post (required for like/reply/repost, forbidden for follow)
--   - Stable source_event_id to prevent duplicate notification rows on retries
--   - Read timestamp (read_at)
--   - Cascading cleanup on target post or user deletion
-- ============================================================================

DROP TABLE IF EXISTS notifications CASCADE;

CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(20) NOT NULL,
    post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
    source_event_id TEXT NOT NULL,
    read_at TIMESTAMPTZ(3),
    created_at TIMESTAMPTZ(3) NOT NULL DEFAULT clock_timestamp(),

    -- Constraints
    CONSTRAINT uq_notifications_source_event UNIQUE (source_event_id),
    CONSTRAINT ck_notifications_valid_type CHECK (
        event_type IN ('like', 'reply', 'repost', 'follow')
    ),
    -- like, reply, and repost MUST reference a post; follow MUST NOT reference a post
    CONSTRAINT ck_notifications_post_target CHECK (
        (event_type IN ('like', 'reply', 'repost') AND post_id IS NOT NULL) OR
        (event_type = 'follow' AND post_id IS NULL)
    ),
    -- Actors should not receive notifications for actions on their own content
    CONSTRAINT ck_notifications_no_self_notification CHECK (
        recipient_id <> actor_id
    )
);

-- Index for retrieving unread or chronological notifications for a recipient
CREATE INDEX idx_notifications_recipient_feed 
    ON notifications (recipient_id, created_at DESC, id DESC);

CREATE INDEX idx_notifications_recipient_unread 
    ON notifications (recipient_id, created_at DESC) 
    WHERE read_at IS NULL;

-- ----------------------------------------------------------------------------
-- Seed deterministic notification events
-- ----------------------------------------------------------------------------
INSERT INTO notifications (id, recipient_id, actor_id, event_type, post_id, source_event_id, read_at, created_at)
VALUES
    -- Dan liked Asha's Post 1
    ('f0000000-0000-4000-8000-000000000001', 
     'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 
     'like', 'b0000000-0000-4000-8000-000000000001', 
     'like:b0000000-0000-4000-8000-000000000001:a0000000-0000-4000-8000-000000000002',
     NULL, '2026-09-01T10:02:00.000Z'),

    -- Elena liked Asha's Post 1
    ('f0000000-0000-4000-8000-000000000002', 
     'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 
     'like', 'b0000000-0000-4000-8000-000000000001', 
     'like:b0000000-0000-4000-8000-000000000001:a0000000-0000-4000-8000-000000000003',
     NULL, '2026-09-01T10:04:00.000Z'),

    -- Dan replied to Asha's Post 1 (Reply 1)
    ('f0000000-0000-4000-8000-000000000003', 
     'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 
     'reply', 'c0000000-0000-4000-8000-000000000001', 
     'reply:c0000000-0000-4000-8000-000000000001',
     NULL, '2026-09-01T10:05:00.000Z'),

    -- Dan reposted Asha's Post 1 (Repost 2)
    ('f0000000-0000-4000-8000-000000000004', 
     'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 
     'repost', 'd0000000-0000-4000-8000-000000000002', 
     'repost:d0000000-0000-4000-8000-000000000002',
     NULL, '2026-09-01T10:45:00.000Z'),

    -- Marcus followed Asha
    ('f0000000-0000-4000-8000-000000000005', 
     'a0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000004', 
     'follow', NULL, 
     'follow:a0000000-0000-4000-8000-000000000004:a0000000-0000-4000-8000-000000000001',
     '2026-09-01T09:00:00.000Z', '2026-09-01T08:42:00.000Z')
ON CONFLICT (id) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Unread Notifications Query
-- ----------------------------------------------------------------------------
\echo '======================================================================'
\echo 'UNREAD NOTIFICATIONS QUERY FOR ASHA (a...0001)'
\echo '======================================================================'
SELECT 
    n.id,
    n.event_type,
    n.created_at,
    n.source_event_id,
    json_build_object(
        'id', act.id,
        'handle', act.handle,
        'displayName', act.display_name
    ) AS actor,
    CASE 
        WHEN n.post_id IS NOT NULL THEN json_build_object(
            'id', p.id,
            'kind', p.kind,
            'text', p.text
        )
        ELSE NULL
    END AS post
FROM notifications n
JOIN users act ON act.id = n.actor_id
LEFT JOIN posts p ON p.id = n.post_id
WHERE n.recipient_id = 'a0000000-0000-4000-8000-000000000001'
  AND n.read_at IS NULL
ORDER BY n.created_at DESC, n.id DESC;
