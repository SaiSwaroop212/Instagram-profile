# Social Feed v2 — JavaScript/TypeScript Track

> **Same product requirements as the original PRD, reorganized to teach.** Every requirement and acceptance rule is preserved. What's new: a learning path, plain-language glossary, per-feature guiding questions, common pitfalls, checkpoints, and self-check prompts. **No solutions are given on purpose**: design decisions are yours to make and defend.

| Field | Value |
|---|---|
| Product increment | Social Feed v2: multi-user product continuation |
| Track | JavaScript/TypeScript (NestJS, Prisma, PostgreSQL) |
| Priority model | P0 release blocker, P1 next release, P2 future |
| Required predecessors | PRDs 00, 01, 03, 04 (call their output **V1**) |

---

## Part 0: How to use this document

1. **Read Parts 1–3 first** (about 30 min). Know *why* before *what*.
2. **Work in the order of the Learning Path (Part 4)**, not document order. Dependencies decide order.
3. **For each feature:** read it → answer its *Think first* questions **in writing** → write a short decision record → build → prove it with the *Checkpoint*.
4. **Stuck for 30+ minutes?** Write down what you tried and what you expected vs. saw, then ask your mentor. This is a real career skill.
5. **Never skip evidence.** "It works on my machine" is not acceptance. Tests, query logs, and request-ID traces are.

### Decision record template (use for every learner-owned decision)

Keep it to ~10 lines, in `docs/decisions/NN-title.md`:

```
Decision:      what you chose
Options:       2–3 alternatives you considered
Why this one:  trade-offs in your own words
Risks:         what could go wrong, and how you'd notice
Test proving it: link to the test
```

---

## Part 1: The problem in plain words

V1 works, but it pretends everyone is one hard-coded person (`DEMO_USER_ID`). That means:

- The app can't tell **who** is acting.
- Anyone can act **as** anyone.
- The feed can't be **personal**.
- Authors can't **control** their posts.
- Users can't **hear about** activity directed at them.

V2 fixes this: **real identity → ownership → relationships → personal feed → content lifecycle → notifications**, without breaking v1.

### Business outcomes

- Members keep identity, relationships, content, and activity across sessions.
- Every protected action is tied to the authenticated actor.
- The home feed reflects who you follow.
- Authors control their own profile and content.
- Activity is discoverable without duplicates or self-noise.
- V1 clients and data have an explicit migration path.

## Part 2: Glossary (keep this open)

| Term | Plain meaning |
|---|---|
| **Authentication (authn)** | Proving *who you are*. |
| **Authorization (authz)** | Deciding *what you may do* to a specific resource. |
| **Actor** | The verified user performing the current request. |
| **Trust boundary** | Where data stops being trusted (anything from the client). |
| **Guard (NestJS)** | Code that runs before a handler and allows/denies the request. |
| **DTO** | Data Transfer Object: the typed shape you accept/return at the API edge. |
| **Pipe (NestJS)** | Transforms/validates input (e.g., `ValidationPipe`). |
| **Enumeration** | Attacker learning which accounts exist from different errors/timings. |
| **Session / token** | How the server remembers a signed-in user between requests. |
| **Revocation** | Making a session invalid *before* it naturally expires. |
| **Idempotent / retry-safe** | Doing it twice has the same result as doing it once. |
| **Desired-state operation** | "Make me following X" rather than "toggle follow". |
| **State machine** | Allowed states and the only legal transitions between them. |
| **Compound uniqueness** | A DB constraint across 2+ columns (e.g., `@@unique([followerId, followeeId])`). |
| **Race condition** | Two requests interleave and produce a state neither alone would. |
| **Optimistic concurrency** | Detect conflicting edits with a version check; reject the stale one. |
| **Tombstone** | A marker left in place of removed content so references stay explainable. |
| **Cursor pagination** | "Items after this position" rather than "page 3". |
| **N+1 queries** | One query for a list, then one more *per item*. Forbidden here without approval. |
| **Dedup key** | A value that makes one source event produce only one notification. |
| **Event loop blocking** | CPU-heavy sync work (e.g., hashing) freezing *all* requests in Node. |
| **Migration** | A versioned, repeatable schema/data change (Prisma Migrate). |
| **Permission matrix** | Table: every route × (anonymous / owner / related / unrelated) → allow or deny. |

## Part 3: Priorities and scope

- **P0:** required for release. One failed P0 condition blocks release.
- **P1:** after P0. May extend, must not redesign accepted P0 behavior.
- **P2:** future ideas. Need their own PRD. **Do not build.**

**Out of scope for P0:** real-time delivery, recommendation ranking, video processing, full moderation console, account recovery, distributed caching, microservices, production deployment, multi-region.

### Personas and journeys

Personas: new member, returning member, content author, reader, support reviewer.

1. Register → sign in → complete profile → open a known profile → follow → view home feed.
2. Create a post → edit/remove under policy → see consistent results on every read surface.
3. Like / reply / repost / follow → recipient sees **one** notification.
4. Open a private/public profile → see only what the viewer may.
5. Expired session or forbidden action → safe response, recoverable, **no unintended state change**.

> **Intern tip:** these 5 journeys are your end-to-end test outline. Write them as failing e2e tests *first*.

---

## Part 4: Learning Path (suggested 8 stages)

Dependencies are real: later stages break if earlier ones are wrong. Time boxes are suggestions; adjust with your mentor.

| Stage | Focus | Features | Why now | Difficulty |
|---|---|---|---|---|
| 0 | **Baseline & safety net** | V1 suite, read V1 code | Can't protect what you don't understand | Foundation |
| 1 | **Identity** | JS-P0-01 | Everything protected depends on it | ★★★ |
| 2 | **Profile ownership** | JS-P0-02 | Easiest practice of authz | ★★ |
| 3 | **Relationships** | JS-P0-03 | State machines + concurrency | ★★★ |
| 4 | **Home feed** | JS-P0-04 | Graph queries + cursors | ★★★ |
| 5 | **Content lifecycle** | JS-P0-05 | Cascading effects | ★★★ |
| 6 | **Notifications** | JS-P0-06 | Transactions + dedup | ★★★★ |
| 7 | **Hardening & release** | JS-P0-07 | Proof, migration, docs | ★★★ |
| 8 | **P1 (optional)** | Chosen from P1 list | Stretch | varies |

### Stage 0: Baseline (before any feature)

- [ ] Run the V1 test suite. Record results (your regression baseline).
- [ ] Draw a one-page diagram: controllers → services → Prisma → DB.
- [ ] Find every use of `DEMO_USER_ID`. List them.
- [ ] Read the V1 error envelope and request-ID code; you must preserve both.
- [ ] Read `schema.prisma` and the migration SQL; run migrations on a clean DB.

**Checkpoint:** explain V1 to a teammate in 5 minutes using your diagram.

### Feature dependency map

```
 V1 ─► P0-01 Identity ─┬─► P0-02 Profile ─► P0-03 Follow/Privacy ─► P0-04 Home feed
                       ├─► P0-05 Content lifecycle ──────────────┐
                       └─────────────► P0-06 Notifications ◄─────┘ (also needs 03 + V1 interactions)
                                  all P0 ─► P0-07 Release controls
```

| ID | Priority | Feature | Depends on | Unlocks |
|---|---|---|---|---|
| JS-P0-01 | P0 | Account and session identity | V1 | All protected features |
| JS-P0-02 | P0 | Owned profile and account state | 01 | Privacy, discovery |
| JS-P0-03 | P0 | Follow graph and privacy | 01, 02 | Personal feed, follow notifications |
| JS-P0-04 | P0 | Personalized home feed | 03, V1 feed | Useful home experience |
| JS-P0-05 | P0 | Owned-content lifecycle | 01, V1 posts | Author control, reliable notifications |
| JS-P0-06 | P0 | Notification inbox | 01, 03, V1 interactions | Activity feedback |
| JS-P0-07 | P0 | Security, compatibility, release | All P0 | V2 release |

Features may be *explored* early but cannot be *accepted* before dependencies pass.

---

## Part 5: P0 features (with learning scaffolds)

Each feature: **Outcome → Requirements → Acceptance → Learning scaffold**. Requirements and acceptance are binding; scaffolds are help.

---

### JS-P0-01 — Account and session identity  ·  Stage 1

**Outcome:** replace `DEMO_USER_ID` with a user-controlled, revocable identity.

**Requirements**

- Visitor can register with a unique **normalized** handle, display name, and credential.
- Member can sign in, find their current account, sign out, and invalidate sessions per a documented policy.
- Credentials never stored or logged in recoverable plain text.
- Auth failure does not reveal whether an account exists.
- Protected actions derive the actor **only** from verified auth state. Body/query/path can never choose the actor.
- Expiry, renewal/reauth, revocation, and disabled-account behavior are explicit and testable.
- Public reads stay public unless another feature restricts them.
- Demo identity removed from normal runtime; isolated test identity may remain.
- Registration and sign-in have bounded inputs and a learner-designed abuse-control policy.
- Identity failures keep the v1 error envelope and request-ID conventions.

**Acceptance**

- Concurrent duplicate registration creates at most one account.
- Valid identity enables protected work; missing/invalid/expired/revoked does not.
- Sign-out invalidates the documented session scope.
- No response, log, exception, or fixture leaks credentials/session secrets.

**Learner-owned decisions:** credential identifier, session/token model, transport, expiry, revocation representation, abuse-control approach.

#### Learning scaffold

**Concepts to study first:** password hashing vs. encryption; salts; why slow hashes exist (argon2/bcrypt/scrypt); stateless JWT vs. server-side sessions; NestJS request lifecycle (middleware → guards → interceptors → pipes → handler → filters); custom param decorators; 401 vs. 403.

**Think first (write answers):**
1. If a token is stolen, what can the attacker do and for how long? How does your design shrink that?
2. "Wrong password" vs. "no such user": what does an attacker learn if messages or *response times* differ?
3. How do you "log out" a stateless token? What must you store?
4. Where is "who is the current user" computed, exactly once per request?
5. What do `"John.Doe "` and `"john.doe"` do to uniqueness? Who normalizes, and where?

**Common pitfalls**
- Logging the request body (contains the password) in an exception filter or logging interceptor.
- "Find user, then create if missing": a race. Let the DB unique constraint decide and handle Prisma's unique-violation error (`P2002`).
- Reading `userId` from `@Body()` "for convenience".
- Fast hashes (plain SHA/MD5) for passwords.
- Synchronous/CPU-heavy hashing blocking the Node event loop.
- Different error text or timing for unknown user vs. wrong password.
- Secrets in committed `.env` or test fixtures.
- `ValidationPipe` without `whitelist` / `forbidNonWhitelisted`, so extra fields slip through.

**Checkpoint:** run 20 concurrent registrations of one handle → exactly 1 account. Grep logs and responses for the password → zero hits.

**Self-check:** explain authn vs. authz using one example from your own code.

**Stretch:** measure hashing time and its effect on concurrent requests; propose a mitigation.

---

### JS-P0-02 — Owned profile and account state  ·  Stage 2

**Outcome:** members maintain a public identity without touching another account.

**Requirements**

- A member can update only **their own** allowed fields: display name, bio, avatar references, supported settings.
- Immutable IDs, counts, timestamps, ownership, relationship state, and unknown fields are **rejected**.
- Length, character, URL, normalization, and empty-value rules are documented.
- Public reads expose only approved public fields.
- Handle-change policy is explicitly chosen and preserves normalization/uniqueness.
- Concurrent profile writes have a documented conflict policy.
- Account deactivation and visibility of its profile/content are defined (hard delete not required).

**Acceptance**

- Owner changes succeed; cross-user and immutable-field attempts leave state unchanged.
- Invalid/duplicate handles behave deterministically under concurrency.
- Deactivated-account behavior is consistent across direct, feed, search, and notification surfaces.

#### Learning scaffold

**Concepts:** allowlist vs. blocklist updates; `class-validator` + `whitelist`/`forbidNonWhitelisted`; separate input DTO vs. response DTO (public vs. private projection); last-write-wins vs. version check.

**Think first:**
1. List every user field. Mark each: public / private / immutable / editable.
2. If handle change is allowed, what happens to old mentions and links? If not, why not?
3. On deactivation, list *every* place their data appears. Who makes all of them consistent?
4. Two tabs save the profile at once. Which wins, and does the loser find out?

**Common pitfalls**
- Passing the request body straight into `prisma.user.update({ data: body })` (mass assignment).
- Returning the raw Prisma user object (leaks internal fields like hash or email).
- `PATCH /users/:id` trusting `:id` without comparing it to the actor.
- Forgetting deactivation in the *notification* or *search* path.

**Checkpoint:** a "field × who can read × who can write" table, plus a test where user B PATCHes user A and DB state is identical afterward.

**Self-check:** why is "the response hides the field" not the same as "the update rejects the field"?

---

### JS-P0-03 — Follow graph and privacy  ·  Stage 3

**Outcome:** members shape a social graph while respecting account visibility.

**Requirements**

- Follow/unfollow are **desired-state** and retry-safe.
- Self-follow and duplicate active relationships are impossible under concurrency.
- Public follows activate immediately.
- If private accounts are selected: requests have valid pending/accepted/rejected/cancelled transitions.
- Only the requester can cancel; only the target can approve/reject.
- Follower/following counts reflect **active** relationships only.
- Relationship lists are deterministic, bounded, cursor-paginated, visibility-aware.
- Current relationship state appears on relevant profile responses.
- Blocking/muting deferred unless chosen as part of privacy; if added, document precedence across all surfaces.

**Acceptance**

- Repeated operations converge on the requested state.
- Concurrent duplicates leave one logical relationship.
- Unauthorized transitions don't change data.
- Private content is not leaked via direct ID, feed, search, media, relationship lists, or notifications.

#### Learning scaffold

**Concepts:** directed edges; `@@unique` compound keys; DB `CHECK` constraints (needs raw SQL in a Prisma migration); `upsert` and its concurrency caveats; state-machine diagrams.

**Think first:**
1. Draw the state machine (boxes = states, arrows = transitions, label each arrow with *who* may trigger it).
2. "Follow" called twice, or while "pending": what should each response be?
3. How do you stop self-follow at the **DB** level, not only in TypeScript?
4. Store counts or compute them? What breaks in each approach under concurrency?
5. If A is private and B isn't approved, list every endpoint where B might still learn about A's posts.

**Common pitfalls**
- Follow implemented as a *toggle* (retries flip the state).
- `findFirst` then `create` with no DB uniqueness: classic race.
- Counts that include pending/rejected rows.
- Privacy applied to post detail but not *media URLs* or *notifications*.
- Unbounded relationship lists.

**Checkpoint:** fire 50 concurrent follow requests for one pair → 1 active row. State-machine diagram in docs, with a test per illegal transition.

**Self-check:** why is "desired state" safer than "toggle" on flaky mobile networks?

**Stretch:** add blocking and document precedence versus follow/privacy.

---

### JS-P0-04 — Personalized home feed  ·  Stage 4

**Outcome:** relevant home experience without an accidentally empty first session.

**Requirements**

- Feed includes eligible **originals** from followed authors and the viewer.
- Eligibility uses current active relationships, privacy, account state, content state.
- V1 tuple ordering/cursor behavior stays unless an alternative is pre-approved.
- Replies/reposts excluded unless separately approved.
- Choose an explicit onboarding empty state **or** labeled public fallback for users following nobody.
- Follow/privacy changes affect later requests under a documented consistency expectation.
- No promise of snapshot completeness when eligibility changes between pages.
- V1 public feed stays available or has an approved compatibility/deprecation plan.
- Propose latency and query-count budgets **before** implementing; measure on representative data.

**Acceptance**

- Eligible self/followed posts appear; ineligible authors never do.
- Equal timestamps across authors paginate without duplication when eligibility is unchanged.
- Onboarding case is intentional and testable.
- Counts/viewer state correct without per-item query growth.

#### Learning scaffold

**Concepts:** Prisma `include`/`select` vs. raw SQL; Prisma query logging (`log: ['query']`); `EXPLAIN ANALYZE`; composite indexes (`@@index`); keyset pagination with tie-breakers; `_count` and relation aggregates.

**Think first:**
1. Why is `orderBy: { createdAt: 'desc' }` alone *not* a stable cursor? What tie-breaker fixes it?
2. Write your query-count budget *before* coding (e.g., "a feed page = ≤ N queries regardless of page size").
3. If the user unfollows someone between page 1 and 2, what happens to page 2? Is that acceptable? Write it down.
4. For a new user, what does the feed show, and how does the client tell "empty by design" from "broken"?

**Common pitfalls**
- N+1: calling `prisma.like.count()` or "did viewer like?" inside a `.map()`/`Promise.all` per post.
- Cursor from timestamp only → duplicates/skips on ties.
- Testing with 5 rows, discovering a sequential scan at 100k.
- Accidentally including replies or reposts.
- Over-fetching whole relations when you need two fields.

**Checkpoint:** seed ~10k posts and ~100 users. Show query count is constant for page size 5 vs. 50, with `EXPLAIN` output attached.

**Self-check:** explain why offset pagination breaks for live feeds.

---

### JS-P0-05 — Owned-content lifecycle  ·  Stage 5

**Outcome:** authors have reliable control after publishing.

**Requirements**

- Authenticated creation keeps v1 original/reply/repost rules.
- Only the author edits eligible text.
- Edit visibility, history/time window, and conflict behavior are explicitly chosen.
- Kind, author, ID, creation time, target references, derived counts: **not editable**.
- Authors can remove content via a chosen hard-delete, soft-delete, or tombstone policy.
- Delete behavior covers detail, feed, search, replies, reposts, likes, media, bookmarks, notifications.
- Removing a referenced original cannot leave an unexplained broken conversation.
- Repeated delete behavior is documented and safe.
- Wrong-owner and stale/concurrent edits leave protected state unchanged.

**Acceptance**

- Owner edit/remove reflected consistently on every read surface.
- Unsupported fields, kinds, actors, and transitions fail safely.
- Relationships/counts stay valid after chosen deletion behavior.
- Concurrency evidence demonstrates the edit-conflict policy.

#### Learning scaffold

**Concepts:** hard vs. soft delete vs. tombstone; Prisma relation `onDelete` (`Cascade`, `SetNull`, `Restrict`); optimistic concurrency (`version` field, `updateMany` with `where: { id, version }` and checking `count`); idempotent DELETE.

**Think first:**
1. Make a table: for each of the 9 surfaces above, what happens when a post is deleted?
2. A reply points to a deleted original. What does the reader see? Better or worse than deleting replies too?
3. Author edits on phone and laptop at once. How does the second save learn it was stale?
4. Is delete a *state change* or a *row removal*? What does each imply for counts?

**Common pitfalls**
- Soft-delete flag added, but half the queries forget the `deletedAt: null` filter (consider centralizing).
- Likes/notifications still pointing at removed content.
- Update DTO accepting `kind` or `authorId`.
- Checking ownership with one query, updating with another, with no atomicity between them.
- Inconsistent 404 vs. 403 for wrong-owner (decide, document, consider enumeration).

**Checkpoint:** a "delete one post, check all 9 surfaces" e2e test. Two-session edit race passes.

**Self-check:** what invariant does your delete policy guarantee? Write it as one sentence.

---

### JS-P0-06 — Notification inbox  ·  Stage 6

**Outcome:** surface important activity **exactly once** to the **correct** recipient.

**Required source events:** new follower or accepted request, like, direct reply, repost.

**Requirements**

- A notification identifies recipient, actor, event type/time, read state, source event, stable target context.
- Self-actions do not notify the same user.
- One source event → at most one logical notification per recipient.
- Inbox is stable, newest-first, cursor-paginated, recipient-only.
- Member can mark one notification or the current eligible set as read.
- Unread count is authoritative and client-independent.
- Removed content and deactivated actors have an explicit display/tombstone policy.
- Document source-action vs. notification failure semantics; a notification cannot claim an action that never committed.
- Delivery is pull-based; real-time is not P0.

**Acceptance**

- Required events reach only the intended recipient once, including retry/concurrency.
- Self-actions create no notification.
- Cross-user reads/writes rejected.
- Repeated read transitions preserve correct unread count.
- Source rollback leaves no false notification.

#### Learning scaffold

**Concepts:** `prisma.$transaction` (interactive vs. array form); same-transaction write vs. after-commit/outbox; unique dedup keys; `count` aggregate vs. denormalized counter; "mark all read" semantics (what is the "current eligible set"?).

**Think first:**
1. Should the notification be written *in the same transaction* as the like? What do you gain and lose? (This is decision #6.)
2. What is the dedup key for "A liked B's post"? What if A unlikes then likes again?
3. "Mark all read" while a new notification arrives mid-request: read or unread? Why?
4. A liked post later gets deleted. What does the inbox show?

**Common pitfalls**
- Two sequential `await prisma...` calls assumed atomic (they are **not**).
- Notification created in a separate call after commit → missing or "ghost" notifications on failure.
- No unique constraint → duplicates on client retries.
- Reading `/notifications/:id` without a recipient check (IDOR).
- Unread count computed client-side or cached incorrectly.
- Notifying yourself.

**Checkpoint:** force a failure after the source write and show zero notifications remain. Retry one like 10× concurrently → 1 notification.

**Self-check:** explain "IDOR" and show the test proving you're not vulnerable.

---

### JS-P0-07 — Security, compatibility, and release controls  ·  Stage 7

**Outcome:** release identity-dependent behavior without regressing v1.

**Requirements**

- Every mutation has an explicit authn and authz decision.
- A route/permission matrix covers anonymous, owner, related user, unrelated user where relevant.
- Unknown fields and unbounded inputs are rejected.
- CORS, credential transport, secrets, production-safe config are documented.
- Auth outcomes are observable without logging credentials/tokens.
- Migrations support a documented forward upgrade from accepted v1 data.
- Test/seed shortcuts cannot impersonate a normal runtime user.
- Contract changes have compatibility or deprecation records.
- Critical writes have PostgreSQL rollback, retry, concurrency, and failure-path evidence.
- Release docs cover migration, configuration, smoke checks, rollback considerations, known limitations.

**Acceptance**

- P0 journey works from a **migrated v1 database** and a **clean checkout**.
- Prior and new suites pass, except approved contract changes.
- Permission matrix has **no unclassified mutation**.
- A reviewer can trace one allowed and one denied request to final state via request IDs.

#### Learning scaffold

**Think first:**
1. How do you *prove* no mutation is missing from the matrix? (Hint: can you enumerate registered routes and diff them against the table? Consider a default-deny global guard with an explicit `@Public()` opt-out.)
2. Why is a migration "rehearsal" different from "it ran once on my laptop"?
3. If release fails halfway, what does rollback mean for already-migrated data?

**Common pitfalls**
- Wildcard CORS with credentials.
- Seed script creating a user that works in production.
- Migrations passing on an empty DB but failing on v1 data (nulls, duplicates, long handles).
- Guard added, but ownership check forgotten in the service ("a guard alone is insufficient").
- Docs written the night before release.

**Checkpoint:** a permission-matrix table checked against the real route list; a recorded migration rehearsal from a v1 snapshot.

---

## Part 6: P1 requirements (stretch, only after all P0 pass)

| ID | Feature | Core ask | You'll learn |
|---|---|---|---|
| JS-P1-01 | People discovery | Search discoverable accounts; privacy/deactivation aware; deterministic pagination; public fields only; bounded, explainable suggestions | Privacy-aware search, indexing, safe projections |
| JS-P1-02 | Bookmarks | Desired-state save/unsave; owner-only, paginated; no duplicates; documented behavior for removed posts | Private collections, uniqueness |
| JS-P1-03 | Conversation expansion | If approved: depth limit, parent/root rules, ordering, deleted-parent display, counts, pagination, no cycles | Trees, bounded traversal, API evolution |
| JS-P1-04 | Notification preferences | Enable categories without changing source action; defaults; future-only vs. historical | Preferences, temporal policy |
| JS-P1-05 | Media publishing | ≤4 images; type/byte/dimension rules; alt text; client metadata not trusted; cleanup on failure | Untrusted files, async boundaries |
| JS-P1-06 | Reporting/moderation | Controlled reasons; duplicate behavior; reviewer-only data; audit state | Roles, audit trails |

> **Easiest first P1 for learning:** JS-P1-02 (Bookmarks). It reuses ownership, uniqueness, and pagination patterns you've already built.

**P2 (do not build):** real-time notifications, ranked recommendations, full blocking/muting, moderation console/appeals, video pipeline, account recovery, verified contacts, data export/erasure, distributed cache/jobs, production-scale deployment.

---

## Part 7: Rules that apply to everything

- Authentication **identifies**; authorization **decides** on the resource.
- Actor, owner, IDs, timestamps, counts, internal states are **server-controlled**.
- Privacy and lifecycle rules apply to **every access path**, not just the main one.
- Relationship operations are desired-state and retry-safe.
- Duplicate prevention holds under concurrency.
- Lists are bounded and deterministically paginated.
- Failed writes never leave unexplained partial success.
- Errors never expose DB/driver internals (watch raw Prisma errors leaking through).
- Counts are derived or transactionally maintained, with a reconciliation plan.

### Non-functional requirements (quick view)

| Area | You must show |
|---|---|
| **Security & privacy** | Least privilege, secret-safe logs, enumeration resistance, cross-user tests, bounded inputs, abuse controls, documented credential protection |
| **Reliability** | Defined atomicity/retry for critical writes; readiness checks dependencies, liveness is a process check; timeouts keep v1 error contract; migration/rollback plan before release |
| **Performance** | Your own latency & query-count budgets for sign-in, home feed, follow change, inbox; DB vs. app vs. client time separated; plan evidence for feed/follow/notification queries; no per-item query growth without approved exception |
| **Accessibility** | Keyboard-operable auth, profile edit, follow controls, notifications; distinct loading/empty/forbidden/expired/retry states; status not by color alone; meaningful alt text |
| **Observability** | Request IDs link safe structured logs. Events: registration, sign-in, profile completion, relationship changes, feed/onboarding views, post lifecycle, notification read, authz denial. Each event documents trigger, allowed/prohibited properties, retry-duplication behavior |

---

## Part 8: JavaScript engineering constraints (with the "why")

| Constraint | Why it matters to you |
|---|---|
| Continue the accepted NestJS/Prisma app; no parallel service | Learn to evolve real code, not restart |
| Keep transport, policy, persistence, and public mapping independently testable | Unit-test rules without HTTP or a DB |
| A guard alone is insufficient when authz depends on loaded ownership/visibility data | Guards know *who*; services know *whose resource* |
| Review migration SQL and DB constraints; TS/Prisma types are not enforcement evidence | Types vanish at runtime; only the DB enforces |
| Measure CPU-heavy credential/media work and event-loop effect | One slow hash can stall every request |
| Multiple awaited Prisma calls are not assumed atomic; transaction boundaries explicit | Two `await`s ≠ one transaction |
| Relation loading, query count, and connection assumptions require evidence | Show logs, not guesses |
| Background work (if any) defines retry, dedup, failure, shutdown | Fire-and-forget is a bug factory |

---

## Part 9: Decisions you must make *before* building

Create a decision record for each. Suggested stage in brackets.

1. Identity/session and revocation model **[Stage 1]**
2. Handle-change and deactivation policy **[Stage 2]**
3. Public/private relationship state model **[Stage 3]**
4. Empty personalized-feed behavior **[Stage 4]**
5. Edit conflict and deletion/tombstone policy **[Stage 5]**
6. Notification consistency/dedup boundary **[Stage 6]**
7. Authorization placement and permission matrix **[Stage 1, finalize Stage 7]**
8. V1 migration/backfill approach **[Stage 4 & 7]**
9. Performance/query budgets **[Stage 4, before coding the feed]**
10. P1 sequence after P0 **[Stage 8]**

---

## Part 10: P0 release gate (final checklist)

- [ ] All JS-P0 features and dependencies pass
- [ ] New and returning member journeys pass end to end
- [ ] Permission matrix reviewed
- [ ] Concurrent registration / follow / notification cases pass
- [ ] Cross-user actions leave state unchanged
- [ ] Feed respects relationship, privacy, account, content state
- [ ] Edit/remove consistent across read surfaces
- [ ] V1 suite passes or has approved compatibility records
- [ ] Migrations work from v1 and from a clean DB
- [ ] Sensitive data absent from responses/logs
- [ ] Query/latency budgets met on representative data
- [ ] Keyboard, empty, loading, expired, forbidden, retry states reviewed
- [ ] API notes, decisions, README, limitations current

**Required evidence bundle:** feature acceptance tests · end-to-end journeys · permission matrix · decision records · PostgreSQL concurrency/rollback tests · query plans & counts · migration rehearsal · security/log review · accessibility findings · learner-led demo.

### Demo guide (learner-led, ~15 min)

1. Run the new-member journey live (register → profile → follow → feed).
2. Show one **denied** cross-user action and prove the DB didn't change.
3. Trace one request through logs using its request ID.
4. Show your hardest decision record and defend the trade-off.
5. State one known limitation honestly.

---

## Part 11: Self-assessment (after P0)

You should be able to answer *without notes*:

1. Why can't `userId` ever come from the request body?
2. How does your system behave when two identical follow requests arrive simultaneously?
3. What guarantees your cursor has no duplicates on equal timestamps?
4. Why must a notification be tied to the source transaction?
5. What breaks if two awaited Prisma calls are assumed atomic?
6. What does your migration do with a v1 user who has no password?
7. Which of the 9 delete surfaces was hardest, and why?

**Outcome:** you can prioritize dependent features, evolve NestJS without burying policy in controllers, design identity and authorization boundaries, propagate ownership/privacy across reads, protect transitions under concurrency, reason about event-loop impact, inspect Prisma migrations/queries/transactions, preserve compatibility, and produce security, performance, and release evidence, all without being handed a solution.
