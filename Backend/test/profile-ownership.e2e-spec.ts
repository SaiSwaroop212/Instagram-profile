import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Profile Ownership & Account State API (e2e - JS-P0-02)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let tokenUserA: string;
  let userAId: string;
  let userAHandle: string;

  let tokenUserB: string;
  let _userBId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);

    // Register User A
    const regA = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        handle: 'owner_user_a',
        displayName: 'Original User A',
        password: 'Password123!',
        bio: 'Original bio of user A',
      });
    tokenUserA = regA.body.token;
    userAId = regA.body.user.id;
    userAHandle = regA.body.user.handle;

    // Register User B
    const regB = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        handle: 'attacker_user_b',
        displayName: 'Attacker B',
        password: 'Password123!',
      });
    tokenUserB = regB.body.token;
    _userBId = regB.body.user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: {
        handle: {
          in: ['owner_user_a', 'attacker_user_b', 'new_handle_a', 'test_deact_user'],
        },
      },
    });
    await app.close();
  });

  // 1. Owner updates allowed profile fields
  describe('PATCH /users/me & /users/:id (Owner Updates)', () => {
    it('should allow owner to update display name, bio, and avatar URLs', async () => {
      const res = await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          displayName: 'Updated Asha A',
          bio: 'Building reliable distributed systems in Stage 2.',
          avatarSmallUrl: '/fixtures/updated-48.jpg',
          avatarLargeUrl: '/fixtures/updated-96.jpg',
        })
        .expect(200);

      expect(res.body).toHaveProperty('item');
      expect(res.body.item.id).toBe(userAId);
      expect(res.body.item.displayName).toBe('Updated Asha A');
      expect(res.body.item.bio).toBe('Building reliable distributed systems in Stage 2.');
      expect(res.body.item.avatar.smallUrl).toBe('/fixtures/updated-48.jpg');
      expect(res.body.item.avatar.largeUrl).toBe('/fixtures/updated-96.jpg');

      // Password hash must never leak in response
      expect(res.body.item.passwordHash).toBeUndefined();

      // Verify public read reflects the change
      const getRes = await request(app.getHttpServer())
        .get(`/users/${userAId}`)
        .expect(200);
      expect(getRes.body.item.displayName).toBe('Updated Asha A');
      expect(getRes.body.item.bio).toBe('Building reliable distributed systems in Stage 2.');
    });

    it('should reject invalid display name (< 1 char or > 50 chars) with 400', async () => {
      await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({ displayName: '   ' })
        .expect(400);

      await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({ displayName: 'x'.repeat(51) })
        .expect(400);
    });

    it('should reject bio exceeding 280 characters with 400', async () => {
      await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({ bio: 'b'.repeat(281) })
        .expect(400);
    });
  });

  // 2. Immutable & Unknown Fields Rejected
  describe('Immutable and Unknown Field Rejection', () => {
    it('should reject attempt to modify immutable fields (id, passwordHash, followerCount)', async () => {
      await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({ id: '00000000-0000-0000-0000-000000000000' })
        .expect(400);

      await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({ passwordHash: 'hacked_hash' })
        .expect(400);

      await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({ followerCount: 999999 })
        .expect(400);
    });

    it('should reject unknown fields with 400 Bad Request', async () => {
      await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({ randomMaliciousField: 'exploit' })
        .expect(400);
    });
  });

  // 3. CHECKPOINT: Cross-User Mutation Leaves DB State Identical
  describe('CHECKPOINT: Cross-User Authorization (User B -> User A)', () => {
    it('CHECKPOINT: User B attempting to PATCH User A fails with 403 and leaves DB state identical', async () => {
      // 1. Snapshot User A's complete database row before attack
      const stateBefore = await prisma.user.findUnique({
        where: { id: userAId },
      });
      expect(stateBefore).not.toBeNull();

      // 2. User B tries to PATCH User A's profile via UUID
      await request(app.getHttpServer())
        .patch(`/users/${userAId}`)
        .set('Authorization', `Bearer ${tokenUserB}`)
        .send({ displayName: 'Defaced by User B' })
        .expect(403);

      // 3. User B tries to PATCH User A's profile via Handle
      await request(app.getHttpServer())
        .patch(`/users/${userAHandle}`)
        .set('Authorization', `Bearer ${tokenUserB}`)
        .send({ bio: 'Defaced bio' })
        .expect(403);

      // 4. Assert DB state after attack is 100% IDENTICAL to state before
      const stateAfter = await prisma.user.findUnique({
        where: { id: userAId },
      });

      expect(stateAfter).toEqual(stateBefore);
      expect(stateAfter?.displayName).toBe(stateBefore?.displayName);
      expect(stateAfter?.bio).toBe(stateBefore?.bio);
    });
  });

  // 4. Handle Change Policy & Uniqueness
  describe('Handle Change Policy', () => {
    it('should normalize and update handle when unique', async () => {
      const res = await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({ handle: '  @New_Handle_A  ' })
        .expect(200);

      expect(res.body.item.handle).toBe('new_handle_a');
      userAHandle = 'new_handle_a';
    });

    it('should reject duplicate handle change with 409 Conflict', async () => {
      // User B tries to change handle to User A's existing handle
      await request(app.getHttpServer())
        .patch('/users/me')
        .set('Authorization', `Bearer ${tokenUserB}`)
        .send({ handle: 'new_handle_a' })
        .expect(409);
    });
  });

  // 5. Account Deactivation Lifecycle
  describe('Account Deactivation Lifecycle', () => {
    let deactToken: string;
    let deactUserId: string;

    beforeAll(async () => {
      const reg = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          handle: 'test_deact_user',
          displayName: 'Deactivate Me',
          password: 'Password123!',
        });
      deactToken = reg.body.token;
      deactUserId = reg.body.user.id;
    });

    it('should reject unauthorized cross-user deactivation with 403', async () => {
      await request(app.getHttpServer())
        .post(`/users/${deactUserId}/deactivate`)
        .set('Authorization', `Bearer ${tokenUserB}`)
        .expect(403);
    });

    it('should deactivate account and revoke all active sessions', async () => {
      // Deactivate self
      await request(app.getHttpServer())
        .post('/users/me/deactivate')
        .set('Authorization', `Bearer ${deactToken}`)
        .expect(200);

      // 1. Session is revoked: subsequent authenticated request returns 401
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${deactToken}`)
        .expect(401);

      // 2. Direct profile read returns 404 Not Found
      await request(app.getHttpServer())
        .get(`/users/${deactUserId}`)
        .expect(404);

      // 3. Login attempt for deactivated account fails with 401
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          handle: 'test_deact_user',
          password: 'Password123!',
        })
        .expect(401);
    });
  });
});
