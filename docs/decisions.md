# Relational Design & Architectural Decisions

**Stage:** B — Relational Modeling and SQL  
**Database:** PostgreSQL 17  
**Artifact Path:** `docs/decisions.md`

---

## 1. Normalization Analysis (1NF, 2NF, 3NF)

Normalization is the systematic process of organizing relational tables to eliminate data redundancy, prevent update/delete anomalies, and ensure data integrity. Here is how our social-feed model strictly satisfies First, Second, and Third Normal Form:

### 1.1 First Normal Form (1NF)
> **Definition:** Each table has a primary key; each column contains atomic (indivisible) values; no repeating groups or comma-separated lists.

- **Non-Violations in this schema:**
  * Likes are **not** stored as a comma-separated array of user IDs on `posts` (e.g. `likes: "user1,user2,user3"`). Instead, each like is an atomic row in the normalized associative relation `post_likes (post_id, user_id)`.
  * Followers are **not** an array inside `users`. They are atomic rows in `follows (follower_id, following_id)`.
  * Media images are **not** JSON arrays or delimited URLs inside `posts`. Each image is an independent atomic row in `post_media` with dedicated scalar attributes (`width`, `height`, `alt_text`, `small_url`, `large_url`).
  * Every table has a clearly defined primary key (`id` or composite natural keys).

### 1.2 Second Normal Form (2NF)
> **Definition:** The table is in 1NF, and every non-key attribute is fully functionally dependent on the entire primary key (no partial key dependencies).

- **In Associative Tables:**
  * In `post_likes`, the primary key is composite: `(post_id, user_id)`. The only non-key column is `created_at`, which describes *when this exact user liked this exact post*. We do **not** store the post author's name, post text, or user handle in `post_likes`. Doing so would create a partial dependency (e.g. `post_title` depending only on `post_id`), which would require updating every like if the post text were edited.
  * In `follows`, the primary key is `(follower_id, following_id)`. `created_at` depends on the complete edge pair. No user profile attributes are duplicated here.

### 1.3 Third Normal Form (3NF)
> **Definition:** The table is in 2NF, and no non-key attribute is transitively dependent on the primary key (no transitive dependencies: X → Y → Z).

- **Non-Violations in this schema:**
  * In `posts`, we store `author_id` (a foreign key to `users(id)`). We do **not** duplicate `author_handle`, `author_display_name`, or `author_avatar_url` into the `posts` table. Storing author metadata on posts would establish a transitive dependency: `posts.id -> author_id -> author_handle`. If the user changed their handle, thousands of post rows would become inconsistent.
  * In `posts` for reposts, we reference `repost_of_id`. We do **not** duplicate the original's `text` or `created_at` on the repost row.
  * In `posts` and `users`, we do **not** store cached counters like `like_count`, `reply_count`, `follower_count`, or `post_count`. Storing counters introduces derived state that can silently disagree with the ground truth of child association rows upon rollbacks or uncoordinated concurrent writes. All counts are derived in real time via database aggregation or lateral joins.

---

## 2. Physical Modeling: Evaluated Alternatives & Final Selection

### Model A: Single-Table Inheritance with Discriminator (Selected Design)
All posts (originals, direct replies, and reposts) reside in a single `posts` relation, differentiated by `kind VARCHAR(10) IN ('original', 'reply', 'repost')`. Kind-specific invariants are enforced via table-level `CHECK` constraints, and target kind integrity is enforced via compound foreign keys.

- **Advantages:**
  1. **Unified Timeline Ordering & Keysets:** Fetching a mixed chronological feed (or user timeline with originals and reposts) is a single B-tree index scan on `posts (created_at DESC, id DESC)`. It requires zero `UNION ALL` subqueries.
  2. **Uniform Foreign Keys:** Likes, notifications, and media attach cleanly to a single entity key (`posts.id`). In a split schema, `post_likes` would either require polymorphic nullable foreign keys (`post_id`, `reply_id`, `repost_id`) or three separate like tables (`post_likes`, `reply_likes`, `repost_likes`).
  3. **Simpler Transaction Management:** Reposts and replies use identical row locks and ACID mechanics as originals.

### Model B: Multi-Table Class Table Inheritance (Alternative Considered)
Separate tables: `original_posts`, `replies` (referencing `original_posts.id`), and `reposts` (referencing `original_posts.id`).

- **Why Selected Model A Over Model B:**
  * **Query Complexity on Timelines:** In Model B, generating a user's combined profile timeline or mixed feed requires a `UNION ALL` across three tables:
    ```sql
    SELECT id, 'original' as kind, created_at FROM original_posts WHERE author_id = $1
    UNION ALL
    SELECT id, 'repost' as kind, created_at FROM reposts WHERE author_id = $1
    ORDER BY created_at DESC LIMIT 10;
    ```
    This forces PostgreSQL to query two separate B-trees, merge the result sets, and execute an expensive sort, breaking simple keyset cursor continuation.
  * **Associative Fragmentation:** A user can like an original or a reply. In Model B, you must either maintain `original_likes` and `reply_likes` (duplicating schema, indexes, and API handlers) or use an anti-pattern polymorphic association without database-enforced foreign keys.

---

## 3. Product Rules & Enforcement Location Matrix

| Rule | Enforcement Location | Implementation Details & Relational Mechanism |
|---|---|---|
| **Unique normalized user handle** | **Database Constraint** | `uq_users_handle UNIQUE (handle)` + `CHECK (handle = lower(handle) AND handle ~ '^[a-z0-9_]{1,30}$')`. Rejects uppercase and special characters at the engine level. |
| **Referential integrity (no orphans)** | **Database Foreign Keys** | `author_id REFERENCES users(id) ON DELETE RESTRICT`. All association rows (`post_likes`, `follows`, `post_media`) use strict foreign keys. |
| **One like per user per post** | **Database Constraint** | Natural composite primary key: `PRIMARY KEY (post_id, user_id)` on `post_likes`. Duplicate inserts fail with `unique_violation`. |
| **No duplicate follow or self-follow** | **Database Constraint** | `PRIMARY KEY (follower_id, following_id)` on `follows` + `CHECK (follower_id <> following_id)`. |
| **Original/reply text 1-280 code points** | **Database + App Validation** | Database check: `CHECK (char_length(trim(text)) BETWEEN 1 AND 280)` on `original` and `reply`. App validates before payload submission. |
| **Repost contains no text** | **Database Constraint** | `CHECK (kind <> 'repost' OR (text IS NULL AND reply_to_id IS NULL AND repost_of_id IS NOT NULL))`. |
| **One repost per user per original** | **Database Constraint** | Partial unique B-tree index: `CREATE UNIQUE INDEX uq_posts_user_repost ON posts (author_id, repost_of_id) WHERE kind = 'repost'`. |
| **Reply/repost target must be original** | **Database Compound FK** | `posts` has `UNIQUE (id, kind)`. Generated stored columns `reply_target_kind` / `repost_target_kind` enforce `FOREIGN KEY (reply_to_id, reply_target_kind) REFERENCES posts(id, kind)`. |
| **Media belongs only to original** | **Database Compound FK** | `post_media` uses stored column `media_target_kind = 'original'` and `FOREIGN KEY (post_id, media_target_kind) REFERENCES posts(id, kind)`. |
| **Maximum 4 images per post** | **Database + App Validation** | Database check: `position SMALLINT CHECK (position BETWEEN 0 AND 3)` + `UNIQUE (post_id, position)`. (Enforces max 4 positions 0,1,2,3). Sibling row count validated in create service. |
| **Media dimensions & variants nonempty** | **Database Constraint** | `CHECK (width > 0 AND height > 0 AND char_length(trim(alt_text)) > 0 AND char_length(trim(small_url)) > 0 AND char_length(trim(large_url)) > 0)`. |
| **Accurate reaction/follower counts** | **Database Query Aggregation** | Derived in real time from relational rows via SQL aggregates (`COUNT(*)`, `LEFT JOIN LATERAL`, grouped subqueries). No caller-supplied counters. |

---

## 4. Cross-Row Rules & Transactional Boundaries

### Why PostgreSQL `CHECK` Constraints Cannot Query Other Rows
PostgreSQL documentation explicitly states that `CHECK` constraints must be immutable functions of the **current row alone**. Attempting to execute subqueries inside a `CHECK` constraint (e.g. `CHECK ((SELECT count(*) FROM post_media WHERE post_id = ...) <= 4)`) is rejected by PostgreSQL parser.

Furthermore, even if user-defined functions were used inside check constraints, they violate ACID isolation during concurrent transactions: two simultaneous sessions inserting images for the same post would each see 3 existing rows, pass the check, and commit, resulting in 5 images!

### Enforcement Strategy Used:
1. **Target Kind Validation (Original Only):** Solved declaratively in DDL using **Compound Foreign Keys**. Because `posts` has `UNIQUE (id, kind)`, a child row with stored column `'original'` can reference `(target_id, 'original')`. PostgreSQL validates this foreign key during row insertion without triggers!
2. **Media Max 4 Images:** The database strictly bounds slot positions to `0, 1, 2, 3` with `UNIQUE (post_id, position)`. The application creates media attachments within a single atomic database transaction.

---

## 5. Foreign Key `ON DELETE` Policies

| Foreign Key | Referenced Table | Action | Architectural Rationale |
|---|---|---|---|
| `posts.author_id` | `users(id)` | `RESTRICT` | Prevents accidental deletion of users whose posts are still active. Deleting an active creator requires explicit archival or soft-deletion workflow. |
| `posts.reply_to_id` | `posts(id)` | `RESTRICT` | An original post that has active discussions cannot be silently deleted, which would break conversation context. |
| `posts.repost_of_id` | `posts(id)` | `RESTRICT` | Prevents deleting an original while reposts are referencing it. |
| `post_media.post_id` | `posts(id)` | `CASCADE` | Media items are subordinate parts of the post aggregate. If an original post is permitted to be deleted, its attached images must be deleted immediately. |
| `post_likes.post_id` | `posts(id)` | `CASCADE` | If a post is deleted, its likes have no independent meaning and are purged. |
| `post_likes.user_id` | `users(id)` | `CASCADE` | If a user is deleted, their likes are removed. |
| `follows.follower_id`| `users(id)` | `CASCADE` | Follow graph edges are wiped when either participating user is deleted. |
| `follows.following_id`| `users(id)`| `CASCADE` | Same as above. |
| `notifications.post_id`| `posts(id)`| `CASCADE` | Notifications referencing a deleted post are cleanly pruned. |
