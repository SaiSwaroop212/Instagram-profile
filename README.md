# Social Feed Application & Relational Database (PRD 03 & PRD 04)

This repository contains the complete full-stack social feed system:
1. **Stage A:** Responsive React + Vite web client.
2. **Stage B (PRD 03):** Relational modeling, PostgreSQL 17 DDL schema, deterministic seeding, automated constraint test suites, 10 SQL use cases, performance query plan analyses, ACID transaction proofs, and mentor defense documentation.
3. **Stage C (PRD 04):** NestJS database integration with Prisma ORM, versioned migrations, keyset cursor pagination, batch aggregations without N+1 loops, desired-state likes, unit and e2e integration test suites.

---

## Deliverables Directory

| Area | Workspace Location | Description |
|---|---|---|
| **SQL to Prisma Mapping** | [`docs/sql-mapping.md`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/docs/sql-mapping.md) | Maps all 10 SQL use cases to NestJS repository methods, query strategies, and response fields. Includes Stage C mentor review defense. |
| **Entity-Relationship Diagram** | [`docs/erd.md`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/docs/erd.md) | Mermaid diagram with cardinalities & optionalities for all entities and associations. |
| **Data Dictionary** | [`docs/data-dictionary.md`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/docs/data-dictionary.md) | Column types, constraints, UUID v4 policy, `TIMESTAMPTZ(3)` precision, and natural composite keys. |
| **Design Decisions & Normalization**| [`docs/decisions.md`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/docs/decisions.md) | 1NF–3NF proof, Single-Table vs. Class-Table inheritance trade-offs, cross-row check rules, and `ON DELETE` policies. |
| **Query Plan & Performance Report**| [`docs/query-plan-report.md`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/docs/query-plan-report.md)| `EXPLAIN (ANALYZE, BUFFERS)` execution plans on PostgreSQL 17 before and after candidate indexes. |
| **Stage B Mentor Review Q&A** | [`docs/mentor-qa.md`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/docs/mentor-qa.md) | In-depth technical defense of the 6 core mentor checkpoint questions. |
| **Seed Manifest & Verification** | [`docs/seed-manifest.md`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/docs/seed-manifest.md)| Manifest tables with expected entity counts, sample IDs, and edge case metrics. |
| **Prisma Schema & Migrations** | [`Backend/prisma/`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/Backend/prisma/) | Versioned migrations (`migrations/20260921_init/migration.sql`), `schema.prisma`, and `seed.ts`. |
| **Executable Schema DDL** | [`db/schema.sql`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/db/schema.sql) | PostgreSQL 17 DDL with compound foreign keys, table-level check constraints, and performance indexes. |
| **Deterministic Seed Script** | [`db/seed.sql`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/db/seed.sql) | Idempotent seed populating 7 users, 32 originals, 15 replies, 4 reposts, 12 media items, 18 likes, and 10 follows. |
| **Manifest SQL Script** | [`db/manifest.sql`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/db/manifest.sql) | SQL script verifying seeded counts and profile/reaction metrics. |
| **Constraint & Integrity Tests** | [`db/constraint-tests.sql`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/db/constraint-tests.sql)| 20+ automated PL/pgSQL negative & positive test assertions. |
| **Ten SQL Use Cases** | [`db/queries.sql`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/db/queries.sql) | Parameterized queries matching the API contract wire JSON shapes. |
| **Transaction & Concurrency Tests** | [`db/transaction-tests.sql`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/db/transaction-tests.sql)| Atomicity rollback proof and concurrent duplicate-like race condition verification. |

---

## Stage C Architecture & Implementation Highlights

1. **Clean Provider Pattern & Health Probes:**
   - Single application-owned `PrismaService` implementing `OnModuleInit` and `OnModuleDestroy` with graceful shutdown hooks.
   - `GET /health/live` returns server status without touching the database.
   - `GET /health/ready` executes a bounded `$queryRaw\`SELECT 1\`` check, returning 200 when ready or 503 `SERVICE_UNAVAILABLE` when the database is unreachable.
2. **Keyset Cursor Pagination (Zero Offset Skips):**
   - Opaque base64url JSON tuple cursor tokens `{ "v": 1, "createdAt": "...", "id": "..." }`.
   - Reads `limit + 1` to determine `hasMore` without `COUNT(*)`.
   - Transition across timestamp ties (`b...0023` and `b...0022` at `2026-09-01T13:40:00.000Z`) handled deterministically via `(createdAt, id)` tuple comparison.
3. **Zero N+1 Query Loops:**
   - Feed items load in a single query; likes and reply counts are aggregated in 2 batch grouped queries (`postLike.groupBy` and `post.groupBy`).
   - Viewer like states are resolved in a single batch set check (`postLike.findMany`).
4. **Idempotent Desired-State Likes:**
   - `setLike(postId, viewerId, desiredState)`:
     - `true`: Inserts like; duplicate insert caught by `P2002` (unique constraint) and ignored idempotently.
     - `false`: Deletes like if present.
   - Eliminates toggle surprises during client retries.
5. **Transactional Domain Constraints:**
   - Original/reply/repost creation validated in `$transaction`. Target existence and `kind === 'original'` checks enforce conversation hierarchies. Duplicate reposts map to 409 Conflict.

---

## Quickstart & Verification Instructions

### 1. Database Setup & Master Stage B Suite
To run the isolated PostgreSQL 17 cluster and execute all DDL, seeds, constraints, and SQL tests:

```powershell
& ".\scripts\run_all.ps1"
```

### 2. Backend Server & Stage C Tests
Navigate to the `Backend` directory:

```bash
cd Backend

# Install dependencies (if not already installed)
npm install

# Run Prisma database seed (idempotent)
npm run db:seed

# Run Unit & Integration tests (Vitest)
npm test

# Run End-to-End API tests (Supertest against live DB)
npm run test:e2e

# Start development server
npm run start:dev
```

### 3. Frontend Client
From the repository root:

```bash
npm install
npm run dev
```

---

## Acceptance Verification Summary

### Stage C Acceptance Matrix (PRD 04)

| Acceptance Test | Requirement | Status | Verification Evidence |
|---|---|---|---|
| **Versioned Migrations** | JS-D02 | **PASSED** | `20260921_init/migration.sql` cleanly committed and applied. |
| **Idempotent Seed** | JS-D09 | **PASSED** | `npm run db:seed` run multiple times without duplicating rows. |
| **Keyset Cursor Across Ties** | JS-D05 | **PASSED** | Page 1 to Page 2 pagination across timestamp tie produces 0 duplicates and 0 skips. |
| **Batch Counts & Viewer State** | JS-D08 | **PASSED** | Likes, replies, and viewer states fetched in 3 batch queries without N+1 loops. |
| **Invalid Target Handling** | JS-D06 | **PASSED** | Missing post returns 404; replying to a reply returns 422. |
| **Duplicate Repost Prevention**| JS-D06 | **PASSED** | Re-reposting same original throws 409 Conflict. |
| **Concurrent Duplicate Likes** | JS-D06 | **PASSED** | Concurrent requests resolve to 1 row with coherent state. |
| **Repeated Desired-State Likes**| JS-D06 | **PASSED** | Repeated like/unlike requests return idempotent desired state without toggling. |
| **Transaction Rollback Proof** | JS-D07 | **PASSED** | Failed transaction leaves 0 partial records in fresh reads. |
| **Profile Zero State** | JS-D03 | **PASSED** | `ghost_user` returns 0 counts and empty media arrays without inner-join drops. |
| **Health Liveness & Readiness**| JS-D11 | **PASSED** | `/health/live` returns 200 ok; `/health/ready` returns 200 ready & connected. |
| **E2E HTTP Endpoints** | JS-D10 | **PASSED** | 14/14 supertest e2e tests passing against live PostgreSQL 17. |