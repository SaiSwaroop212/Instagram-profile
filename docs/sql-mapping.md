# SQL to Prisma Repository Mapping (Stage C — PRD 04)

**Stage:** C — Database Integration  
**Backend:** NestJS 12 + Prisma 6 + PostgreSQL 17  
**Artifact Path:** `docs/sql-mapping.md`  

---

## 1. Ten SQL Use Cases Mapping

This document maps each of the ten relational modeling queries defined in Stage B ([`db/queries.sql`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/db/queries.sql)) to its corresponding NestJS repository method, Prisma query strategy, and API wire response field.

| # | Modeling Use Case | Repository Method | Prisma Operation & Query Strategy | Response Wire Field / DTO |
|---|---|---|---|---|
| **1** | **Home Feed** (Newest originals, `limit+1`, cursor tie-break) | `FeedRepository.getFeed(limit, cursor, viewerId)` | `prisma.post.findMany` with `where: { kind: 'original', OR: [lt(cursor_at), eq(cursor_at) + lt(cursor_id)] }`, `take: limit+1`, ordered by `(createdAt DESC, id DESC)`. Batch metrics via `fetchBatchMetrics()`. | `GET /feed` ➔ `{ items: PostItemDto[], nextCursor: string \| null, hasMore: boolean }` |
| **2** | **Post Detail** (Single post, author, media, reaction totals) | `PostRepository.getPostById(postId, viewerId)` | `prisma.post.findUnique` with `include: { author: true, media: true, repostOf: true }` + concurrent `prisma.postLike.count`, `prisma.post.count` (replies), and viewer like check. | `GET /posts/:id` ➔ `{ item: PostItemDto }` |
| **3** | **Direct Replies** (Direct replies to an original, stable descending order) | `ReplyRepository.getRepliesByPostId(postId, limit, cursor, viewerId)` | Verifies parent post exists, then `prisma.post.findMany` with `where: { replyToId: postId, kind: 'reply' }`, keyset cursor, and batch metrics. | `GET /posts/:id/replies` ➔ `{ items: PostItemDto[], nextCursor, hasMore }` |
| **4** | **Profile Media** (User images stream, dimensions, alt text, variants) | `MediaRepository.getMediaByUserId(userId, limit, cursor)` | `prisma.postMedia.findMany` with `where: { post: { authorId: user.id, kind: 'original' } }`, ordered by `(createdAt DESC, id DESC)`, `take: limit+1`. | `GET /users/:id/media` ➔ `{ items: ProfileMediaItemDto[], nextCursor, hasMore }` |
| **5** | **Profile Statistics** (Originals, followers, following, zero values) | `UserRepository.getUserById(idOrHandle)` | Concurrent counts: `prisma.post.count(where: { authorId, kind: 'original' })`, `prisma.follow.count(followingId)`, and `prisma.follow.count(followerId)`. Zero-safe. | `GET /users/:id` ➔ `{ item: UserProfileDto }` |
| **6** | **Like Totals** (Counts for batch of feed post IDs) | `fetchBatchMetrics()` in `batch-metrics.util.ts` | `prisma.postLike.groupBy({ by: ['postId'], where: { postId: { in: postIds } }, _count: { postId: true } })`. Single query for batch. | Embedded inside `likeCount` of each `PostItemDto`. |
| **7** | **Viewer State** (Posts liked by viewer without N+1 loops) | `fetchBatchMetrics()` in `batch-metrics.util.ts` | `prisma.postLike.findMany({ where: { postId: { in: postIds }, userId: viewerId }, select: { postId: true } })`. Single query for batch. | Embedded inside `likedByViewer: boolean` of each `PostItemDto`. |
| **8** | **Following Feed** (Originals by followed authors) | `FeedRepository` extension / graph query | Query posts where `authorId IN (SELECT following_id FROM follows WHERE follower_id = viewerId) AND kind = 'original'`. | Optional following timeline endpoint. |
| **9** | **Search** (Case-insensitive literal match with escaped `%`, `_`) | `SearchRepository.searchOriginals(query, limit, cursor, viewerId)` | `prisma.post.findMany` with `where: { kind: 'original', text: { contains: trimmed, mode: 'insensitive' } }` + keyset cursor + batch metrics. | `GET /search/posts?q=...` ➔ `{ items: PostItemDto[], nextCursor, hasMore }` |
| **10**| **Repost Lookup** (List user's reposts without duplicate text) | `PostRepository.createPost` & repost lookups | `prisma.post.findMany` with `where: { authorId: userId, kind: 'repost' }`, `include: { repostOf: { include: { author: true } } }`. Original text comes from reference. | `GET /posts/:id` ➔ includes `referencedPost: { id, text, author }`. |

---

## 2. Stage C Mentor Review Technical Defense Q&A

### Question 1: Which rule is guaranteed by a compound unique constraint?
**Answer:**
A compound unique constraint guarantees that **no two rows can ever have the exact same combination of values across the specified columns**.
In our schema:
- `@@id([postId, userId])` on `post_likes`: Guarantees that a user can like a given post at most once. Concurrent insert attempts are serialized at the B-tree leaf page and rejected with code `23505 (P2002 in Prisma)`.
- `@@unique([authorId, repostOfId])` on `posts`: Guarantees that a user cannot repost the same original post more than once.
- `@@unique([postId, position])` on `post_media`: Guarantees that two images cannot claim the same slot index within a post.

### Question 2: Why can Prisma's `include` still create a row-multiplication problem?
**Answer:**
When an ORM generates SQL queries for nested relations (e.g. `include: { likes: true, replies: true, media: true }`), naïve execution produces a relational Cartesian product ($M_{\text{likes}} \times N_{\text{replies}} \times K_{\text{media}}$ intermediate rows). If counts are derived by taking `.length` on loaded child arrays, intermediate memory bloats exponentially.
**Our Solution in Stage C:**
We strictly avoid loading nested association collections into memory. Instead, we use `prisma.postLike.groupBy` and `prisma.post.groupBy` to execute dedicated aggregation queries in the database engine, returning exact scalar integers without Cartesian multiplication.

### Question 3: Why does cursor pagination need two ordering fields?
**Answer:**
In a high-throughput feed, multiple posts can share the exact same timestamp (down to the millisecond). In our seed data, Post 22 and Post 23 share `2026-09-01T13:40:00.000Z`.
If pagination only filtered by `WHERE created_at < cursor_timestamp`, Post 22 would be skipped if Post 23 was the last item on Page 1.
If pagination filtered by `WHERE created_at <= cursor_timestamp`, Post 23 would be repeated on Page 2.
By ordering and filtering on the composite tuple `(createdAt DESC, id DESC)`, the unique UUID acts as a deterministic tie-breaker, guaranteeing zero skips and zero duplicates across page boundaries.

### Question 4: Where does the transaction begin and end?
**Answer:**
In Prisma, transactions are executed using `prisma.$transaction(async (tx) => { ... })`:
- **Begins:** When the lambda callback is invoked, Prisma acquires a connection from the pool and issues `BEGIN`.
- **Scope:** All database calls inside the callback must use `tx` (e.g. `tx.post.findUnique()`, `tx.post.create()`).
- **Ends (Commit):** When the callback function returns successfully, Prisma issues `COMMIT`.
- **Ends (Rollback):** If any error or exception is thrown inside the callback (e.g., target post not found or unique violation), Prisma automatically issues `ROLLBACK` and releases the connection back to the pool.

### Question 5: What happens if the browser retries after a network timeout?
**Answer:**
If the browser submits a `POST /posts/:id/like` and times out before receiving the HTTP response, it retries:
1. Because we implement a **desired-state endpoint** (`POST` = set liked, `DELETE` = set unliked), the retry executes an idempotent operation.
2. If the first request succeeded in writing to the database, the second request encounters the primary key in `post_likes`. The unique constraint catches the collision, skips the insert, and returns `{ postId, likedByViewer: true, likeCount: N }`.
3. If an increment endpoint were used instead (`likeCount++`), the retry would have incremented the count twice! Our desired-state model completely prevents double-like corruption.

### Question 6: Why does an ORM not remove the need to inspect SQL?
**Answer:**
An ORM is a high-level abstraction layer that generates SQL queries on the developer's behalf. It does not replace the relational engine:
1. **N+1 Inefficiencies:** Simple loops calling `post.likes()` produce $N$ separate round trips to the database unless batch grouping is explicitly designed.
2. **Hidden Index Misses:** An ORM query like `findMany({ where: { text: { contains: query } } })` might produce a full table sequential scan unless proper B-tree or GIN indexes are verified via `EXPLAIN (ANALYZE, BUFFERS)`.
3. **Locking & Deadlocks:** ORMs abstract transaction boundaries, but concurrent updates can produce deadlocks unless row-locking order and isolation levels are understood at the SQL level.
