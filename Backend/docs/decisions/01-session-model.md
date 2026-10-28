# Decision Record 01: Stateful Session Model & Identity Architecture

```text
Decision:        Stateful server-side sessions stored in PostgreSQL with hashed tokens and HTTP cookies / Bearer headers.
Options:         1. Stateless JWT (signed tokens in Authorization header)
                 2. Stateful database sessions with SHA-256 token hashing (chosen)
                 3. In-memory / Redis cache sessions
Why this one:    Stateful DB sessions allow immediate, definitive revocation on logout, account deactivation, or security incidents without maintaining a separate distributed revocation blacklist. SHA-256 token hashing ensures raw tokens cannot be extracted if database read dumps occur.
Risks:           Database lookup per authenticated request. Mitigated by composite B-tree index on (user_id, expires_at) and unique index on token_hash.
Test proving it: test/auth.e2e-spec.ts & src/auth/auth.service.spec.ts
```

## Think First Questions & Answers

1. **If a token is stolen, what can the attacker do and for how long? How does your design shrink that?**
   - *Exposure*: The attacker can impersonate the victim until the session expires or is revoked.
   - *Mitigations*: 
     - Sessions have an explicit expiration timestamp (`expires_at`, default 7 days).
     - Stateful revocation: Calling `POST /auth/logout` immediately marks `revokedAt = now()`. The victim or admin can also revoke all active sessions (`POST /auth/logout-all`).
     - Session tokens are stored as SHA-256 hashes in PostgreSQL; a read-only SQL injection or database dump cannot recover active tokens.
     - Transport security: Tokens are supported via `Set-Cookie` (`HttpOnly`, `SameSite=Lax`, `Secure` in prod) or `Authorization: Bearer <token>`, preventing client-side script theft when using cookies.

2. **"Wrong password" vs. "no such user": what does an attacker learn if messages or response times differ?**
   - *User Enumeration*: If the message differs (e.g., "User not found" vs "Invalid password"), an attacker easily harvests existing handles. If the server returns in 2ms when user does not exist but takes 80ms to run scrypt when user exists, timing attacks reveal valid accounts.
   - *Mitigation*: Both cases return the identical generic error `401 Unauthorized: Invalid handle or password`. When a user handle is not found, a constant-time dummy `scrypt` operation is executed on a static salt, guaranteeing indistinguishable execution latency.

3. **How do you "log out" a stateless token? What must you store?**
   - Stateless JWTs cannot be revoked without maintaining a server-side denylist/blocklist (which turns them stateful anyway).
   - In our stateful design, logging out updates `revoked_at` in the `auth_sessions` table, immediately invalidating subsequent requests.

4. **Where is "who is the current user" computed, exactly once per request?**
   - Computed in NestJS `SessionGuard` (implementing `CanActivate`), which runs early in the request lifecycle after middleware.
   - The verified user entity and session ID are attached directly to `req.user` and `req.session`.
   - Handlers read the actor strictly via the custom `@CurrentUser()` param decorator. Client-supplied bodies, route params, or query parameters can never specify the actor.

5. **What do `"John.Doe "` and `"john.doe"` do to uniqueness? Who normalizes, and where?**
   - Case sensitivity and whitespace differences allow impersonation or duplicate account bugs.
   - *Normalization*: Handlers normalize input in the DTO / Service layer (`handle.trim().toLowerCase().replace(/^@/, '')`) before hitting queries.
   - *Enforcement*: The database has a check constraint `ck_users_handle_format` (`handle = lower(handle) AND handle ~ '^[a-z0-9_]{1,30}$'`) and a unique index `uq_users_handle` to enforce normalization at the storage engine level.
