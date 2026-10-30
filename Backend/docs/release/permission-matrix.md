# Route & Permission Matrix (P0 Release)

This document provides the authoritative authorization and access control matrix for all API routes registered in the application. Every endpoint and mutation is explicitly classified.

---

## Permission Matrix Table

| Method | Route | Controller | Auth Required | Anonymous | Owner / Self | Related User (e.g. Follower) | Unrelated User (Stranger) | Mutation? | Description / Contract |
|---|---|---|---|---|---|---|---|---|---|
| `GET` | `/` | `AppController` | No (`@Public`) | `200 OK` | `200 OK` | `200 OK` | `200 OK` | No | Basic root greeting |
| `GET` | `/health/live` | `HealthController` | No (`@Public`) | `200 OK` | `200 OK` | `200 OK` | `200 OK` | No | Kubernetes liveness probe |
| `GET` | `/health/ready` | `HealthController` | No (`@Public`) | `200 OK` | `200 OK` | `200 OK` | `200 OK` | No | PostgreSQL readiness probe |
| `POST` | `/auth/register` | `AuthController` | No (`@Public`) | `201 Created` | `201 Created` | `201 Created` | `201 Created` | **Yes** | Identity registration gateway |
| `POST` | `/auth/login` | `AuthController` | No (`@Public`) | `200 OK` | `200 OK` | `200 OK` | `200 OK` | **Yes** | Stateful session creation |
| `POST` | `/auth/logout` | `AuthController` | Yes (`AuthGuard`) | `401 Unauthorized` | `200 OK` | `200 OK` | `200 OK` | **Yes** | Revokes current session |
| `POST` | `/auth/logout-all` | `AuthController` | Yes (`AuthGuard`) | `401 Unauthorized` | `200 OK` | `200 OK` | `200 OK` | **Yes** | Revokes all user sessions |
| `GET` | `/auth/sessions` | `AuthController` | Yes (`AuthGuard`) | `401 Unauthorized` | `200 OK` | `401 / N/A` | `401 / N/A` | No | Active login sessions list |
| `DELETE` | `/auth/sessions/:id` | `AuthController` | Yes (`AuthGuard`) | `401 Unauthorized` | `200 OK` | `403 Forbidden` | `403 Forbidden` | **Yes** | Revoke specific session |
| `GET` | `/auth/me` | `AuthController` | Yes (`AuthGuard`) | `401 Unauthorized` | `200 OK` | `200 OK` | `200 OK` | No | Current session identity profile |
| `GET` | `/users/:id` | `UserController` | Optional (`@Public`) | `200 OK` | `200 OK` | `200 OK` | `200 OK` | No | Public profile & relationship state |
| `PATCH` | `/users/me` | `UserController` | Yes (`AuthGuard`) | `401 Unauthorized` | `200 OK` | `403 / N/A` | `403 / N/A` | **Yes** | Owner profile update |
| `POST` | `/users/me/deactivate` | `UserController` | Yes (`AuthGuard`) | `401 Unauthorized` | `200 OK` | `403 / N/A` | `403 / N/A` | **Yes** | Deactivates account & revokes sessions |
| `POST` | `/users/:id/follow` | `UserController` | Yes (`AuthGuard`) | `401 Unauthorized` | `400 Bad Request` | `200 OK` | `200 OK` | **Yes** | Desired-state follow or request |
| `DELETE` | `/users/:id/follow` | `UserController` | Yes (`AuthGuard`) | `401 Unauthorized` | `400 Bad Request` | `200 OK` | `200 OK` | **Yes** | Idempotent unfollow |
| `POST` | `/users/requests/:requesterId/accept` | `UserController` | Yes (`AuthGuard`) | `401 Unauthorized` | `404 Not Found` | `403 / 404` | `403 / 404` | **Yes** | Target accepts pending follow request |
| `POST` | `/users/requests/:requesterId/reject` | `UserController` | Yes (`AuthGuard`) | `401 Unauthorized` | `404 Not Found` | `403 / 404` | `403 / 404` | **Yes** | Target rejects pending follow request |
| `GET` | `/users/:id/followers` | `UserController` | Optional (`@Public`) | `200 / 403` | `200 OK` | `200 OK` | `403 Forbidden` (if private) | No | Paginated follower list |
| `GET` | `/users/:id/following` | `UserController` | Optional (`@Public`) | `200 / 403` | `200 OK` | `200 OK` | `403 Forbidden` (if private) | No | Paginated following list |
| `GET` | `/users/:id/media` | `MediaController` | Optional (`@Public`) | `200 / 403` | `200 OK` | `200 OK` | `403 Forbidden` (if private) | No | Paginated profile media tab |
| `GET` | `/users/me/posts` | `UserController` | Yes (`AuthGuard`) | `401 Unauthorized` | `200 OK` | `401 / N/A` | `401 / N/A` | No | Current user posts feed |
| `GET` | `/users/:id/posts` | `UserController` | Optional (`@Public`) | `200 / 403` | `200 OK` | `200 OK` | `403 Forbidden` (if private) | No | Target user posts feed |
| `GET` | `/posts/:id` | `PostController` | Optional (`@Public`) | `200 / 403 / 404`| `200 OK` | `200 OK` | `403 Forbidden` (if private) | No | Direct post detail (or tombstone) |
| `POST` | `/posts` | `PostController` | Yes (`AuthGuard`) | `401 Unauthorized` | `201 Created` | `201 Created` | `201 Created` | **Yes** | Creates original, reply, or repost |
| `PATCH` | `/posts/:id` | `PostController` | Yes (`AuthGuard`) | `401 Unauthorized` | `200 OK` | `403 Forbidden` | `403 Forbidden` | **Yes** | OCC author-only text editing |
| `DELETE` | `/posts/:id` | `PostController` | Yes (`AuthGuard`) | `401 Unauthorized` | `200 OK` | `403 Forbidden` | `403 Forbidden` | **Yes** | Author-only soft-delete |
| `POST` | `/posts/:id/like` | `PostController` | Yes (`AuthGuard`) | `401 Unauthorized` | `200 OK` | `200 OK` | `200 OK` | **Yes** | Idempotent desired-state like |
| `DELETE` | `/posts/:id/like` | `PostController` | Yes (`AuthGuard`) | `401 Unauthorized` | `200 OK` | `200 OK` | `200 OK` | **Yes** | Idempotent desired-state unlike |
| `GET` | `/posts/:id/replies` | `ReplyController` | Optional (`@Public`) | `200 OK` | `200 OK` | `200 OK` | `200 OK` | No | Paginated reply stream |
| `GET` | `/feed` | `FeedController` | Optional (`@Public`) | `200 OK` (Public) | `200 OK` (Personal)| `200 OK` (Personal)| `200 OK` (Personal) | No | Personalized or onboarding feed |
| `GET` | `/feed/public` | `FeedController` | No (`@Public`) | `200 OK` | `200 OK` | `200 OK` | `200 OK` | No | Public discovery feed |
| `GET` | `/search/posts` | `SearchController` | Optional (`@Public`) | `200 OK` (Public) | `200 OK` (Allowed) | `200 OK` (Allowed) | `200 OK` (Public only) | No | Privacy-aware full-text search |
| `GET` | `/search/users` | `SearchController` | Optional (`@Public`) | `200 OK` | `200 OK` | `200 OK` | `200 OK` | No | User handle and name search |
| `GET` | `/notifications` | `NotificationController` | Yes (`AuthGuard`) | `401 Unauthorized` | `200 OK` | `401 / N/A` | `401 / N/A` | No | Recipient-only inbox |
| `GET` | `/notifications/unread-count` | `NotificationController` | Yes (`AuthGuard`) | `401 Unauthorized` | `200 OK` | `401 / N/A` | `401 / N/A` | No | Authoritative unread count |
| `PATCH` | `/notifications/:id/read` | `NotificationController` | Yes (`AuthGuard`) | `401 Unauthorized` | `200 OK` | `403 Forbidden` | `403 Forbidden` | **Yes** | Mark single notification read |
| `POST` | `/notifications/:id/read` | `NotificationController` | Yes (`AuthGuard`) | `401 Unauthorized` | `200 OK` | `403 Forbidden` | `403 Forbidden` | **Yes** | Alias for single mark read |
| `POST` | `/notifications/read-all` | `NotificationController` | Yes (`AuthGuard`) | `401 Unauthorized` | `200 OK` | `401 / N/A` | `401 / N/A` | **Yes** | Bounded batch mark all read |

---

## Mutation Invariant Proof

* Total Mutations Identified: **18 endpoints**
* Unclassified Mutations: **0**
* Unauthenticated Mutations: **2** (`POST /auth/register`, `POST /auth/login` — public by design)
* Guarded Mutations: **16** (all protected by `AuthGuard`)
* Authorization Enforced: 100% of guarded mutations enforce owner/recipient identity checks or state transition validation.
