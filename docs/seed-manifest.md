# Seed Manifest & Data Verification

**Stage:** B — Relational Modeling and SQL  
**Database:** PostgreSQL 17  
**Artifact Path:** `docs/seed-manifest.md`  
**Associated SQL Script:** [`db/manifest.sql`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/db/manifest.sql)

---

## 1. Summary Entity Counts

The deterministic seed script ([`db/seed.sql`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/db/seed.sql)) populates a reproducible, fixed-timestamp dataset that satisfies and exceeds all PRD 03 requirements:

| Entity / Concept | Required Minimum | Seeded Count | Status | Notes |
|---|---|---|---|---|
| **Users** | 6 | **6** | Met | Handles: `asha`, `dan_dev`, `elena_r`, `marcus_ui`, `sara_travel`, `ghost_user` |
| **Original Posts** | 30 | **32** | Exceeded | Includes 2 posts with identical timestamps for boundary testing (`b...0022` & `b...0023`) |
| **Direct Replies** | 12 | **15** | Exceeded | Replies targeted strictly to original posts |
| **Reposts** | 4 | **4** | Met | Reposts with zero text, zero media, distinct authors |
| **Total Posts** | 46 | **51** | Exceeded | Unified `posts` table containing originals, replies, reposts |
| **Post Media** | 10 | **10** | Met | Positions 0..3 with alt text, positive dimensions, and responsive variants |
| **Post Likes** | 15 | **17** | Exceeded | Distinct `(post_id, user_id)` tuples |
| **Follow Edges** | 8 | **8** | Met | Directed edges without self-follows |
| **Notifications** (Ext) | - | **5** | Included | Likes, replies, reposts, follow events with idempotency keys |

---

## 2. Sample Entity Identifiers & Relationships

### 2.1 Users

| User ID | Handle | Display Name | Bio Summary | Roles / Characteristics |
|---|---|---|---|---|
| `a0000000-0000-4000-8000-000000000001` | `asha` | Asha Sharma | Distributed systems engineer | Primary demo author; 6 originals, 2 followers, follows 2 |
| `a0000000-0000-4000-8000-000000000002` | `dan_dev` | Dan Miller | Backend & Postgres specialist | Frequent commenter; authors Post 2 |
| `a0000000-0000-4000-8000-000000000003` | `elena_r` | Elena Rostova | Landscape photographer | Author of multiple multi-image original posts |
| `a0000000-0000-4000-8000-000000000004` | `marcus_ui` | Marcus Chen | Design systems & UI engineer | High engagement reposter |
| `a0000000-0000-4000-8000-000000000005` | `sara_travel` | Sara Lindqvist | Travel writer & explorer | Travel photo posts with alt text |
| `a0000000-0000-4000-8000-000000000006` | `ghost_user` | Ghost Walker | Silent observer | **Edge Case**: 0 posts, 0 media, 0 followers, 0 following |

---

## 3. Targeted Verification Edge Cases

### 3.1 Timestamp Tie & Keyset Cursor Boundary
- **Posts**:
  - `b0000000-0000-4000-8000-000000000023` (Post 23)
  - `b0000000-0000-4000-8000-000000000022` (Post 22)
- **Shared Timestamp**: `2026-09-01T13:40:00.000Z`
- **Purpose**: Arranged across the 10-item page boundary. Demonstrates that pagination using `(created_at, id) < ($cursor_created_at, $cursor_id)` returns Post 23 on Page 1 and immediately continues to Post 22 on Page 2 with zero duplicates and zero skipped records.

### 3.2 Post Reaction Statistics Check
- **Target Post**: Post 1 (`b0000000-0000-4000-8000-000000000001`)
  - **Kind**: `original`
  - **Author**: `asha` (`a...0001`)
  - **Likes**: **4** (`dan_dev`, `elena_r`, `marcus_ui`, `sara_travel`)
  - **Replies**: **3** (`c...0001`, `c...0002`, `c...0003`)
  - **Reposts**: **1** (`d...0001` by `marcus_ui`)
  - **Media Count**: **2** images (positions 0 and 1)
- **Target Post (Zero Reactions)**: Post 30 (`b0000000-0000-4000-8000-000000000030`)
  - **Likes**: **0**
  - **Replies**: **0**
  - Demonstrates that `LEFT JOIN` / scalar subquery counts return scalar `0`, not `NULL` or missing records.

### 3.3 User Profile Statistics Check
- **Target User**: Asha (`a0000000-0000-4000-8000-000000000001`)
  - **Original Posts**: **6**
  - **Followers**: **2** (`dan_dev`, `sara_travel`)
  - **Following**: **2** (`dan_dev`, `elena_r`)
- **Target User (Zero Graph Edges)**: Ghost Walker (`ghost_user`, `a0000000-0000-4000-8000-000000000006`)
  - **Original Posts**: **0**
  - **Followers**: **0**
  - **Following**: **0**
  - **Media Attachments**: **0**

---

## 4. Querying the Manifest

To execute live SQL verification of this manifest against the database:

```bash
psql -h localhost -p 5433 -U postgres -d social_feed -f db/manifest.sql
```
