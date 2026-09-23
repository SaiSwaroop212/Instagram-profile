# PostgreSQL Social Feed Database (Stage B — PRD 03)

This directory contains the production-grade PostgreSQL 17 relational database model, deterministic seed data, constraint test suite, and SQL use cases for the Social Feed backend.

---

## Files

| File | Purpose | Key Guarantees / Details |
|---|---|---|
| [`schema.sql`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/Backend/Database/schema.sql) | DDL Schema Definition | Normalized tables (`users`, `posts`, `post_media`, `post_likes`, `follows`), compound foreign keys enforcing target kind is `original`, check constraints for 1-280 length, lowercase handle regex, and performance B-tree indexes. |
| [`seed.sql`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/Backend/Database/seed.sql) | Deterministic Seed Fixtures | Fixed UUIDs & UTC timestamps. Seeds 6 users, 32 originals, 15 replies, 4 reposts, 10 media items, 17 likes, and 8 follow edges with timestamp tie edge cases. |
| [`manifest.sql`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/Backend/Database/manifest.sql) | Seed Verification Script | Validates entity counts, user profile stats, post reaction counts, and edge cases. |
| [`constraint-tests.sql`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/Backend/Database/constraint-tests.sql) | Automated Constraint Suite | 20+ automated negative & positive relational checks in PL/pgSQL testing unique handle, orphan inserts, duplicate likes, self-follows, and media slot limits. |
| [`queries.sql`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/Backend/Database/queries.sql) | 10 SQL Use Cases | Parameterized `PREPARE`/`EXECUTE` queries covering feed pagination across timestamp ties, post detail with reactions, replies, profile media cursor, search, and reposts. |
| [`transaction-tests.sql`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/Backend/Database/transaction-tests.sql) | ACID & Concurrency Tests | Demonstrates atomicity rollback on failed foreign key, and unique index conflict resolution during concurrent duplicate like requests. |
| [`notifications.sql`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/Backend/Database/notifications.sql) | Notification Extension | Event table with idempotency keys, deterministic seed, and unread notification query. |

---

## Documentation & Design Artifacts

Full technical defense documentation is located in the [`docs/`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/docs/) directory at the workspace root:

- **Entity-Relationship Diagram (ERD):** [`docs/erd.md`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/docs/erd.md)
- **Data Dictionary:** [`docs/data-dictionary.md`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/docs/data-dictionary.md)
- **Relational Decisions & 1NF-3NF:** [`docs/decisions.md`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/docs/decisions.md)
- **EXPLAIN (ANALYZE, BUFFERS) Report:** [`docs/query-plan-report.md`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/docs/query-plan-report.md)
- **Mentor Review Q&A:** [`docs/mentor-qa.md`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/docs/mentor-qa.md)
- **Seed Manifest:** [`docs/seed-manifest.md`](file:///c:/Users/sai%20swaroop/Downloads/Instagram-profile/docs/seed-manifest.md)

---

## Running Verification

To execute all tests and scripts against the local PostgreSQL 17 cluster:

```powershell
& "..\scripts\run_all.ps1"
```