# Architecture Decision Record: 07 - Security, Compatibility & Release Controls

**Status:** Accepted  
**Date:** 2026-10-23  
**Context:** Feature JS-P0-07 Security, Compatibility, and Release Controls  

---

## 1. Context & Problem Statement

Transitioning the platform from v1 anonymous demonstration mode to stateful, multi-user identity features (P0 Stages 1–6) introduces critical security and compatibility risks:
1. Mutations could inadvertently be left unprotected without authentication or authorization.
2. Cross-user horizontal privilege escalation (IDOR) could compromise user data.
3. Database migrations could fail when applied to existing production/v1 data.
4. Security configurations (CORS, credentials, observability) could leak secrets or expose open vectors.
5. Operational rollbacks could leave databases in an inconsistent or unrecoverable state.

---

## 2. Decision Log

### Decision 7.1: Default-Deny & Explicit Authentication / Authorization
* **Choice:** All endpoints require authenticated identity via `AuthGuard` unless explicitly annotated with the `@Public()` decorator.
* **Mutation Policy:** Every mutation (`POST`, `PATCH`, `DELETE`) must have an explicit authn and authz contract:
  * Public mutations are restricted exclusively to onboarding entry points: `POST /auth/register` and `POST /auth/login`.
  * All domain mutations require an authenticated session and enforce authorization (e.g., owner-only for profile updates, post updates, post deletions, request approvals, and notification read transitions).
* **Automated Audit:** An automated suite inspects the live NestJS router stack and diffs all registered handlers against the permission matrix to guarantee zero unclassified endpoints.

### Decision 7.2: CORS & Credential Transport
* **Choice:** Explicit origin reflection and strict credential gating. Wildcard origins (`*`) with `credentials: true` are prohibited.
* **Allowed Origins:** Validated strictly against `config.frontendOrigin` or development loopback addresses (`localhost`, `127.0.0.1`).
* **Transport Headers:** Allowed request headers restricted to `Content-Type`, `Authorization`, `X-Requested-With`, `X-Request-Id`.

### Decision 7.3: Observability & Credential Hygiene
* **Choice:** Request-ID tracking (`X-Request-Id`) across all HTTP transactions.
* **Credential Hygiene:**
  * No passwords, password hashes, or session tokens are ever written to stdout/logs.
  * Auth logs record only event types (`auth.login.success`, `auth.session.revoked`) paired with the correlation `requestId` and obfuscated identifiers.

### Decision 7.4: Forward Database Migration & Rehearsal Policy
* **Choice:** All schema changes must be forward-compatible additive migrations:
  * `deleted_at TIMESTAMPTZ(3)` (nullable)
  * `version INTEGER NOT NULL DEFAULT 1`
  * `read_at TIMESTAMPTZ(3)` (nullable)
* **Rehearsal Requirement:** Prior to release, migrations are rehearsed against a snapshot of accepted v1 data to prove zero constraint collisions or data loss.

---

## 3. Rollback & Disaster Recovery Strategy

1. **Schema Rollback:** If a deployment fails before traffic switch, down-migrations remove additive columns and indexes without corrupting base tables.
2. **Data Preservation:** Soft-deletes and tombstones ensure foreign keys remain intact; hard deletions are forbidden on conversation roots.
3. **Session Invalidation:** In the event of token compromise, `POST /auth/logout-all` invalidates all stateful sessions instantly by updating `revoked_at = NOW()`.
