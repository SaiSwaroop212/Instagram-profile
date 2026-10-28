import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Follow Graph and Privacy API (e2e - JS-P0-03)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let tokenUser1: string;
  let user1Id: string;

  let _tokenUser2: string;
  let user2Id: string;

  let tokenUserPriv: string;
  let userPrivId: string;

  let tokenUserReq: string;
  let userReqId: string;

  let tokenAttacker: string;
  let _attackerId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);

    // Register User 1
    const reg1 = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        handle: 'stage3_user_1',
        displayName: 'User 1',
        password: 'Password123!',
      });
    tokenUser1 = reg1.body.token;
    user1Id = reg1.body.user.id;

    // Register User 2
    const reg2 = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        handle: 'stage3_user_2',
        displayName: 'User 2',
        password: 'Password123!',
      });
    _tokenUser2 = reg2.body.token;
    user2Id = reg2.body.user.id;

    // Register User Priv (will become private)
    const regPriv = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        handle: 'stage3_user_priv',
        displayName: 'User Private',
        password: 'Password123!',
      });
    tokenUserPriv = regPriv.body.token;
    userPrivId = regPriv.body.user.id;

    // Register User Req
    const regReq = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        handle: 'stage3_user_req',
        displayName: 'User Requester',
        password: 'Password123!',
      });
    tokenUserReq = regReq.body.token;
    userReqId = regReq.body.user.id;

    // Register Attacker
    const regAttacker = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        handle: 'stage3_user_attacker',
        displayName: 'Attacker User',
        password: 'Password123!',
      });
    tokenAttacker = regAttacker.body.token;
    _attackerId = regAttacker.body.user.id;
  });

  afterAll(async () => {
    await prisma.follow.deleteMany({
      where: {
        OR: [
          { follower: { handle: { startsWith: 'stage3_' } } },
          { following: { handle: { startsWith: 'stage3_' } } },
        ],
      },
    });

    await prisma.post.deleteMany({
      where: { author: { handle: { startsWith: 'stage3_' } } },
    });

    await prisma.authSession.deleteMany({
      where: { user: { handle: { startsWith: 'stage3_' } } },
    });

    await prisma.user.deleteMany({
      where: { handle: { startsWith: 'stage3_' } },
    });

    await app.close();
  });

  // ==========================================================================
  // 1. Desired-State Follow & Unfollow (Public Accounts)
  // ==========================================================================
  describe('Desired-State Follow & Unfollow (Public Accounts)', () => {
    it('should allow User 1 to follow User 2 and return active relationship', async () => {
      const res = await request(app.getHttpServer())
        .post(`/users/${user2Id}/follow`)
        .set('Authorization', `Bearer ${tokenUser1}`)
        .expect(200);

      expect(res.body.following).toBe(true);
      expect(res.body.status).toBe('accepted');
      expect(res.body.followerCount).toBe(1);

      // Verify row in database
      const row = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: user1Id,
            followingId: user2Id,
          },
        },
      });
      expect(row).toBeDefined();
      expect(row?.status).toBe('accepted');
    });

    it('should be retry-safe: repeating follow returns 200 and leaves exactly 1 row', async () => {
      const res = await request(app.getHttpServer())
        .post(`/users/${user2Id}/follow`)
        .set('Authorization', `Bearer ${tokenUser1}`)
        .expect(200);

      expect(res.body.following).toBe(true);
      expect(res.body.status).toBe('accepted');

      const count = await prisma.follow.count({
        where: { followerId: user1Id, followingId: user2Id },
      });
      expect(count).toBe(1);
    });

    it('should reflect relationship state on GET /users/:id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/users/${user2Id}`)
        .set('Authorization', `Bearer ${tokenUser1}`)
        .expect(200);

      expect(res.body.item.following).toBe(true);
      expect(res.body.item.relationship.following).toBe(true);
      expect(res.body.item.relationship.status).toBe('accepted');
      expect(res.body.item.followerCount).toBe(1);
    });

    it('should unfollow User 2 and return following: false', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/users/${user2Id}/follow`)
        .set('Authorization', `Bearer ${tokenUser1}`)
        .expect(200);

      expect(res.body.following).toBe(false);
      expect(res.body.status).toBe('none');
      expect(res.body.followerCount).toBe(0);

      const row = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: user1Id,
            followingId: user2Id,
          },
        },
      });
      expect(row).toBeNull();
    });

    it('should be retry-safe: repeating unfollow returns 200 without error', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/users/${user2Id}/follow`)
        .set('Authorization', `Bearer ${tokenUser1}`)
        .expect(200);

      expect(res.body.following).toBe(false);
      expect(res.body.status).toBe('none');
    });
  });

  // ==========================================================================
  // 2. Self-Follow Prevention
  // ==========================================================================
  describe('Self-Follow Prevention', () => {
    it('should reject self-follow with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post(`/users/${user1Id}/follow`)
        .set('Authorization', `Bearer ${tokenUser1}`)
        .expect(400);

      expect(res.body.message).toContain('Users cannot follow themselves');
    });

    it('should prevent self-follow at PostgreSQL engine level via CHECK constraint', async () => {
      await expect(
        prisma.follow.create({
          data: {
            followerId: user1Id,
            followingId: user1Id,
            status: 'accepted',
          },
        })
      ).rejects.toThrow();
    });
  });

  // ==========================================================================
  // 3. CHECKPOINT: 50 Concurrent Follow Requests -> Exactly 1 Row
  // ==========================================================================
  describe('CHECKPOINT: 50 Concurrent Follow Requests', () => {
    it('50 concurrent follow requests for one pair yield exactly 1 database row', async () => {
      // Register a pair for concurrency testing
      const regA = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          handle: 'stage3_conc_a',
          displayName: 'Concurrent A',
          password: 'Password123!',
        });
      const tokenConcA = regA.body.token;
      const userConcAId = regA.body.user.id;

      const regB = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          handle: 'stage3_conc_b',
          displayName: 'Concurrent B',
          password: 'Password123!',
        });
      const userConcBId = regB.body.user.id;

      // Fire 50 simultaneous follow requests
      const promises = Array.from({ length: 50 }, () =>
        request(app.getHttpServer())
          .post(`/users/${userConcBId}/follow`)
          .set('Authorization', `Bearer ${tokenConcA}`)
      );

      const results = await Promise.all(promises);

      // All requests must return HTTP 200
      for (const res of results) {
        expect(res.status).toBe(200);
        expect(res.body.following).toBe(true);
      }

      // Database check: exactly 1 row exists
      const totalRows = await prisma.follow.count({
        where: {
          followerId: userConcAId,
          followingId: userConcBId,
        },
      });
      expect(totalRows).toBe(1);
    });
  });

  // ==========================================================================
  // 4. Private Accounts & State Machine Lifecycle
  // ==========================================================================
  describe('Private Accounts & State Machine Lifecycle', () => {
    it('should allow User Priv to toggle account to private', async () => {
      const res = await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${tokenUserPriv}`)
        .send({ isPrivate: true })
        .expect(200);

      expect(res.body.item.isPrivate).toBe(true);
    });

    it('should transition to PENDING when following a private account', async () => {
      const res = await request(app.getHttpServer())
        .post(`/users/${userPrivId}/follow`)
        .set('Authorization', `Bearer ${tokenUserReq}`)
        .expect(200);

      expect(res.body.following).toBe(false);
      expect(res.body.status).toBe('pending');
      expect(res.body.followerCount).toBe(0);

      const row = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: userReqId,
            followingId: userPrivId,
          },
        },
      });
      expect(row?.status).toBe('pending');
    });

    it('should not increment followerCount while in PENDING state', async () => {
      const profile = await request(app.getHttpServer())
        .get(`/users/${userPrivId}`)
        .expect(200);

      expect(profile.body.item.followerCount).toBe(0);
    });

    it('should allow requester to cancel pending request via unfollow', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/users/${userPrivId}/follow`)
        .set('Authorization', `Bearer ${tokenUserReq}`)
        .expect(200);

      expect(res.body.following).toBe(false);
      expect(res.body.status).toBe('none');

      const row = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: userReqId,
            followingId: userPrivId,
          },
        },
      });
      expect(row).toBeNull();
    });

    it('should allow target to reject a pending follow request', async () => {
      // Re-create pending request
      await request(app.getHttpServer())
        .post(`/users/${userPrivId}/follow`)
        .set('Authorization', `Bearer ${tokenUserReq}`)
        .expect(200);

      // Target rejects request
      const res = await request(app.getHttpServer())
        .post(`/users/requests/${userReqId}/reject`)
        .set('Authorization', `Bearer ${tokenUserPriv}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('rejected');

      const row = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: userReqId,
            followingId: userPrivId,
          },
        },
      });
      expect(row).toBeNull();
    });

    it('should allow target to accept a pending follow request', async () => {
      // Re-create pending request
      await request(app.getHttpServer())
        .post(`/users/${userPrivId}/follow`)
        .set('Authorization', `Bearer ${tokenUserReq}`)
        .expect(200);

      // Target accepts request
      const res = await request(app.getHttpServer())
        .post(`/users/requests/${userReqId}/accept`)
        .set('Authorization', `Bearer ${tokenUserPriv}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.status).toBe('accepted');

      // Now relationship is active
      const profile = await request(app.getHttpServer())
        .get(`/users/${userPrivId}`)
        .set('Authorization', `Bearer ${tokenUserReq}`)
        .expect(200);

      expect(profile.body.item.following).toBe(true);
      expect(profile.body.item.followerCount).toBe(1);
    });
  });

  // ==========================================================================
  // 5. Illegal Transitions Protection
  // ==========================================================================
  describe('Illegal Transitions Protection', () => {
    it('should reject unauthorized third-party attempt to accept follow request', async () => {
      // Register third party
      const regC = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          handle: 'stage3_third_party',
          displayName: 'Third Party',
          password: 'Password123!',
        });
      const tokenThirdParty = regC.body.token;

      // Third party tries to accept a request directed to User Priv
      await request(app.getHttpServer())
        .post(`/users/requests/${userReqId}/accept`)
        .set('Authorization', `Bearer ${tokenThirdParty}`)
        .expect(404);
    });

    it('should reject requester trying to accept their own follow request', async () => {
      await request(app.getHttpServer())
        .post(`/users/requests/${userPrivId}/accept`)
        .set('Authorization', `Bearer ${tokenUserReq}`)
        .expect(404);
    });
  });

  // ==========================================================================
  // 6. Bounded Cursor-Paginated Follower and Following Lists
  // ==========================================================================
  describe('Cursor-Paginated Follower and Following Lists', () => {
    it('should return paginated followers of User 2', async () => {
      // Ensure User 1 follows User 2
      await request(app.getHttpServer())
        .post(`/users/${user2Id}/follow`)
        .set('Authorization', `Bearer ${tokenUser1}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/users/${user2Id}/followers?limit=10`)
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.some((u: any) => u.id === user1Id)).toBe(true);
    });

    it('should return paginated following list of User 1', async () => {
      const res = await request(app.getHttpServer())
        .get(`/users/${user1Id}/following?limit=10`)
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.some((u: any) => u.id === user2Id)).toBe(true);
    });

    it('should reject out-of-range pagination limits (< 1 or > 50) with 400', async () => {
      await request(app.getHttpServer())
        .get(`/users/${user2Id}/followers?limit=0`)
        .expect(400);

      await request(app.getHttpServer())
        .get(`/users/${user2Id}/followers?limit=100`)
        .expect(400);
    });
  });

  // ==========================================================================
  // 7. Cross-Surface Privacy Leak Prevention
  // ==========================================================================
  describe('Cross-Surface Privacy Leak Prevention', () => {
    let privatePostId: string;

    beforeAll(async () => {
      // User Priv creates an original post
      const postRes = await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${tokenUserPriv}`)
        .send({
          kind: 'original',
          text: 'Super Secret 100% Private Post #stage3',
        });
      privatePostId = postRes.body.item.id;
    });

    it('should reject unauthorized viewer from reading direct post detail with 403', async () => {
      await request(app.getHttpServer())
        .get(`/posts/${privatePostId}`)
        .set('Authorization', `Bearer ${tokenAttacker}`)
        .expect(403);
    });

    it('should reject anonymous viewer from reading direct post detail with 403', async () => {
      await request(app.getHttpServer())
        .get(`/posts/${privatePostId}`)
        .expect(403);
    });

    it('should reject unauthorized viewer from reading private media feed with 403', async () => {
      await request(app.getHttpServer())
        .get(`/users/${userPrivId}/media`)
        .set('Authorization', `Bearer ${tokenAttacker}`)
        .expect(403);
    });

    it('should exclude private posts from global feed for unauthorized users', async () => {
      const res = await request(app.getHttpServer())
        .get('/feed?limit=20')
        .set('Authorization', `Bearer ${tokenAttacker}`)
        .expect(200);

      const found = res.body.items.some((p: any) => p.id === privatePostId);
      expect(found).toBe(false);
    });

    it('should exclude private posts from search results for unauthorized users', async () => {
      const res = await request(app.getHttpServer())
        .get('/search/posts?q=Secret')
        .set('Authorization', `Bearer ${tokenAttacker}`)
        .expect(200);

      const found = res.body.items.some((p: any) => p.id === privatePostId);
      expect(found).toBe(false);
    });

    it('should allow approved follower (User Req) to access private post detail', async () => {
      const res = await request(app.getHttpServer())
        .get(`/posts/${privatePostId}`)
        .set('Authorization', `Bearer ${tokenUserReq}`)
        .expect(200);

      expect(res.body.item.id).toBe(privatePostId);
    });

    it('should allow author (User Priv) to access their own private post detail', async () => {
      const res = await request(app.getHttpServer())
        .get(`/posts/${privatePostId}`)
        .set('Authorization', `Bearer ${tokenUserPriv}`)
        .expect(200);

      expect(res.body.item.id).toBe(privatePostId);
    });
  });
});
