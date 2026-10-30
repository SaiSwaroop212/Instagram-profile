# Production Release Guide (P0 Release)

**Version:** 1.0.0-P0  
**Target Architecture:** NestJS 12, Prisma 6, PostgreSQL 17  
**Date:** 2026-10-23  

---

## 1. Release Pre-requisites & Environment Configuration

Ensure the following environment variables are set in production `.env`:

| Variable | Description | Production Example / Default |
|---|---|---|
| `PORT` | Listening HTTP port | `3000` |
| `NODE_ENV` | Runtime environment | `production` |
| `DATABASE_URL` | PostgreSQL 17 connection string with schema | `postgresql://user:pass@db:5432/social_feed?schema=public` |
| `FRONTEND_ORIGIN` | Allowed client origin for CORS | `https://instagram-profile.example.com` |
| `DEMO_USER_ID` | Fallback legacy demo user ID (if applicable) | `a0000000-0000-4000-8000-000000000001` |

> **Security Note:** CORS is strictly constrained to `FRONTEND_ORIGIN` and local loopback; credentials are never accepted with wildcard origins.

---

## 2. Database Migration Order & Execution

Migrations are forward-compatible and additive. Apply migrations in sequence via Prisma Migrate:

```bash
# Apply pending migrations to PostgreSQL database
npx prisma migrate deploy

# Generate latest client bindings
npx prisma generate
```

### Migration History:
1. `20260921_init`: Core DDL (users, posts, post_media, post_likes, follows)
2. `20261022_auth_sessions`: Stateful scrypt session storage (`auth_sessions`)
3. `20261022_user_deactivation`: Soft deactivation timestamp (`deactivated_at`)
4. `20261022_follow_privacy`: Follow request status machine (`pending`/`accepted`)
5. `20261023_content_lifecycle`: Post versioning (`version`) and tombstone soft-deletion (`deleted_at`)
6. `20261023_notifications_constraints`: Notifications table, check constraints, and unread indexes

---

## 3. Post-Deployment Smoke Checks

Run the following sanity checks against the deployed service:

```bash
# 1. Liveness Probe (Should return 200 { status: 'ok' })
curl -i http://localhost:3000/health/live

# 2. Database Readiness Probe (Should return 200 { status: 'ready', database: 'connected' })
curl -i http://localhost:3000/health/ready

# 3. Public Discovery Feed (Should return 200 with public posts array)
curl -i http://localhost:3000/feed/public?limit=5

# 4. Auth Protection Check (Should return 401 Unauthorized)
curl -i http://localhost:3000/auth/me
```

---

## 4. Rollback Considerations

* **Additive Columns (`deleted_at`, `version`, `read_at`):**
  * Existing v1 records have `deleted_at = NULL` and `version = 1`. If rolling back code to an earlier version, the database schema remains valid and backward-compatible.
* **Database Rollback Command:**
  * If migration needs to be rolled back during staging rehearsal:
    ```bash
    npx prisma migrate resolve --rolled-back <migration_name>
    ```
* **Session Revocation Emergency:**
  * To immediately terminate all active sessions across the entire fleet:
    ```sql
    UPDATE auth_sessions SET revoked_at = NOW() WHERE revoked_at IS NULL;
    ```

---

## 5. Known Limitations (P0 Scope)

1. **Pull-Based Notifications:** Real-time push (WebSockets/SSE) is deferred to P1; notifications are retrieved via client polling on `GET /notifications` and `GET /notifications/unread-count`.
2. **Post Edit History:** Optimistic Concurrency Control (OCC) prevents race conditions via `version`, but full diff history audit tables are deferred to stretch features.
3. **Media Publishing:** Media rows are populated via DB/backend fixtures in P0; direct user file multipart upload (`JS-P1-05`) is scheduled for Stage P1.
