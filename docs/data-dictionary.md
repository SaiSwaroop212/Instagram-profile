# Social-Feed Database Data Dictionary

**Stage:** B — Relational Modeling and SQL  
**Database:** PostgreSQL 17  
**Artifact Path:** `docs/data-dictionary.md`

---

## 1. Architectural Type Decisions

### 1.1 Public Identifiers: UUID v4
- **Type**: `UUID` (128-bit RFC 4122 v4).
- **Default Generator**: `gen_random_uuid()` (built-in to PostgreSQL).
- **Rationale**: Sequential auto-increment integers (`SERIAL`/`BIGSERIAL`) leak internal dataset velocity, expose scrapable enumeration endpoints, and introduce collision risks during distributed sharding or client-generated optimistic IDs. UUIDs provide global uniqueness and opaque public identifiers across REST APIs.

### 1.2 Millisecond-Precision Timestamps: `TIMESTAMPTZ(3)`
- **Type**: `TIMESTAMPTZ(3)` (timestamp with time zone, truncated to 3 fractional decimal places / milliseconds).
- **Rationale**: Web clients transmit ISO 8601 strings with millisecond resolution (e.g. `2026-09-01T10:00:00.000Z`). Default microsecond precision (`TIMESTAMPTZ(6)`) causes subtle pagination bugs where microsecond truncations in client JSON serializations fail exact tuple comparisons. Storing fixed millisecond precision ensures perfect parity between API wire payloads and database indices.

### 1.3 Unicode Code Points & Text Types
- **Post Texts**: `VARCHAR(280)` constrained with `CHECK (char_length(trim(text)) BETWEEN 1 AND 280)`.
- **URLs and Bios**: `TEXT` constrained with explicit nonempty trim checks.
- **Rationale**: `char_length()` in PostgreSQL counts Unicode code points (characters), not raw byte lengths. This guarantees that multi-byte UTF-8 characters (emojis, accented characters, Asian scripts) consume exactly one character toward the 280 limit.

### 1.4 Association Tables: Natural Composite Keys vs Surrogate IDs
- **Tables**: `post_likes (post_id, user_id)` and `follows (follower_id, following_id)`.
- **Policy**: Pure composite primary keys without synthetic surrogate IDs (`id UUID`).
- **Rationale**: An associative relationship is uniquely identified by the tuple of entities it connects. Introducing a surrogate `id UUID` on `post_likes` adds an unnecessary 16-byte column and forces a second index for `UNIQUE (post_id, user_id)`. A natural composite primary key enforces edge uniqueness directly on the primary B-tree, halving index write overhead and storage footprint.

---

## 2. Table Dictionaries

### 2.1 Table: `users`
Represents registered users, authors, and followers.

| Column Name | Logical Business Meaning | PostgreSQL Type | Nullable | Default | Key / Constraint | Example Value |
|---|---|---|---|---|---|---|
| `id` | Unique public user identifier | `UUID` | No | `gen_random_uuid()` | `PRIMARY KEY` | `a0000000-0000-4000-8000-000000000001` |
| `handle` | Normalized lowercase username | `VARCHAR(30)` | No | None | `UNIQUE`, `CHECK (handle = lower(handle) AND handle ~ '^[a-z0-9_]{1,30}$')` | `asha` |
| `display_name` | Public profile display name | `VARCHAR(50)` | No | None | `CHECK (char_length(trim(display_name)) BETWEEN 1 AND 50)` | `Asha Sharma` |
| `bio` | Author biographical text | `TEXT` | No | `''` | None | `Full-stack engineer building fast distributed systems.` |
| `avatar_small_url` | 48px avatar image path | `TEXT` | No | None | `CHECK (char_length(trim(avatar_small_url)) > 0)` | `/fixtures/asha-48.jpg` |
| `avatar_large_url` | 96px avatar image path | `TEXT` | No | None | `CHECK (char_length(trim(avatar_large_url)) > 0)` | `/fixtures/asha-96.jpg` |
| `created_at` | Registration UTC timestamp | `TIMESTAMPTZ(3)` | No | `clock_timestamp()` | None | `2026-09-01 08:00:00.000+00` |
| `updated_at` | Profile update timestamp | `TIMESTAMPTZ(3)` | No | `clock_timestamp()` | None | `2026-09-01 08:00:00.000+00` |

---

### 2.2 Table: `posts`
Unified relation representing originals, direct replies, and reposts.

| Column Name | Logical Business Meaning | PostgreSQL Type | Nullable | Default | Key / Constraint | Example Value |
|---|---|---|---|---|---|---|
| `id` | Unique public post identifier | `UUID` | No | `gen_random_uuid()` | `PRIMARY KEY`, `UNIQUE(id, kind)` | `b0000000-0000-4000-8000-000000000001` |
| `author_id` | User who authored or reposted | `UUID` | No | None | `FK -> users(id) ON DELETE RESTRICT` | `a0000000-0000-4000-8000-000000000001` |
| `kind` | Discriminator kind | `VARCHAR(10)` | No | None | `CHECK (kind IN ('original', 'reply', 'repost'))` | `original` |
| `text` | Post textual body | `VARCHAR(280)` | Yes | `NULL` | Required on original/reply (1-280 chars), forbidden on repost | `Welcome to our new PostgreSQL-backed social platform!` |
| `reply_to_id` | Target post for replies | `UUID` | Yes | `NULL` | `FK (reply_to_id, reply_target_kind) -> posts(id, kind)` | `b0000000-0000-4000-8000-000000000001` |
| `repost_of_id` | Target post for reposts | `UUID` | Yes | `NULL` | `FK (repost_of_id, repost_target_kind) -> posts(id, kind)` | `b0000000-0000-4000-8000-000000000002` |
| `reply_target_kind`| Target kind generated column | `VARCHAR(10)` | Yes | Generated | `STORED` ('original' when reply_to_id is not null) | `original` |
| `repost_target_kind`| Target kind generated column | `VARCHAR(10)`| Yes | Generated | `STORED` ('original' when repost_of_id is not null) | `original` |
| `created_at` | Creation UTC timestamp | `TIMESTAMPTZ(3)` | No | `clock_timestamp()` | Indexed for feed ordering | `2026-09-01 10:00:00.000+00` |
| `updated_at` | Last edit UTC timestamp | `TIMESTAMPTZ(3)` | No | `clock_timestamp()` | None | `2026-09-01 10:00:00.000+00` |

---

### 2.3 Table: `post_media`
Images attached to original posts (0 to 4 per post).

| Column Name | Logical Business Meaning | PostgreSQL Type | Nullable | Default | Key / Constraint | Example Value |
|---|---|---|---|---|---|---|
| `id` | Unique media item identifier | `UUID` | No | `gen_random_uuid()` | `PRIMARY KEY` | `e0000000-0000-4000-8000-000000000001` |
| `post_id` | Target original post ID | `UUID` | No | None | `FK (post_id, media_target_kind) -> posts(id, kind) ON DELETE CASCADE` | `b0000000-0000-4000-8000-000000000001` |
| `media_target_kind`| Generated target kind | `VARCHAR(10)` | No | Generated | `STORED` ('original') | `original` |
| `position` | Display order (0..3) | `SMALLINT` | No | None | `CHECK (position BETWEEN 0 AND 3)`, `UNIQUE(post_id, position)` | `0` |
| `alt_text` | Accessibility image description | `TEXT` | No | None | `CHECK (char_length(trim(alt_text)) > 0)` | `PostgreSQL relational schema diagram` |
| `width` | Original width in pixels | `INTEGER` | No | None | `CHECK (width > 0)` | `1200` |
| `height` | Original height in pixels | `INTEGER` | No | None | `CHECK (height > 0)` | `800` |
| `small_url` | Responsive small variant URL | `TEXT` | No | None | `CHECK (char_length(trim(small_url)) > 0)` | `/fixtures/schema-480.jpg` |
| `large_url` | High-resolution variant URL | `TEXT` | No | None | `CHECK (char_length(trim(large_url)) > 0)` | `/fixtures/schema-1200.jpg` |
| `created_at` | Upload UTC timestamp | `TIMESTAMPTZ(3)` | No | `clock_timestamp()` | Indexed for profile media stream | `2026-09-01 10:00:00.000+00` |

---

### 2.4 Table: `post_likes`
Associative table linking users to posts they have liked.

| Column Name | Logical Business Meaning | PostgreSQL Type | Nullable | Default | Key / Constraint | Example Value |
|---|---|---|---|---|---|---|
| `post_id` | Target post being liked | `UUID` | No | None | `PRIMARY KEY (post_id, user_id)`, `FK -> posts(id) ON DELETE CASCADE` | `b0000000-0000-4000-8000-000000000001` |
| `user_id` | User who cast the like | `UUID` | No | None | `PRIMARY KEY (post_id, user_id)`, `FK -> users(id) ON DELETE CASCADE` | `a0000000-0000-4000-8000-000000000002` |
| `created_at` | Interaction UTC timestamp | `TIMESTAMPTZ(3)` | No | `clock_timestamp()` | None | `2026-09-01 10:02:00.000+00` |

---

### 2.5 Table: `follows`
Directed social graph connection between two users.

| Column Name | Logical Business Meaning | PostgreSQL Type | Nullable | Default | Key / Constraint | Example Value |
|---|---|---|---|---|---|---|
| `follower_id` | Acting user following another | `UUID` | No | None | `PRIMARY KEY (follower_id, following_id)`, `FK -> users(id) ON DELETE CASCADE` | `a0000000-0000-4000-8000-000000000001` |
| `following_id`| User being followed | `UUID` | No | None | `PRIMARY KEY (follower_id, following_id)`, `FK -> users(id) ON DELETE CASCADE`, `CHECK (follower_id <> following_id)` | `a0000000-0000-4000-8000-000000000002` |
| `created_at` | Follow UTC timestamp | `TIMESTAMPTZ(3)` | No | `clock_timestamp()` | None | `2026-09-01 08:35:00.000+00` |

---

### 2.6 Table: `notifications` (Extension)
Event ledger of notifications delivered to users.

| Column Name | Logical Business Meaning | PostgreSQL Type | Nullable | Default | Key / Constraint | Example Value |
|---|---|---|---|---|---|---|
| `id` | Unique notification identifier | `UUID` | No | `gen_random_uuid()` | `PRIMARY KEY` | `f0000000-0000-4000-8000-000000000001` |
| `recipient_id`| User receiving notification | `UUID` | No | None | `FK -> users(id) ON DELETE CASCADE`, `CHECK (recipient_id <> actor_id)` | `a0000000-0000-4000-8000-000000000001` |
| `actor_id` | User who initiated action | `UUID` | No | None | `FK -> users(id) ON DELETE CASCADE` | `a0000000-0000-4000-8000-000000000002` |
| `event_type` | Kind of action | `VARCHAR(20)` | No | None | `CHECK (event_type IN ('like', 'reply', 'repost', 'follow'))` | `like` |
| `post_id` | Related post (if applicable) | `UUID` | Yes | `NULL` | `FK -> posts(id) ON DELETE CASCADE` (required for like/reply/repost, null for follow) | `b0000000-0000-4000-8000-000000000001` |
| `source_event_id`| Deterministic idempotency key | `TEXT` | No | None | `UNIQUE` | `like:b0000000...:a0000000...` |
| `read_at` | Timestamp marked read | `TIMESTAMPTZ(3)` | Yes | `NULL` | Indexed (where read_at is null) | `NULL` |
| `created_at` | Event creation timestamp | `TIMESTAMPTZ(3)` | No | `clock_timestamp()` | None | `2026-09-01 10:02:00.000+00` |
