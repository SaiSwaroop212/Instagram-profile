# Architecture Decision Record: 06 - Notification Inbox & Consistency

**Status:** Accepted  
**Date:** 2026-10-23  
**Context:** Feature JS-P0-06 Notification Inbox  

---

## 1. Context & Problem Statement

Users need immediate, reliable, and exactly-once awareness of interactions on their profile and content (follows, follow-request acceptances, likes, direct replies, and reposts). The notification system must satisfy the following constraints:
1. **Zero False Notifications:** An interaction that rolls back or fails must never leave a ghost notification.
2. **Exactly-Once Deduplication:** Retrying an action (e.g. concurrent mobile requests) must never create duplicate notifications.
3. **No Self-Notifications:** Actors must never be notified of their own actions.
4. **Authoritative & Race-Resistant Read State:** "Mark all read" must not mark mid-flight notifications arrived during request execution.
5. **Privacy & IDOR Isolation:** Recipients can only access and modify their own notifications.
6. **Graceful Handling of Removed Content & Deactivated Actors:** Tombstone display without breaking inbox streams.

---

## 2. Decision Log

### Decision 6.1: Same-Transaction Write vs. After-Commit Outbox
* **Choice:** **Same-Transaction Write** within interactive `prisma.$transaction`.
* **Rationale:**
  * For P0 requirements, atomic write within the source event transaction guarantees that the source row (like, post, follow) and the notification row commit together or fail together.
  * Eliminates phantom notifications where a client retries or an unexpected error crashes the application after the source write.
  * In PostgreSQL, writing a single row to `notifications` indexed by `(recipient_id, created_at DESC)` adds negligible overhead (< 2ms) and avoids the operational complexity of outbox polling tables or external message brokers.

### Decision 6.2: Deduplication Key Schema
* **Choice:** Natural compound keys stored in `source_event_id` with a database `UNIQUE` constraint:
  * Like: `like:${postId}:${actorId}`
  * Follow: `follow:${actorId}:${recipientId}`
  * Follow Accept: `follow_accept:${actorId}:${recipientId}`
  * Reply: `reply:${replyPostId}`
  * Repost: `repost:${repostPostId}`
* **Behavior on Unlike/Re-like:**
  * When a user unlikes a post, the unread notification is removed in the same transaction. If the user later re-likes, a fresh notification is created cleanly without duplicate key conflicts.

### Decision 6.3: "Mark All Read" Boundary Semantics
* **Choice:** Bounded snapshot update using transaction timestamp:
  ```sql
  UPDATE notifications
  SET read_at = NOW()
  WHERE recipient_id = $1
    AND read_at IS NULL
    AND created_at <= $2; -- request timestamp cutoff
  ```
* **Rationale:** Prevents race conditions where a new notification arrives while the user is executing "mark all read", which would otherwise mark unread notifications as read before the user ever received or viewed them.

### Decision 6.4: Removed Content and Deactivated Actors
* **Tombstone Policy in Inbox:**
  * **Deleted Posts:** When a target post has `deletedAt !== null`, the notification preserves its reference, but the post payload is rendered as a tombstone: `text: '[This post was deleted by author]'`, `isDeleted: true`.
  * **Deactivated Actors:** When the actor has `deactivatedAt !== null`, the actor object is rendered as `[Deactivated user]` to respect privacy and deactivation semantics.

---

## 3. Database Constraints Summary

```sql
CONSTRAINT uq_notifications_source_event UNIQUE (source_event_id);
CONSTRAINT ck_notifications_no_self_notification CHECK (recipient_id <> actor_id);
CONSTRAINT ck_notifications_valid_type CHECK (event_type IN ('like', 'reply', 'repost', 'follow'));
CONSTRAINT ck_notifications_post_target CHECK (
    (event_type IN ('like', 'reply', 'repost') AND post_id IS NOT NULL) OR
    (event_type = 'follow' AND post_id IS NULL)
);
```

---

## 4. Verification & Checkpoints

1. **Transactional Rollback Test:** If source write or transaction aborts, 0 notification rows persist.
2. **10x Concurrent Like Retry:** Exactly 1 notification created.
3. **IDOR Test:** Accessing or marking read another user's notification returns `403 Forbidden` / `404 Not Found`.
4. **Self-Action Check:** Author liking, replying, or reposting own post produces 0 notifications.
