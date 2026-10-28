import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Auth & Stateful Session API (e2e - JS-P0-01)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // Cleanup created test users and sessions
    await prisma.user.deleteMany({
      where: {
        handle: {
          startsWith: 'test_',
        },
      },
    });
    await app.close();
  });

  // 1. Registration & Input Normalization
  describe('POST /auth/register', () => {
    it('should register a new account with handle normalization and return token + sanitized user', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          handle: '  @Test_Alpha_User  ',
          displayName: '  Alpha Tester  ',
          password: 'Password123!',
          bio: 'Testing auth features',
        })
        .expect(201);

      expect(res.body).toHaveProperty('token');
      expect(typeof res.body.token).toBe('string');
      expect(res.body.token.length).toBe(64); // 32-byte hex string
      expect(res.body).toHaveProperty('user');
      expect(res.body.user.handle).toBe('test_alpha_user');
      expect(res.body.user.displayName).toBe('Alpha Tester');

      // Credentials and internal password_hash must NEVER leak in response
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('Password123!');

      // Verify Set-Cookie header is sent
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toMatch(/session=[0-9a-f]{64};/i);
      expect(cookies[0]).toContain('HttpOnly');
    });

    it('should reject registration if password is shorter than 8 characters', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          handle: 'test_short_pw',
          displayName: 'Short Password',
          password: 'short',
        })
        .expect(400);
    });

    it('should reject invalid handle characters with 400', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          handle: 'invalid-handle-symbols!',
          displayName: 'Invalid Handle',
          password: 'Password123!',
        })
        .expect(400);
    });

    // CHECKPOINT: 20 concurrent duplicate registrations produce exactly 1 account
    it('CHECKPOINT: 20 concurrent duplicate registrations create at most one account', async () => {
      const duplicateHandle = 'test_race_handle';
      const requests = Array.from({ length: 20 }).map(() =>
        request(app.getHttpServer())
          .post('/auth/register')
          .send({
            handle: duplicateHandle,
            displayName: 'Race Participant',
            password: 'RacePassword123!',
          })
      );

      const responses = await Promise.all(requests);
      const successful = responses.filter((r) => r.status === 201);
      const conflicts = responses.filter((r) => r.status === 409);

      expect(successful.length).toBe(1);
      expect(conflicts.length).toBe(19);

      // Verify PostgreSQL DB row count is strictly 1
      const count = await prisma.user.count({
        where: { handle: duplicateHandle },
      });
      expect(count).toBe(1);
    });
  });

  // 2. Sign In (Login) & Timing Attack Resistance
  describe('POST /auth/login', () => {
    const validHandle = 'test_login_user';
    const validPassword = 'SecurePassword123!';

    beforeAll(async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          handle: validHandle,
          displayName: 'Login User',
          password: validPassword,
        });
    });

    it('should login successfully with case-insensitive handle and return session token', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          handle: '  TEST_LOGIN_USER  ',
          password: validPassword,
        })
        .expect(200);

      expect(res.body).toHaveProperty('token');
      expect(res.body.user.handle).toBe(validHandle);
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('should reject wrong password with 401 and generic message', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          handle: validHandle,
          password: 'WrongPassword999!',
        })
        .expect(401);

      expect(res.body.message).toBe('Invalid handle or password');
    });

    it('should reject unknown handle with identical 401 error message', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          handle: 'test_completely_nonexistent_user',
          password: 'SomeRandomPassword123!',
        })
        .expect(401);

      // Enumeration resistance: message must be identical
      expect(res.body.message).toBe('Invalid handle or password');
    });
  });

  // 3. Protected Route & Session Transport (Bearer & Cookie)
  describe('GET /auth/me (Protected Route)', () => {
    let token: string;
    let userHandle: string;

    beforeAll(async () => {
      userHandle = 'test_me_user';
      const reg = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          handle: userHandle,
          displayName: 'Me User',
          password: 'Password123!',
        });
      token = reg.body.token;
    });

    it('should reject access without token with 401 Unauthorized', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('should reject access with invalid token with 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer invalid_fake_token_hex_00000000000000000000000000000000')
        .expect(401);
    });

    it('should allow access via Authorization: Bearer <token>', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.user.handle).toBe(userHandle);
    });

    it('should allow access via Cookie: session=<token>', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', `session=${token}`)
        .expect(200);

      expect(res.body.user.handle).toBe(userHandle);
    });
  });

  // 4. Session Revocation & Sign Out (Single & Multi-Session)
  describe('POST /auth/logout & /auth/logout-all', () => {
    it('should revoke the active session on logout', async () => {
      const reg = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          handle: 'test_logout_user',
          displayName: 'Logout User',
          password: 'Password123!',
        });

      const token = reg.body.token;

      // Access succeeds before logout
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Perform logout
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Access fails after logout
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('should invalidate all sessions for a user on logout-all', async () => {
      const handle = 'test_multi_session';
      const password = 'Password123!';

      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          handle,
          displayName: 'Multi Session User',
          password,
        });

      // Create Session 1
      const login1 = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ handle, password });
      const token1 = login1.body.token;

      // Create Session 2
      const login2 = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ handle, password });
      const token2 = login2.body.token;

      // Both sessions valid
      await request(app.getHttpServer()).get('/auth/me').set('Authorization', `Bearer ${token1}`).expect(200);
      await request(app.getHttpServer()).get('/auth/me').set('Authorization', `Bearer ${token2}`).expect(200);

      // Call logout-all on token1
      await request(app.getHttpServer())
        .post('/auth/logout-all')
        .set('Authorization', `Bearer ${token1}`)
        .expect(200);

      // Both sessions now invalid
      await request(app.getHttpServer()).get('/auth/me').set('Authorization', `Bearer ${token1}`).expect(401);
      await request(app.getHttpServer()).get('/auth/me').set('Authorization', `Bearer ${token2}`).expect(401);
    });
  });

  // 5. Protected Actions Derive Actor Only from Verified Auth State
  describe('Protected Actions (e.g. POST /posts/:id/like)', () => {
    const targetPostId = 'b0000000-0000-4000-8000-000000000021';
    let actorToken: string;
    let actorId: string;

    beforeAll(async () => {
      const reg = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          handle: 'test_action_actor',
          displayName: 'Action Actor',
          password: 'Password123!',
        });
      actorToken = reg.body.token;
      actorId = reg.body.user.id;
    });

    it('should reject unauthenticated post reaction with 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .post(`/posts/${targetPostId}/like`)
        .expect(401);
    });

    it('should allow post reaction when authenticated and derive actor from session', async () => {
      const res = await request(app.getHttpServer())
        .post(`/posts/${targetPostId}/like`)
        .set('Authorization', `Bearer ${actorToken}`)
        .expect(200);

      expect(res.body).toHaveProperty('postId', targetPostId);
      expect(res.body).toHaveProperty('likedByViewer', true);

      // Verify the like row in PostgreSQL was created with the actor's verified user ID
      const dbLike = await prisma.postLike.findUnique({
        where: {
          postId_userId: {
            postId: targetPostId,
            userId: actorId,
          },
        },
      });
      expect(dbLike).not.toBeNull();
      expect(dbLike?.userId).toBe(actorId);

      // Cleanup like
      await request(app.getHttpServer())
        .delete(`/posts/${targetPostId}/like`)
        .set('Authorization', `Bearer ${actorToken}`)
        .expect(200);
    });
  });
});
