# Decision Record 03: Follow Graph and Privacy

```text
Decision:        Directed follow graph with state machine ('pending' | 'accepted' | 'rejected'), desired-state idempotent transitions, DB-level self-follow constraint, active-only counts, and strict read-surface privacy filtering.
Options:         1. Boolean toggle follow endpoint (rejected: non-idempotent, retries flip state under network packet replay).
                 2. Unconstrained application-level checks only (rejected: vulnerable to concurrent self-follow and duplicate rows).
                 3. Directed state-machine model with compound primary key (followerId, followingId), DB check constraint, upsert idempotency, and visibility-aware query gating (chosen).
Why this one:    Guarantees concurrency safety (50 concurrent follows produce exactly 1 row), retry safety, prevents self-follows at PostgreSQL engine level, and enforces privacy across all 5 read surfaces (post detail, feed, search, media, relationship lists).
Risks:           Private account transitions add state complexity. Mitigated by explicit state transition validation and tests for every illegal transition.
Test proving it: test/follow-graph.e2e-spec.ts
```

---

## State Machine Diagram

```
                 [ NO RELATIONSHIP ]
                     |          ^
     POST follow     |          | DELETE unfollow /
     (public user)   |          | cancel (requester)
                     v          |
               +-------------+  |
               |  ACCEPTED   |--+
               +-------------+
                 ^          ^
  target accepts |          |
                 |          |
               +-------------+
               |   PENDING   |
               +-------------+
                     ^
     POST follow     |
     (private user)  |
                     |
                 [ NO RELATIONSHIP ]
```

### Transition Authority & Rules

| Current State | Target Type | Trigger | Allowed Actor | Next State | HTTP Status |
|---|---|---|---|---|---|
| `NONE` | Public | `POST /users/:id/follow` | Any authenticated user ($A \neq B$) | `ACCEPTED` | 200 OK |
| `NONE` | Private | `POST /users/:id/follow` | Any authenticated user ($A \neq B$) | `PENDING` | 200 OK |
| `PENDING` | Private | `POST /users/:id/follow` (retry) | Requester ($A$) | `PENDING` (no-op) | 200 OK |
| `PENDING` | Any | `DELETE /users/:id/follow` | Requester ($A$) only | `NONE` (row deleted) | 200 OK |
| `PENDING` | Private | `POST /users/requests/:requesterId/accept` | Target ($B$) only | `ACCEPTED` | 200 OK |
| `PENDING` | Private | `POST /users/requests/:requesterId/reject` | Target ($B$) only | `NONE` (row deleted) | 200 OK |
| `ACCEPTED` | Any | `POST /users/:id/follow` (retry) | Requester ($A$) | `ACCEPTED` (no-op) | 200 OK |
| `ACCEPTED` | Any | `DELETE /users/:id/follow` | Requester ($A$) | `NONE` (row deleted) | 200 OK |
| Any | Any | $A = B$ (Self-follow) | Anyone | *Forbidden* | 400 Bad Request |
| `PENDING` | Private | Third-party ($C$) attempts accept/reject | Attacker ($C$) | *Forbidden* | 403 Forbidden |
| `PENDING` | Private | Target ($B$) attempts to cancel | Target ($B$) | *Forbidden* | 403 Forbidden |
| `PENDING` | Private | Requester ($A$) attempts to accept self | Requester ($A$) | *Forbidden* | 403 Forbidden |

---

## Think First Answers

1. **Draw the state machine (boxes = states, arrows = transitions, label each arrow with who may trigger it):**
   - Detailed diagram and transition authority matrix documented above.
2. **"Follow" called twice, or while "pending": what should each response be?**
   - **Public target**: `POST /users/:id/follow` called twice returns `200 OK` with `{ status: 'accepted', following: true, followerCount: N }` both times. No duplicate rows created.
   - **Private target**: `POST /users/:id/follow` called twice returns `200 OK` with `{ status: 'pending', following: false, followerCount: N }` both times without duplicating or corrupting the pending request.
   - Desired-state idempotency guarantees callers converge on the desired relationship.
3. **How do you stop self-follow at the DB level, not only in TypeScript?**
   - Enforced by PostgreSQL table constraint in the `follows` migration:
     ```sql
     CONSTRAINT "ck_follows_no_self_follow" CHECK ("follower_id" <> "following_id")
     ```
   - Even if application logic were bypassed, PostgreSQL rejects any insert/update with SQLSTATE `23514` (check_violation).
4. **Store counts or compute them? What breaks in each approach under concurrency?**
   - **Approach**: Compute active relationships dynamically via indexed queries (`WHERE following_id = :id AND status = 'accepted' AND follower.deactivated_at IS NULL`) backed by composite indexes `(following_id, follower_id)` and `(follower_id, following_id)`.
   - **Why stored counts break under concurrency**: In distributed or high-concurrency systems, `followerCount = followerCount + 1` encounters lost updates, race conditions, drift from uncommitted rollbacks, and discrepancies when accounts deactivate. Computing active counts on indexed relations guarantees 100% strict consistency.
5. **If A is private and B isn't approved, list every endpoint where B might still learn about A's posts:**
   - **Direct Post Detail (`GET /posts/:id`)**: Protected by visibility check. Returns `403 Forbidden`.
   - **User Media Feed (`GET /users/:id/media`)**: Protected by visibility check. Returns `403 Forbidden`.
   - **Global/Public Feed (`GET /feed`)**: Excludes posts from private accounts unless viewer is an approved follower.
   - **Search Originals (`GET /search/posts`)**: Excludes posts from private accounts unless viewer is an approved follower.
   - **Follower/Following Lists (`GET /users/:id/followers`, `GET /users/:id/following`)**: Gated to approved followers and self.
   - **Notifications (`GET /notifications`)**: Excludes internal activity previews from private accounts to unauthorized actors.
