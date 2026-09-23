// ============================================================================
// Stage C Acceptance Test Suite (PRD 04)
// Tests against live PostgreSQL 17 database
// ============================================================================

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaService } from './prisma/prisma.service.js';
import { FeedRepository } from './feed/feed.repository.js';
import { PostRepository } from './posts/post.repository.js';
import { LikeRepository } from './posts/like.repository.js';
import { ReplyRepository } from './posts/reply.repository.js';
import { UserRepository } from './users/user.repository.js';
import { MediaRepository } from './users/media.repository.js';
import { SearchRepository } from './search/search.repository.js';
import { HealthService } from './health/health.service.js';
import {
  NotFoundException,
  UnprocessableEntityException,
  ConflictException,
} from '@nestjs/common';

describe('PRD 04: Stage C — NestJS & PostgreSQL Integration', () => {
  let prisma: PrismaService;
  let feedRepo: FeedRepository;
  let postRepo: PostRepository;
  let likeRepo: LikeRepository;
  let _replyRepo: ReplyRepository;
  let userRepo: UserRepository;
  let mediaRepo: MediaRepository;
  let searchRepo: SearchRepository;
  let healthService: HealthService;

  const demoUserId = 'a0000000-0000-4000-8000-000000000001'; // Asha

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();

    feedRepo = new FeedRepository(prisma);
    postRepo = new PostRepository(prisma);
    likeRepo = new LikeRepository(prisma);
    _replyRepo = new ReplyRepository(prisma);
    userRepo = new UserRepository(prisma);
    mediaRepo = new MediaRepository(prisma);
    searchRepo = new SearchRepository(prisma);
    healthService = new HealthService(prisma);
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  // --------------------------------------------------------------------------
  // 1. Health & Readiness (JS-D11)
  // --------------------------------------------------------------------------
  describe('Health Probes', () => {
    it('should return ok for liveness probe without database call', () => {
      const live = healthService.getLiveStatus();
      expect(live).toEqual({ status: 'ok' });
    });

    it('should return ready and connected for database readiness probe', async () => {
      const ready = await healthService.getReadyStatus();
      expect(ready).toEqual({ status: 'ready', database: 'connected' });
    });
  });

  // --------------------------------------------------------------------------
  // 2. Feed Pagination & Timestamp Tie Handling (JS-D05)
  // --------------------------------------------------------------------------
  describe('Feed Keyset Pagination & Ties', () => {
    it('should return page 1 with limit=10 and a valid nextCursor', async () => {
      const page1 = await feedRepo.getFeed(10, undefined, demoUserId);

      expect(page1.items.length).toBe(10);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).toBeDefined();
      expect(typeof page1.nextCursor).toBe('string');
    });

    it('should continue to page 2 using tuple cursor across timestamp ties without duplicates or skips', async () => {
      const page1 = await feedRepo.getFeed(10, undefined, demoUserId);
      const page2 = await feedRepo.getFeed(10, page1.nextCursor!, demoUserId);

      expect(page2.items.length).toBe(10);

      const page1Ids = new Set(page1.items.map((i) => i.id));
      const page2Ids = new Set(page2.items.map((i) => i.id));

      // Assert zero duplicates between page 1 and page 2
      for (const id of page2Ids) {
        expect(page1Ids.has(id)).toBe(false);
      }

      // Verify that Post 22 and Post 23 (which share timestamp 13:40:00) appear in strict order
      const allFetched = [...page1.items, ...page2.items];
      const post23Index = allFetched.findIndex((p) => p.id === 'b0000000-0000-4000-8000-000000000023');
      const post22Index = allFetched.findIndex((p) => p.id === 'b0000000-0000-4000-8000-000000000022');

      expect(post23Index).toBeGreaterThan(-1);
      expect(post22Index).toBeGreaterThan(-1);
      // Post 23 must precede Post 22 due to UUID tie-break DESC
      expect(post23Index).toBeLessThan(post22Index);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Batch Aggregation & No N+1 Loops (JS-D08)
  // --------------------------------------------------------------------------
  describe('Batch Metrics & Response Shapes', () => {
    it('should accurately return reaction counts and viewer state without inflating counts', async () => {
      const post1Detail = await postRepo.getPostById('b0000000-0000-4000-8000-000000000001', demoUserId);

      expect(post1Detail).not.toBeNull();
      const item = post1Detail!.item;

      expect(item.id).toBe('b0000000-0000-4000-8000-000000000001');
      expect(item.likeCount).toBe(4);
      expect(item.replyCount).toBe(3);
      expect(item.media.length).toBe(1);
      expect(item.author.handle).toBe('asha');
    });

    it('should return scalar 0 for posts with zero likes and replies', async () => {
      const post30Detail = await postRepo.getPostById('b0000000-0000-4000-8000-000000000030', demoUserId);

      expect(post30Detail).not.toBeNull();
      expect(post30Detail!.item.likeCount).toBe(0);
      expect(post30Detail!.item.replyCount).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // 4. Writes, Target Kind Checks, and Conflicts (JS-D06)
  // --------------------------------------------------------------------------
  describe('Domain Writes & Constraints', () => {
    it('should throw NotFoundException (404) when replying to a nonexistent post', async () => {
      await expect(
        postRepo.createPost(demoUserId, {
          kind: 'reply',
          text: 'Reply to phantom post',
          replyToId: 'b0000000-0000-4000-8000-999999999999',
        })
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw UnprocessableEntityException (422) when replying to a non-original post (reply)', async () => {
      await expect(
        postRepo.createPost(demoUserId, {
          kind: 'reply',
          text: 'Nested reply attempt',
          replyToId: 'c0000000-0000-4000-8000-000000000001', // This is a reply
        })
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should throw ConflictException (409) when a user attempts to duplicate a repost', async () => {
      // Asha has already reposted Post 2 (d...0001)
      await expect(
        postRepo.createPost(demoUserId, {
          kind: 'repost',
          repostOfId: 'b0000000-0000-4000-8000-000000000002',
        })
      ).rejects.toThrow(ConflictException);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Desired-State Likes, Idempotency & Concurrency (JS-D06)
  // --------------------------------------------------------------------------
  describe('Desired-State Likes', () => {
    const targetPost = 'b0000000-0000-4000-8000-000000000011';
    const testUser = 'a0000000-0000-4000-8000-000000000005'; // Sara

    it('should idempotently like a post repeatedly without error or toggle surprise', async () => {
      const res1 = await likeRepo.setLike(targetPost, testUser, true);
      expect(res1.likedByViewer).toBe(true);

      const res2 = await likeRepo.setLike(targetPost, testUser, true);
      expect(res2.likedByViewer).toBe(true);
      expect(res2.likeCount).toBe(res1.likeCount);
    });

    it('should idempotently unlike a post repeatedly without error', async () => {
      const res1 = await likeRepo.setLike(targetPost, testUser, false);
      expect(res1.likedByViewer).toBe(false);

      const res2 = await likeRepo.setLike(targetPost, testUser, false);
      expect(res2.likedByViewer).toBe(false);
      expect(res2.likeCount).toBe(res1.likeCount);
    });

    it('should handle concurrent duplicate like intents safely and return coherent state', async () => {
      const [callA, callB] = await Promise.all([
        likeRepo.setLike(targetPost, testUser, true),
        likeRepo.setLike(targetPost, testUser, true),
      ]);

      expect(callA.likedByViewer).toBe(true);
      expect(callB.likedByViewer).toBe(true);
      expect(callA.likeCount).toBe(callB.likeCount);

      // Clean up test like
      await likeRepo.setLike(targetPost, testUser, false);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Transaction Rollback & Controlled Failure (JS-D07)
  // --------------------------------------------------------------------------
  describe('Transactional Rollback', () => {
    it('should verify that a failed transaction leaves zero partial records in the database', async () => {
      const testPostId = 'b0000000-0000-4000-8000-000000000012';
      const actorId = demoUserId;

      // Verify not liked before
      const initialLike = await prisma.postLike.findUnique({
        where: { postId_userId: { postId: testPostId, userId: actorId } },
      });
      expect(initialLike).toBeNull();

      // Execute transaction with a valid first write and deliberate invalid second write
      await expect(
        prisma.$transaction(async (tx) => {
          // Valid write
          await tx.postLike.create({
            data: {
              postId: testPostId,
              userId: actorId,
            },
          });

          // Deliberate invalid write (foreign key violation)
          await tx.post.create({
            data: {
              authorId: 'a0000000-0000-4000-8000-999999999999', // Non-existent user
              kind: 'original',
              text: 'This write must fail and roll back the whole transaction',
            },
          });
        })
      ).rejects.toThrow();

      // Fresh read to prove partial like was rolled back
      const postRollbackLike = await prisma.postLike.findUnique({
        where: { postId_userId: { postId: testPostId, userId: actorId } },
      });
      expect(postRollbackLike).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // 7. Profile Zero-State & Profile Media (JS-D03)
  // --------------------------------------------------------------------------
  describe('Profile & Media Queries', () => {
    it('should return profile statistics for ghost_user with zero values without inner-join disappearance', async () => {
      const profile = await userRepo.getUserById('ghost_user');

      expect(profile.item.handle).toBe('ghost_user');
      expect(profile.item.postCount).toBe(0);
      expect(profile.item.followerCount).toBe(0);
      expect(profile.item.followingCount).toBe(0);
    });

    it('should return empty items array for ghost_user profile media', async () => {
      const media = await mediaRepo.getMediaByUserId('ghost_user', 10);

      expect(media.items).toEqual([]);
      expect(media.hasMore).toBe(false);
      expect(media.nextCursor).toBeNull();
    });
  });

  // --------------------------------------------------------------------------
  // 8. Literal Search with Escaped Wildcards (JS-D03)
  // --------------------------------------------------------------------------
  describe('Search Originals', () => {
    it('should find literal text containing percentage and underscore characters', async () => {
      const searchRes = await searchRepo.searchOriginals('100% pure SQL', 10);

      expect(searchRes.items.length).toBeGreaterThanOrEqual(1);
      expect(searchRes.items[0].text).toContain('100% pure SQL');
    });
  });
});
