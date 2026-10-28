# Decision Record 05: Owned-Content Lifecycle

```text
Decision:        Author-only post editing with optimistic concurrency control (OCC via version column) and tombstone/soft-delete lifecycle with conversation preservation.
Options:         1. Hard cascading delete (rejected: PostgreSQL ON DELETE RESTRICT on reply_to_id blocks deletion and would orphan or wipe whole reply subtrees).
                 2. Unrestricted last-write-wins editing (rejected: silent overwrite / lost-update anomaly when editing from multiple tabs/devices).
                 3. Soft-delete with conversation tombstone and optimistic concurrency control (chosen).
Why this one:    Guarantees that authors retain strict control over their content, historical conversations are never broken by parent post deletion, and concurrent multi-device edits fail safely with 409 Conflict.
Risks:           Tombstone posts may leak author details if not sanitized. Mitigated by explicit deleted post redaction.
Test proving it: test/content-lifecycle.e2e-spec.ts
```

---

## 9-Surface Deletion Impact Matrix

| Surface | Behavior When Post is Deleted | HTTP / Response Impact |
|---|---|---|
| **1. Direct Detail (`GET /posts/:id`)** | If standalone: returns `404 Not Found`. If referenced by replies: returns tombstone (`text: "[This post was deleted by author]"`, `isDeleted: true`). | 404 Not Found / 200 Tombstone |
| **2. Global & Home Feed (`GET /feed`)** | Excluded from both personalized and public feeds via `where: { deletedAt: null }`. | Post disappears immediately from feed. |
| **3. Search (`GET /search/posts`)** | Excluded from search indexing via `where: { deletedAt: null }`. | Zero search hits for deleted text. |
| **4. Replies (`GET /posts/:id/replies`)** | Existing child replies remain readable and preserved. Attempting to create a *new* reply to a deleted post is rejected. | 200 OK for reading existing; 400 Bad Request for creating new. |
| **5. Reposts** | New reposts of deleted content are rejected with `400 Bad Request`. Existing reposts in feeds are omitted. | 400 Bad Request for new repost. |
| **6. Reactions / Likes (`POST /posts/:id/like`)** | Liking or reacting to a deleted post is prohibited. | 404 Not Found. |
| **7. Media Feed (`GET /users/:id/media`)** | Images attached to deleted posts are excluded from the profile media stream. | Omitted from `items` array. |
| **8. Profile Counts (`postCount` on `/users/:id`)** | Derived `postCount` counts only active, non-deleted originals (`deletedAt: null`). | Immediately decrements by 1. |
| **9. Notifications** | Notifications targeting deleted content indicate deleted status or are omitted from active previews. | Stable tombstone reference without crashes. |

---

## Think First Answers

1. **Make a table: for each of the 9 surfaces above, what happens when a post is deleted?**
   - Documented in the 9-Surface Deletion Impact Matrix above.
2. **A reply points to a deleted original. What does the reader see? Better or worse than deleting replies too?**
   - The reader sees the original post marked as a tombstone (`[This post was deleted by author]`), with the subsequent conversation replies fully preserved.
   - This is substantially better than deleting replies because:
     - Other users invested effort and thought into writing replies. Deleting other users' content without their consent is destructive.
     - Hard deleting replies breaks conversational continuity and violates database relational integrity (`ON DELETE RESTRICT`).
3. **Author edits on phone and laptop at once. How does the second save learn it was stale?**
   - Through **Optimistic Concurrency Control (OCC)** using a monotonically increasing `version` integer column.
   - When the phone fetches post `version: 1`, and the laptop fetches post `version: 1`:
     - Phone submits update with `expectedVersion: 1`. Server matches `where: { id, version: 1 }`, increments `version` to `2`, and commits.
     - Laptop submits update with `expectedVersion: 1`. Server query finds 0 matching rows (`version` is now 2).
     - The server rejects the laptop's update with **`409 Conflict`** (`"Edit conflict: post was modified by another session"`), preventing silent data loss.
4. **Is delete a state change or a row removal? What does each imply for counts?**
   - **Delete is a state change** (`deleted_at = NOW()`).
   - Row removal (hard delete) would violate PostgreSQL foreign key constraints on `reply_to_id` (`fk_posts_reply_target ON DELETE RESTRICT`).
   - For derived counts (`postCount`), queries filter `where: { kind: 'original', deletedAt: null }`, ensuring deleted posts immediately stop counting towards public totals.

---

## Guaranteed Policy Invariant

> **"An author may update text or remove their post at any time, but cannot mutate post identity, kind, or ownership, nor can post removal break downstream reply conversations or silently overwrite concurrent edits."**
