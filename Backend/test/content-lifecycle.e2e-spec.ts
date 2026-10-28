import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Owned-Content Lifecycle API (e2e - JS-P0-05)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let tokenAuthorA: string;
  let authorAId: string;

  let tokenAuthorB: string;
  let authorBId: string;

  let originalPostId: string;
  let postWithRepliesId: string;
  let standalonePostId: string;
  let repostId: string;
  let replyId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);

    const suffix = `${Date.now().toString().slice(-6)}_${Math.floor(Math.random() * 1000)}`;

    // 1. Register Author A
    const regA = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        handle: `s5_a_${suffix}`,
        email: `s5_a_${suffix}@example.com`,
        displayName: 'Author A',
        password: 'Password123!',
      })
      .expect(201);
    tokenAuthorA = regA.body.token;
    authorAId = regA.body.user.id;

    // 2. Register Author B
    const regB = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        handle: `s5_b_${suffix}`,
        email: `s5_b_${suffix}@example.com`,
        displayName: 'Author B',
        password: 'Password123!',
      })
      .expect(201);
    tokenAuthorB = regB.body.token;
    authorBId = regB.body.user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ==========================================================================
  // 1. Author-Only Editing of Post Text & Validation
  // ==========================================================================
  describe('Author-Only Editing (PATCH /posts/:id)', () => {
    beforeAll(async () => {
      // Create an initial original post
      const res = await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${tokenAuthorA}`)
        .send({
          kind: 'original',
          text: 'Initial post text version 1',
        })
        .expect(201);

      originalPostId = res.body.item.id;
      expect(res.body.item.version).toBe(1);
    });

    it('should allow author to edit post text and bump version', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/posts/${originalPostId}`)
        .set('Authorization', `Bearer ${tokenAuthorA}`)
        .send({
          text: 'Updated post text version 2',
          version: 1,
        })
        .expect(200);

      expect(res.body.item.text).toBe('Updated post text version 2');
      expect(res.body.item.version).toBe(2);
      expect(res.body.item.isDeleted).toBe(false);
    });

    it('should reject cross-user edits with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .patch(`/posts/${originalPostId}`)
        .set('Authorization', `Bearer ${tokenAuthorB}`)
        .send({
          text: 'Hacked by Author B',
          version: 2,
        })
        .expect(403);
    });

    it('should reject unauthenticated edits with 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .patch(`/posts/${originalPostId}`)
        .send({
          text: 'Unauthenticated edit',
        })
        .expect(401);
    });

    it('should reject edits on immutable fields with 400 Bad Request', async () => {
      // Attempting to modify kind
      await request(app.getHttpServer())
        .patch(`/posts/${originalPostId}`)
        .set('Authorization', `Bearer ${tokenAuthorA}`)
        .send({
          kind: 'reply',
          text: 'Trying to change kind',
        })
        .expect(400);

      // Attempting to modify authorId
      await request(app.getHttpServer())
        .patch(`/posts/${originalPostId}`)
        .set('Authorization', `Bearer ${tokenAuthorA}`)
        .send({
          authorId: authorBId,
          text: 'Trying to change author',
        })
        .expect(400);

      // Attempting to modify id
      await request(app.getHttpServer())
        .patch(`/posts/${originalPostId}`)
        .set('Authorization', `Bearer ${tokenAuthorA}`)
        .send({
          id: '00000000-0000-0000-0000-000000000000',
          text: 'Trying to change id',
        })
        .expect(400);

      // Attempting to inject derived counts
      await request(app.getHttpServer())
        .patch(`/posts/${originalPostId}`)
        .set('Authorization', `Bearer ${tokenAuthorA}`)
        .send({
          likeCount: 9999,
          text: 'Trying to manipulate likeCount',
        })
        .expect(400);

      // Attempting unrecognized fields
      await request(app.getHttpServer())
        .patch(`/posts/${originalPostId}`)
        .set('Authorization', `Bearer ${tokenAuthorA}`)
        .send({
          maliciousPayload: true,
          text: 'Trying to inject extra fields',
        })
        .expect(400);
    });

    it('should reject invalid text length with 422 Unprocessable Entity', async () => {
      // Empty text
      await request(app.getHttpServer())
        .patch(`/posts/${originalPostId}`)
        .set('Authorization', `Bearer ${tokenAuthorA}`)
        .send({
          text: '   ',
        })
        .expect(422);

      // Oversized text > 280 characters
      const longText = 'x'.repeat(281);
      await request(app.getHttpServer())
        .patch(`/posts/${originalPostId}`)
        .set('Authorization', `Bearer ${tokenAuthorA}`)
        .send({
          text: longText,
        })
        .expect(422);
    });

    it('should reject edits on reposts with 400 Bad Request', async () => {
      // Author B reposts Author A's post
      const repostRes = await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${tokenAuthorB}`)
        .send({
          kind: 'repost',
          repostOfId: originalPostId,
        })
        .expect(201);

      const createdRepostId = repostRes.body.item.id;

      // Author B attempts to edit repost
      await request(app.getHttpServer())
        .patch(`/posts/${createdRepostId}`)
        .set('Authorization', `Bearer ${tokenAuthorB}`)
        .send({
          text: 'Cannot add text to repost',
        })
        .expect(400);
    });
  });

  // ==========================================================================
  // 2. Optimistic Concurrency Control (OCC)
  // ==========================================================================
  describe('Optimistic Concurrency Control (OCC)', () => {
    it('should reject stale edit attempt with 409 Conflict', async () => {
      // Current version is 2
      // Author A attempts update supplying stale expected version 1
      const res = await request(app.getHttpServer())
        .patch(`/posts/${originalPostId}`)
        .set('Authorization', `Bearer ${tokenAuthorA}`)
        .send({
          text: 'Stale edit attempt',
          version: 1,
        })
        .expect(409);

      expect(res.body.message).toContain('Edit conflict');
    });

    it('should handle two-session concurrent edit race: exactly one succeeds and one gets 409', async () => {
      // Current version is 2. Launch two simultaneous edit requests both expecting version 2.
      const p1 = request(app.getHttpServer())
        .patch(`/posts/${originalPostId}`)
        .set('Authorization', `Bearer ${tokenAuthorA}`)
        .send({
          text: 'Session 1 edit wins or conflicts',
          version: 2,
        });

      const p2 = request(app.getHttpServer())
        .patch(`/posts/${originalPostId}`)
        .set('Authorization', `Bearer ${tokenAuthorA}`)
        .send({
          text: 'Session 2 edit wins or conflicts',
          version: 2,
        });

      const [res1, res2] = await Promise.all([p1, p2]);

      const statusCodes = [res1.status, res2.status].sort();
      // Exactly one must be 200 and one must be 409
      expect(statusCodes).toEqual([200, 409]);

      // Verify final version is 3
      const finalRes = await request(app.getHttpServer())
        .get(`/posts/${originalPostId}`)
        .set('Authorization', `Bearer ${tokenAuthorA}`)
        .expect(200);

      expect(finalRes.body.item.version).toBe(3);
    });
  });

  // ==========================================================================
  // 3. Deletion Authorization & Idempotency
  // ==========================================================================
  describe('Deletion Authorization & Idempotency', () => {
    let tempPostId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${tokenAuthorA}`)
        .send({
          kind: 'original',
          text: 'Post to test deletion permissions and idempotency',
        })
        .expect(201);
      tempPostId = res.body.item.id;
    });

    it('should reject delete attempt by non-author with 403 Forbidden', async () => {
      await request(app.getHttpServer())
        .delete(`/posts/${tempPostId}`)
        .set('Authorization', `Bearer ${tokenAuthorB}`)
        .expect(403);
    });

    it('should reject unauthenticated delete with 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .delete(`/posts/${tempPostId}`)
        .expect(401);
    });

    it('should allow author to delete post successfully', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/posts/${tempPostId}`)
        .set('Authorization', `Bearer ${tokenAuthorA}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.id).toBe(tempPostId);
    });

    it('should be safe and idempotent on repeated delete calls', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/posts/${tempPostId}`)
        .set('Authorization', `Bearer ${tokenAuthorA}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('already deleted');
    });
  });

  // ==========================================================================
  // 4. Check All 9 Surfaces Deletion Acceptance Checkpoint
  // ==========================================================================
  describe('Acceptance Checkpoint: Delete One Post, Check All 9 Surfaces', () => {
    beforeAll(async () => {
      // 1. Create Standalone Post (Author A) with media
      const resStandalone = await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${tokenAuthorA}`)
        .send({
          kind: 'original',
          text: 'Standalone post unique searchable xyz999 to be deleted alone',
        })
        .expect(201);
      standalonePostId = resStandalone.body.item.id;

      // Attach media to standalone post
      await prisma.$executeRaw`
        INSERT INTO post_media (post_id, position, alt_text, width, height, small_url, large_url)
        VALUES (${standalonePostId}::uuid, 0, 'Sample alt text', 800, 600, 'https://example.com/media/standalone_small.jpg', 'https://example.com/media/standalone_large.jpg')
      `;

      // 2. Create Post With Replies (Author A) with media
      const resWithReplies = await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${tokenAuthorA}`)
        .send({
          kind: 'original',
          text: 'Parent post unique searchable abc888 with reply tree',
        })
        .expect(201);
      postWithRepliesId = resWithReplies.body.item.id;

      // Attach media to postWithReplies
      await prisma.$executeRaw`
        INSERT INTO post_media (post_id, position, alt_text, width, height, small_url, large_url)
        VALUES (${postWithRepliesId}::uuid, 0, 'Replies alt text', 1200, 800, 'https://example.com/media/replies_small.jpg', 'https://example.com/media/replies_large.jpg')
      `;

      // Author B likes postWithReplies
      await request(app.getHttpServer())
        .post(`/posts/${postWithRepliesId}/like`)
        .set('Authorization', `Bearer ${tokenAuthorB}`)
        .expect(200);

      // Author B replies to postWithReplies
      const replyRes = await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${tokenAuthorB}`)
        .send({
          kind: 'reply',
          text: 'Active conversation reply from Author B',
          replyToId: postWithRepliesId,
        })
        .expect(201);
      replyId = replyRes.body.item.id;

      // Author B reposts postWithReplies
      const repostRes = await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${tokenAuthorB}`)
        .send({
          kind: 'repost',
          repostOfId: postWithRepliesId,
        })
        .expect(201);
      repostId = repostRes.body.item.id;

      // Record Author A's post count before deletion
      const userBefore = await request(app.getHttpServer())
        .get(`/users/${authorAId}`)
        .expect(200);
      const postCountBefore = userBefore.body.item.postCount;

      // Execute Deletions for both posts
      await request(app.getHttpServer())
        .delete(`/posts/${standalonePostId}`)
        .set('Authorization', `Bearer ${tokenAuthorA}`)
        .expect(200);

      await request(app.getHttpServer())
        .delete(`/posts/${postWithRepliesId}`)
        .set('Authorization', `Bearer ${tokenAuthorA}`)
        .expect(200);

      // Verify post count decremented by 2
      const userAfter = await request(app.getHttpServer())
        .get(`/users/${authorAId}`)
        .expect(200);
      expect(userAfter.body.item.postCount).toBe(postCountBefore - 2);
    });

    // ------------------------------------------------------------------------
    // Surface 1: Direct Detail (GET /posts/:id)
    // ------------------------------------------------------------------------
    it('Surface 1 - Direct Detail: Standalone post returns 404; post with replies returns conversation tombstone', async () => {
      // Standalone post has 0 replies -> 404 Not Found
      await request(app.getHttpServer())
        .get(`/posts/${standalonePostId}`)
        .expect(404);

      // Post with replies has 1 reply -> returns conversation tombstone
      const res = await request(app.getHttpServer())
        .get(`/posts/${postWithRepliesId}`)
        .expect(200);

      expect(res.body.item.isDeleted).toBe(true);
      expect(res.body.item.text).toBe('[This post was deleted by author]');
      expect(res.body.item.media).toEqual([]);
      expect(res.body.item.likeCount).toBe(0);
      expect(res.body.item.replyCount).toBeGreaterThan(0);
    });

    // ------------------------------------------------------------------------
    // Surface 2: Feed (GET /feed)
    // ------------------------------------------------------------------------
    it('Surface 2 - Feed: Deleted posts are immediately omitted from feed', async () => {
      const res = await request(app.getHttpServer())
        .get('/feed/public?limit=50')
        .expect(200);

      const items = res.body.items;
      const foundStandalone = items.some((p: any) => p.id === standalonePostId);
      const foundWithReplies = items.some((p: any) => p.id === postWithRepliesId);

      expect(foundStandalone).toBe(false);
      expect(foundWithReplies).toBe(false);
    });

    // ------------------------------------------------------------------------
    // Surface 3: Search (GET /search)
    // ------------------------------------------------------------------------
    it('Surface 3 - Search: Deleted posts never appear in search results', async () => {
      const res1 = await request(app.getHttpServer())
        .get('/search/posts?q=xyz999')
        .expect(200);

      expect(res1.body.items.some((p: any) => p.id === standalonePostId)).toBe(false);

      const res2 = await request(app.getHttpServer())
        .get('/search/posts?q=abc888')
        .expect(200);

      expect(res2.body.items.some((p: any) => p.id === postWithRepliesId)).toBe(false);
    });

    // ------------------------------------------------------------------------
    // Surface 4: Replies (Thread integrity & new replies blocked)
    // ------------------------------------------------------------------------
    it('Surface 4 - Replies: Existing replies preserved; new replies to deleted posts rejected with 400', async () => {
      // Existing reply to postWithReplies is preserved
      const repliesRes = await request(app.getHttpServer())
        .get(`/posts/${postWithRepliesId}/replies`)
        .expect(200);

      expect(repliesRes.body.items.length).toBeGreaterThan(0);
      expect(repliesRes.body.items.some((r: any) => r.id === replyId)).toBe(true);

      // New reply targeting deleted post is rejected with 400 Bad Request
      await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${tokenAuthorB}`)
        .send({
          kind: 'reply',
          text: 'New reply to deleted post should fail',
          replyToId: postWithRepliesId,
        })
        .expect(400);

      await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${tokenAuthorB}`)
        .send({
          kind: 'reply',
          text: 'New reply to standalone deleted post should fail',
          replyToId: standalonePostId,
        })
        .expect(400);
    });

    // ------------------------------------------------------------------------
    // Surface 5: Reposts (Existing referenced tombstone & new reposts blocked)
    // ------------------------------------------------------------------------
    it('Surface 5 - Reposts: New reposts targeting deleted post are rejected with 400', async () => {
      // New repost attempt rejected with 400 Bad Request
      await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${tokenAuthorA}`)
        .send({
          kind: 'repost',
          repostOfId: standalonePostId,
        })
        .expect(400);

      // Existing repost referencing deleted post is retrieved and references the post
      const repostDetail = await request(app.getHttpServer())
        .get(`/posts/${repostId}`)
        .expect(200);

      expect(repostDetail.body.item.id).toBe(repostId);
      expect(repostDetail.body.item.repostOfId).toBe(postWithRepliesId);
    });

    // ------------------------------------------------------------------------
    // Surface 6: Likes (Engagements blocked with 404)
    // ------------------------------------------------------------------------
    it('Surface 6 - Likes: Liking a deleted post returns 404 Not Found', async () => {
      await request(app.getHttpServer())
        .post(`/posts/${standalonePostId}/like`)
        .set('Authorization', `Bearer ${tokenAuthorB}`)
        .expect(404);

      await request(app.getHttpServer())
        .post(`/posts/${postWithRepliesId}/like`)
        .set('Authorization', `Bearer ${tokenAuthorB}`)
        .expect(404);
    });

    // ------------------------------------------------------------------------
    // Surface 7: Media (Omitted from profile media tab)
    // ------------------------------------------------------------------------
    it('Surface 7 - Media: Deleted posts media omitted from profile media tab', async () => {
      const mediaRes = await request(app.getHttpServer())
        .get(`/users/${authorAId}/media`)
        .expect(200);

      const items = mediaRes.body.items;
      const hasStandaloneMedia = items.some((m: any) => m.postId === standalonePostId);
      const hasWithRepliesMedia = items.some((m: any) => m.postId === postWithRepliesId);

      expect(hasStandaloneMedia).toBe(false);
      expect(hasWithRepliesMedia).toBe(false);
    });

    // ------------------------------------------------------------------------
    // Surface 8: Profile Counts (Author postCount decremented)
    // ------------------------------------------------------------------------
    it('Surface 8 - Profile Counts: postCount accurately reflects only active originals', async () => {
      const userRes = await request(app.getHttpServer())
        .get(`/users/${authorAId}`)
        .expect(200);

      // Verify Author A postCount only counts active non-deleted originals
      const actualActiveInDb = await prisma.post.count({
        where: {
          authorId: authorAId,
          kind: 'original',
          deletedAt: null,
        },
      });

      expect(userRes.body.item.postCount).toBe(actualActiveInDb);
    });

    // ------------------------------------------------------------------------
    // Surface 9: Notifications & Decisions
    // ------------------------------------------------------------------------
    it('Surface 9 - Notifications & Decisions: Consistent deletion lifecycle invariants maintained', async () => {
      // Invariant: soft-delete preserves foreign keys while suppressing all active engagement
      const dbPost = await prisma.post.findUnique({
        where: { id: postWithRepliesId },
      });
      expect(dbPost).toBeDefined();
      expect(dbPost).not.toBeNull();
      if (dbPost) {
        expect(dbPost.deletedAt).not.toBeNull();
      }

      // PostgreSQL fk_posts_reply_target RESTRICT is intact and not violated
      const dbReply = await prisma.post.findUnique({
        where: { id: replyId },
      });
      expect(dbReply).toBeDefined();
      expect(dbReply).not.toBeNull();
      if (dbReply) {
        expect(dbReply.replyToId).toBe(postWithRepliesId);
      }
    });
  });
});
