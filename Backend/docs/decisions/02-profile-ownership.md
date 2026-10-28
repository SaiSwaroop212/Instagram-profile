# Decision Record 02: Owned Profile and Account State

```text
Decision:        Strict allowlist profile updates with resource ownership verification (actor.id === resource.id) and soft deactivation with immediate session revocation.
Options:         1. Mass-assignment via raw body update (rejected: vulnerable to privilege escalation/tampering).
                 2. Strict DTO allowlist with actor verification & soft deactivation (chosen).
                 3. Hard deletion on deactivation (rejected: breaks relational integrity and historical conversation threads).
Why this one:    Guarantees immutable fields (id, password_hash, timestamps, relationship counts) cannot be overwritten. Cross-user writes fail fast with 403 Forbidden without mutating state.
Risks:           Handle changes may break external links pointing to the old handle. Mitigated by allowing permanent lookup via immutable UUID.
Test proving it: test/profile-ownership.e2e-spec.ts
```

## Field Permission Matrix (Field × Who Can Read × Who Can Write)

| Field | Visibility | Who Can Read | Who Can Write | Mutability Rule |
|---|---|---|---|---|
| `id` | Public | Anyone (Anonymous & Auth) | Server / DB only | **Immutable** (Assigned at creation, never editable) |
| `handle` | Public | Anyone | Account Owner only | **Editable** (Subject to regex `^[a-z0-9_]{1,30}$` & uniqueness) |
| `displayName` | Public | Anyone | Account Owner only | **Editable** (1–50 characters, trimmed, non-empty) |
| `bio` | Public | Anyone | Account Owner only | **Editable** (Max 280 characters, default empty string) |
| `avatarSmallUrl` | Public | Anyone | Account Owner only | **Editable** (Valid URL or fixture path) |
| `avatarLargeUrl` | Public | Anyone | Account Owner only | **Editable** (Valid URL or fixture path) |
| `passwordHash` | Internal / Private | **Nobody** (Never serialized) | Auth Service only | **Managed** (Updated only via dedicated password/auth endpoints) |
| `createdAt` | Public | Anyone | Server / DB only | **Immutable** (Audit timestamp) |
| `updatedAt` | Public | Anyone | Server / DB only | **Immutable** (Automatically touched on write) |
| `deactivatedAt` | Private / Internal | Owner & System | Account Owner only | **Managed** (Set on deactivation, revokes all sessions) |
| `followerCount` | Public | Anyone | System only | **Derived** (Calculated dynamically or transactionally) |
| `followingCount` | Public | Anyone | System only | **Derived** (Calculated dynamically or transactionally) |
| `postCount` | Public | Anyone | System only | **Derived** (Calculated dynamically or transactionally) |

---

## Think First Answers

1. **List every user field. Mark each: public / private / immutable / editable:**
   - See the Field Permission Matrix above.
2. **If handle change is allowed, what happens to old mentions and links? If not, why not?**
   - Handle changes are permitted because users expect identity mobility.
   - Text mentions in historical posts remain static text snapshots (consistent with v1 immutable post bodies).
   - Permanent canonical user links should rely on the immutable UUID `GET /users/:uuid`, which always resolves regardless of handle changes.
3. **On deactivation, list every place their data appears. Who makes all of them consistent?**
   - **Direct Profile (`/users/:id`)**: Handled by `UserRepository.getUserById` — checks `deactivatedAt` and returns `404 Not Found`.
   - **Personal & Public Feed (`/feed`)**: Handled by `FeedRepository.getFeed` — adds `where: { author: { deactivatedAt: null } }`.
   - **Search (`/search/posts`)**: Handled by `SearchRepository.searchOriginals` — filters out posts where `author.deactivatedAt !== null`.
   - **Active Sessions**: Handled immediately by `AuthRepository.revokeAllUserSessions(userId)` so deactivated users are booted instantly.
4. **Two tabs save the profile at once. Which wins, and does the loser find out?**
   - Profile updates use Last-Write-Wins (LWW) with atomic PostgreSQL updates. The second write to complete commits its values and returns the new profile projection in the HTTP 200 response.
