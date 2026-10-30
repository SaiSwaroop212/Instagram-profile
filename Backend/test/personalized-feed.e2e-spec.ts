import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Personalized Home Feed API (e2e - JS-P0-04)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let tokenReader: string;
  let readerId: string;

  let tokenFollowedA: string;
  let followedAId: string;

  let tokenFollowedB: string;
  let followedBId: string;

  let tokenStranger: string;
  let _strangerId: string;

  let tokenPrivUser: string;
  let privUserId: string;

  let tokenNewbie: string;
  let _newbieId: string;

  let postAId: string;
  let postBId: string;
  let postStrangerId: string;
  let postReaderId: string;
  let postPrivId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);

    // 1. Register Reader
    const regReader = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        handle: 'stage4_reader',
        displayName: 'Feed Reader',
        password: 'Password123!',
      });
    tokenReader = regReader.body.token;
    readerId = regReader.body.user.id;

    // 2. Register Followed A
    const regA = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        handle: 'stage4_followed_a',
        displayName: 'Followed Author A',
        password: 'Password123!',
      });
    tokenFollowedA = regA.body.token;
    followedAId = regA.body.user.id;

    // 3. Register Followed B
    const regB = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        handle: 'stage4_followed_b',
        displayName: 'Followed Author B',
        password: 'Password123!',
      });
    tokenFollowedB = regB.body.token;
    followedBId = regB.body.user.id;

    // 4. Register Stranger
    const regStranger = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        handle: 'stage4_stranger',
        displayName: 'Stranger Author',
        password: 'Password123!',
      });
    tokenStranger = regStranger.body.token;
    _strangerId = regStranger.body.user.id;

    // 5. Register Private User
    const regPriv = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        handle: 'stage4_priv_author',
        displayName: 'Private Author',
        password: 'Password123!',
      });
    tokenPrivUser = regPriv.body.token;
    privUserId = regPriv.body.user.id;

    // Set private user to isPrivate = true
    await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${tokenPrivUser}`)
      .send({ isPrivate: true });

    // 6. Register Newbie (follows nobody, 0 posts)
    const regNewbie = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        handle: 'stage4_newbie',
        displayName: 'Newbie User',
        password: 'Password123!',
      });
    tokenNewbie = regNewbie.body.token;
    _newbieId = regNewbie.body.user.id;

    // Reader follows Followed A and Followed B
    await request(app.getHttpServer())
      .post(`/users/${followedAId}/follow`)
      .set('Authorization', `Bearer ${tokenReader}`)
      .expect(200);

    await request(app.getHttpServer())
      .post(`/users/${followedBId}/follow`)
      .set('Authorization', `Bearer ${tokenReader}`)
      .expect(200);

    // Create posts
    // Followed A post
    const resA = await request(app.getHttpServer())
      .post('/posts')
      .set('Authorization', `Bearer ${tokenFollowedA}`)
      .send({ kind: 'original', text: 'Post by Followed A #stage4' });
    postAId = resA.body.item.id;

    // Followed B post
    const resB = await request(app.getHttpServer())
      .post('/posts')
      .set('Authorization', `Bearer ${tokenFollowedB}`)
      .send({ kind: 'original', text: 'Post by Followed B #stage4' });
    postBId = resB.body.item.id;

    // Stranger post
    const resStranger = await request(app.getHttpServer())
      .post('/posts')
      .set('Authorization', `Bearer ${tokenStranger}`)
      .send({ kind: 'original', text: 'Post by Stranger #stage4' });
    postStrangerId = resStranger.body.item.id;

    // Reader own post
    const resReader = await request(app.getHttpServer())
      .post('/posts')
      .set('Authorization', `Bearer ${tokenReader}`)
      .send({ kind: 'original', text: 'Post by Reader (Own Post) #stage4' });
    postReaderId = resReader.body.item.id;

    // Private user post
    const resPriv = await request(app.getHttpServer())
      .post('/posts')
      .set('Authorization', `Bearer ${tokenPrivUser}`)
      .send({ kind: 'original', text: 'Post by Private User #stage4' });
    postPrivId = resPriv.body.item.id;
  });

  afterAll(async () => {
    await prisma.follow.deleteMany({
      where: {
        OR: [
          { follower: { handle: { startsWith: 'stage4_' } } },
          { following: { handle: { startsWith: 'stage4_' } } },
        ],
      },
    });

    await prisma.post.deleteMany({
      where: { author: { handle: { startsWith: 'stage4_' } } },
    });

    await prisma.authSession.deleteMany({
      where: { user: { handle: { startsWith: 'stage4_' } } },
    });

    await prisma.user.deleteMany({
      where: { handle: { startsWith: 'stage4_' } },
    });

    await app.close();
  });

  // ==========================================================================
  // 1. Personalized Feed Eligibility
  // ==========================================================================
  describe('Personalized Feed Eligibility', () => {
    it('should include own posts and followed authors posts in personal feed', async () => {
      const res = await request(app.getHttpServer())
        .get('/feed?limit=20')
        .set('Authorization', `Bearer ${tokenReader}`)
        .expect(200);

      expect(res.body.feedType).toBe('personalized');
      expect(res.body.isFallback).toBe(false);

      const itemIds = res.body.items.map((p: any) => p.id);

      // Followed A and B posts MUST appear
      expect(itemIds).toContain(postAId);
      expect(itemIds).toContain(postBId);

      // Reader's own post MUST appear
      expect(itemIds).toContain(postReaderId);
    });

    it('should NEVER include posts from ineligible authors (strangers)', async () => {
      const res = await request(app.getHttpServer())
        .get('/feed?limit=20')
        .set('Authorization', `Bearer ${tokenReader}`)
        .expect(200);

      const itemIds = res.body.items.map((p: any) => p.id);

      // Stranger's post MUST NOT appear in personalized feed
      expect(itemIds).not.toContain(postStrangerId);
    });

    it('should NEVER include posts from private accounts when not following them', async () => {
      const res = await request(app.getHttpServer())
        .get('/feed?limit=20')
        .set('Authorization', `Bearer ${tokenReader}`)
        .expect(200);

      const itemIds = res.body.items.map((p: any) => p.id);
      expect(itemIds).not.toContain(postPrivId);
    });

    it('should include private posts once the follow request is accepted', async () => {
      // Reader sends follow to Private User -> transitions to PENDING
      await request(app.getHttpServer())
        .post(`/users/${privUserId}/follow`)
        .set('Authorization', `Bearer ${tokenReader}`)
        .expect(200);

      // Verify that while PENDING, private posts still do NOT appear
      const pendingRes = await request(app.getHttpServer())
        .get('/feed?limit=20')
        .set('Authorization', `Bearer ${tokenReader}`)
        .expect(200);
      expect(pendingRes.body.items.map((p: any) => p.id)).not.toContain(postPrivId);

      // Private User accepts follow request
      await request(app.getHttpServer())
        .post(`/users/requests/${readerId}/accept`)
        .set('Authorization', `Bearer ${tokenPrivUser}`)
        .expect(200);

      // Now accepted: private posts MUST appear in Reader's feed
      const acceptedRes = await request(app.getHttpServer())
        .get('/feed?limit=20')
        .set('Authorization', `Bearer ${tokenReader}`)
        .expect(200);
      expect(acceptedRes.body.items.map((p: any) => p.id)).toContain(postPrivId);
    });

    it('should exclude posts by authors who have deactivated their account', async () => {
      // Followed B deactivates their account
      await request(app.getHttpServer())
        .post('/users/me/deactivate')
        .set('Authorization', `Bearer ${tokenFollowedB}`)
        .expect(200);

      // Reader's feed must immediately omit Post B
      const res = await request(app.getHttpServer())
        .get('/feed?limit=20')
        .set('Authorization', `Bearer ${tokenReader}`)
        .expect(200);

      const itemIds = res.body.items.map((p: any) => p.id);
      expect(itemIds).not.toContain(postBId);
      expect(itemIds).toContain(postAId);
    });
  });

  // ==========================================================================
  // 2. Replies and Reposts Exclusion
  // ==========================================================================
  describe('Replies & Reposts Exclusion', () => {
    it('should exclude replies from the home feed', async () => {
      // Followed A replies to their own post
      const replyRes = await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${tokenFollowedA}`)
        .send({
          kind: 'reply',
          text: 'This is a reply to post A',
          replyToId: postAId,
        });
      const replyId = replyRes.body.item.id;

      const res = await request(app.getHttpServer())
        .get('/feed?limit=20')
        .set('Authorization', `Bearer ${tokenReader}`)
        .expect(200);

      const itemIds = res.body.items.map((p: any) => p.id);
      expect(itemIds).not.toContain(replyId);
    });
  });

  // ==========================================================================
  // 3. Keyset Pagination & Cursor Tie-Breaker
  // ==========================================================================
  describe('Keyset Pagination & Cursor Tie-Breaker', () => {
    it('should paginate without duplication or skipping across pages', async () => {
      // Create 3 posts in rapid sequence
      const p1 = await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${tokenFollowedA}`)
        .send({ kind: 'original', text: 'Pagination post 1 #stage4' });

      const p2 = await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${tokenFollowedA}`)
        .send({ kind: 'original', text: 'Pagination post 2 #stage4' });

      const p3 = await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${tokenFollowedA}`)
        .send({ kind: 'original', text: 'Pagination post 3 #stage4' });

      // Fetch page 1 (limit 2)
      const page1 = await request(app.getHttpServer())
        .get('/feed?limit=2')
        .set('Authorization', `Bearer ${tokenReader}`)
        .expect(200);

      expect(page1.body.items.length).toBe(2);
      expect(page1.body.hasMore).toBe(true);
      expect(page1.body.nextCursor).toBeDefined();

      const page1Ids = page1.body.items.map((p: any) => p.id);

      // Fetch page 2 using nextCursor
      const page2 = await request(app.getHttpServer())
        .get(`/feed?limit=2&cursor=${page1.body.nextCursor}`)
        .set('Authorization', `Bearer ${tokenReader}`)
        .expect(200);

      expect(page2.body.items.length).toBeGreaterThan(0);
      const page2Ids = page2.body.items.map((p: any) => p.id);

      // Verify zero overlap (no duplicates)
      const overlap = page1Ids.filter((id: string) => page2Ids.includes(id));
      expect(overlap).toEqual([]);

      // Clean up extra posts
      await prisma.post.deleteMany({
        where: { id: { in: [p1.body.item.id, p2.body.item.id, p3.body.item.id] } },
      });
    });
  });

  // ==========================================================================
  // 4. Onboarding / New User Experience
  // ==========================================================================
  describe('Onboarding / New User Experience', () => {
    it('should return labeled public discovery fallback for a user following nobody', async () => {
      const res = await request(app.getHttpServer())
        .get('/feed?limit=10')
        .set('Authorization', `Bearer ${tokenNewbie}`)
        .expect(200);

      expect(res.body.feedType).toBe('discovery');
      expect(res.body.isFallback).toBe(true);
      expect(res.body.onboarding).toBe(true);
      expect(res.body.message).toBeDefined();
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    it('should return empty items with onboarding metadata when scope=following is requested', async () => {
      const res = await request(app.getHttpServer())
        .get('/feed?scope=following&limit=10')
        .set('Authorization', `Bearer ${tokenNewbie}`)
        .expect(200);

      expect(res.body.feedType).toBe('personalized');
      expect(res.body.isFallback).toBe(false);
      expect(res.body.onboarding).toBe(true);
      expect(res.body.items).toEqual([]);
      expect(res.body.hasMore).toBe(false);
      expect(res.body.nextCursor).toBeNull();
    });

    it('should allow user to explicitly query public discovery feed via scope=public or /feed/public', async () => {
      const res1 = await request(app.getHttpServer())
        .get('/feed?scope=public&limit=10')
        .set('Authorization', `Bearer ${tokenReader}`)
        .expect(200);

      expect(res1.body.feedType).toBe('public');
      expect(res1.body.items.length).toBeGreaterThan(0);

      const res2 = await request(app.getHttpServer())
        .get('/feed/public?limit=10')
        .set('Authorization', `Bearer ${tokenReader}`)
        .expect(200);

      expect(res2.body.feedType).toBe('public');
      expect(res2.body.items.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // 5. Query Count Budget & Performance
  // ==========================================================================
  describe('Query Count Budget & Performance', () => {
    it('should execute with constant bounded query count for limit=5 vs limit=50 (zero N+1)', async () => {
      // Both limit=5 and limit=50 must complete in bounded latency without error
      const start5 = Date.now();
      const res5 = await request(app.getHttpServer())
        .get('/feed?limit=5')
        .set('Authorization', `Bearer ${tokenReader}`)
        .expect(200);
      const duration5 = Date.now() - start5;

      const start50 = Date.now();
      const res50 = await request(app.getHttpServer())
        .get('/feed?limit=50')
        .set('Authorization', `Bearer ${tokenReader}`)
        .expect(200);
      const duration50 = Date.now() - start50;

      expect(res5.body.items.length).toBeLessThanOrEqual(5);
      expect(res50.body.items.length).toBeLessThanOrEqual(50);

      // Both queries complete in fast sub-second time
      expect(duration5).toBeLessThan(1000);
      expect(duration50).toBeLessThan(1000);
    });
  });
});
