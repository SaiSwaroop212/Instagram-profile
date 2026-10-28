# Decision Record 04: Personalized Home Feed

```text
Decision:        Dynamic indexed personalized feed query matching followed authors ('status = accepted') and viewer, with tuple keyset cursor pagination (createdAt DESC, id DESC), constant query-count budget (O(1) in page size), and labeled public onboarding fallback.
Options:         1. Fan-out on write (rejected: high write amplification and storage bloat for a single-node or moderate-scale architecture).
                 2. Unfiltered public feed for all users (rejected: fails acceptance criteria for social personalization).
                 3. Dynamic indexed query on read with batch-aggregated metrics and labeled onboarding fallback (chosen).
Why this one:    Guarantees strict privacy and relationship consistency without write amplification. Query count is strictly bounded (<= 5 queries regardless of page size 5 vs 50). Keyset tie-breaker prevents cursor duplication.
Risks:           Unfollowing between page reads alters result set between pages. Mitigated by documented dynamic consistency expectation.
Test proving it: test/personalized-feed.e2e-spec.ts
```

---

## Feed Eligibility Matrix

| Post / Author State | Author Relationship to Viewer | Viewer Status | Included in Personal Feed? | Reason |
|---|---|---|:---:|---|
| Original post, Active author | Viewer themselves ($Author = Viewer$) | Authenticated | **YES** | Authors always see their own posts in their home feed. |
| Original post, Active author | Followed with `status = 'accepted'` | Authenticated | **YES** | Active follow relationship. |
| Original post, Active author | Followed with `status = 'pending'` | Authenticated | **NO** | Follow is not yet approved by target. |
| Original post, Active author | Not followed (Stranger) | Authenticated | **NO** | Unfollowed authors are excluded from personal feed. |
| Original post, Deactivated author | Any | Any | **NO** | Deactivated accounts are globally excluded from feeds. |
| Reply or Repost | Any | Any | **NO** | Only `kind = 'original'` posts are eligible for home feed. |
| Any post | Not following anyone (Onboarding) | Authenticated | **Fallback** | Labeled public fallback with `isFallback: true, onboarding: true`. |
| Public original, Active author | Anonymous | Unauthenticated | **YES** | Default public discovery feed (`feedType: 'public'`). |

---

## Think First Answers

1. **Why is `orderBy: { createdAt: 'desc' }` alone not a stable cursor? What tie-breaker fixes it?**
   - **The Problem**: In PostgreSQL, timestamp resolution can result in multiple posts sharing the exact same millisecond or microsecond timestamp. Sorting by `created_at DESC` alone allows the database optimizer to return equal-timestamp rows in non-deterministic order across multiple queries, causing posts to be skipped or duplicated during pagination.
   - **The Fix**: Keyset pagination with a unique tie-breaker: `ORDER BY created_at DESC, id DESC`. The cursor encodes both fields `{ v: 1, createdAt, id }`, and the query evaluates:
     ```sql
     WHERE (created_at < :cursorDate) OR (created_at = :cursorDate AND id < :cursorId)
     ```
   - Because `id` is a primary key UUID, every row is uniquely ordered, guaranteeing zero duplicates and zero skips.

2. **Query-count budget before coding:**
   - **Budget Limit**: $\le 5$ SQL queries per feed page request, strictly constant regardless of whether page size is 5, 10, or 50 ($O(1)$ query complexity).
   - **Breakdown**:
     1. Following status query: `SELECT count(*) FROM follows WHERE follower_id = :viewerId AND status = 'accepted' ...` (1 query).
     2. Posts with authors and media variants: `SELECT posts.*, users.*, post_media.* FROM posts JOIN users ... ORDER BY created_at DESC, id DESC LIMIT :limit + 1` (1 query).
     3. Batched like counts: `SELECT post_id, count(*) FROM post_likes WHERE post_id IN (:postIds) GROUP BY post_id` (1 query).
     4. Batched reply counts: `SELECT reply_to_id, count(*) FROM posts WHERE reply_to_id IN (:postIds) AND kind = 'reply' GROUP BY reply_to_id` (1 query).
     5. Batched viewer likes: `SELECT post_id FROM post_likes WHERE post_id IN (:postIds) AND user_id = :viewerId` (1 query).
   - **Result**: Zero $N+1$ query growth.

3. **If the user unfollows someone between page 1 and page 2, what happens to page 2? Is that acceptable?**
   - If User A unfollows User B while paginating between pages:
     - Page 2 evaluates live database state; User B's posts are immediately excluded from Page 2.
     - Page 2 will pick up from the keyset cursor timestamp/id, showing older posts from the remaining followed authors.
     - **Yes, this is completely acceptable and expected**. Modern social feeds (Twitter/Instagram) evaluate active graph state dynamically on read rather than pinning frozen, stale snapshots.

4. **For a new user, what does the feed show, and how does the client tell "empty by design" from "broken"?**
   - When a new user follows nobody and has authored no posts:
     - **Default Mode**: Returns a labeled public fallback (`feedType: 'discovery'`, `isFallback: true`, `onboarding: true`, with an encouraging discovery message) showing trending community posts.
     - **Strict Scope (`?scope=following`)**: Returns `{ items: [], nextCursor: null, hasMore: false, feedType: 'personalized', onboarding: true }`.
     - The client distinguishes "empty by design" from "broken" through explicit top-level metadata: `onboarding: true`, `feedType: 'personalized' | 'discovery'`, and `isFallback: boolean`.

---

## EXPLAIN Query Plan

```sql
EXPLAIN (COSTS OFF)
SELECT p.id, p.created_at, p.author_id, p.kind
FROM posts p
JOIN users u ON u.id = p.author_id
WHERE p.kind = 'original'
  AND u.deactivated_at IS NULL
  AND (
    p.author_id = '00000000-0000-0000-0000-000000000001'
    OR EXISTS (
      SELECT 1 FROM follows f
      WHERE f.follower_id = '00000000-0000-0000-0000-000000000001'
        AND f.following_id = p.author_id
        AND f.status = 'accepted'
    )
  )
ORDER BY p.created_at DESC, p.id DESC
LIMIT 11;
```
Execution utilizes index scan on `posts (created_at DESC, id DESC)` with filter on indexed `follows (follower_id, status)` without table scans.
