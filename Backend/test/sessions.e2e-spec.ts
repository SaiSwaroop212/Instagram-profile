import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Active Session Management & New-Device Notifications (e2e)', () => {
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
    // Cleanup test users and test notifications
    const testUsers = await prisma.user.findMany({
      where: {
        handle: {
          startsWith: 'test_sess_',
        },
      },
      select: { id: true },
    });
    const userIds = testUsers.map((u) => u.id);

    if (userIds.length > 0) {
      await prisma.notification.deleteMany({
        where: {
          recipientId: { in: userIds },
        },
      });
      await prisma.authSession.deleteMany({
        where: {
          userId: { in: userIds },
        },
      });
      await prisma.user.deleteMany({
        where: {
          id: { in: userIds },
        },
      });
    }

    await app.close();
  });

  describe('GET /auth/sessions & DELETE /auth/sessions/:id', () => {
    let token1: string;
    let token2: string;
    let foreignUserToken: string;

    beforeAll(async () => {
      // 1. Register main user on desktop Chrome
      const reg = await request(app.getHttpServer())
        .post('/auth/register')
        .set('x-device-type', 'desktop')
        .set('x-device-browser', 'Chrome')
        .set('x-device-os', 'Windows')
        .send({
          handle: 'test_sess_user1',
          displayName: 'Session User 1',
          password: 'Password123!',
        });
      token1 = reg.body.token;

      // 2. Login second session from mobile Safari
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-device-type', 'mobile')
        .set('x-device-browser', 'Safari')
        .set('x-device-os', 'iOS')
        .send({
          handle: 'test_sess_user1',
          password: 'Password123!',
        });
      token2 = loginRes.body.token;

      // 3. Register foreign user
      const foreignReg = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          handle: 'test_sess_foreign',
          displayName: 'Foreign User',
          password: 'Password123!',
        });
      foreignUserToken = foreignReg.body.token;
    });

    it('should reject unauthenticated GET /auth/sessions with 401 Unauthorized', async () => {
      await request(app.getHttpServer()).get('/auth/sessions').expect(401);
    });

    it('should list all active sessions for authenticated user with sanitized data and isCurrent flag', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${token2}`)
        .expect(200);

      expect(res.body).toHaveProperty('sessions');
      expect(Array.isArray(res.body.sessions)).toBe(true);
      expect(res.body.sessions.length).toBeGreaterThanOrEqual(2);

      // Verify no sensitive tokens or password hashes are exposed
      const serialized = JSON.stringify(res.body);
      expect(serialized).not.toContain('tokenHash');
      expect(serialized).not.toContain('passwordHash');
      expect(serialized).not.toContain('Password123!');

      // Check current session
      const current = res.body.sessions.find((s: any) => s.isCurrent === true);
      expect(current).toBeDefined();
      expect(current.deviceType).toBe('mobile');
      expect(current.browser).toBe('Safari');
      expect(current.os).toBe('iOS');

      // Check non-current session
      const other = res.body.sessions.find((s: any) => s.isCurrent === false);
      expect(other).toBeDefined();
      expect(other.deviceType).toBe('desktop');
      expect(other.browser).toBe('Chrome');
      expect(other.os).toBe('Windows');
    });

    it('should forbid user from revoking another users session with 403 Forbidden', async () => {
      // Fetch foreign user's session ID
      const foreignSessions = await request(app.getHttpServer())
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${foreignUserToken}`)
        .expect(200);

      const foreignSessionId = foreignSessions.body.sessions[0].id;

      // User 1 attempts to revoke Foreign User's session
      await request(app.getHttpServer())
        .delete(`/auth/sessions/${foreignSessionId}`)
        .set('Authorization', `Bearer ${token1}`)
        .expect(403);
    });

    it('should return 404 Not Found when revoking a nonexistent session ID', async () => {
      await request(app.getHttpServer())
        .delete('/auth/sessions/00000000-0000-4000-8000-000000000000')
        .set('Authorization', `Bearer ${token1}`)
        .expect(404);
    });

    it('should revoke individual session and immediately block subsequent requests with that token', async () => {
      const sessionsRes = await request(app.getHttpServer())
        .get('/auth/sessions')
        .set('Authorization', `Bearer ${token2}`)
        .expect(200);

      const session1 = sessionsRes.body.sessions.find((s: any) => !s.isCurrent);
      expect(session1).toBeDefined();

      // Revoke session1 using token2
      const deleteRes = await request(app.getHttpServer())
        .delete(`/auth/sessions/${session1.id}`)
        .set('Authorization', `Bearer ${token2}`)
        .expect(200);

      expect(deleteRes.body).toHaveProperty('success', true);

      // Token 1 must now be rejected with 401 Unauthorized
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token1}`)
        .expect(401);

      // Token 2 must remain valid
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token2}`)
        .expect(200);
    });

    it('should revoke all user sessions on POST /auth/logout-all', async () => {
      // Create new session token for the user
      const loginAgain = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          handle: 'test_sess_user1',
          password: 'Password123!',
        })
        .expect(200);
      const token3 = loginAgain.body.token;

      // Both token2 and token3 are currently valid
      await request(app.getHttpServer()).get('/auth/me').set('Authorization', `Bearer ${token2}`).expect(200);
      await request(app.getHttpServer()).get('/auth/me').set('Authorization', `Bearer ${token3}`).expect(200);

      // Call logout-all
      await request(app.getHttpServer())
        .post('/auth/logout-all')
        .set('Authorization', `Bearer ${token3}`)
        .expect(200);

      // Both tokens are now rejected
      await request(app.getHttpServer()).get('/auth/me').set('Authorization', `Bearer ${token2}`).expect(401);
      await request(app.getHttpServer()).get('/auth/me').set('Authorization', `Bearer ${token3}`).expect(401);
    });
  });

  describe('New-Device Login Notifications & Deduplication', () => {
    let mainToken: string;

    beforeAll(async () => {
      const reg = await request(app.getHttpServer())
        .post('/auth/register')
        .set('x-device-type', 'desktop')
        .set('x-device-browser', 'Firefox')
        .set('x-device-os', 'Linux')
        .send({
          handle: 'test_sess_notif_user',
          displayName: 'Notif Test User',
          password: 'Password123!',
        });
      mainToken = reg.body.token;
    });

    it('should generate NEW_LOGIN notification with metadata on first login from a new device', async () => {
      // Login from mobile Edge on Android
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-device-type', 'mobile')
        .set('x-device-browser', 'Edge')
        .set('x-device-os', 'Android')
        .send({
          handle: 'test_sess_notif_user',
          password: 'Password123!',
        })
        .expect(200);

      const deviceToken = loginRes.body.token;

      // Check notifications
      const notifRes = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${deviceToken}`)
        .expect(200);

      const loginNotif = notifRes.body.items.find(
        (n: any) => n.eventType === 'NEW_LOGIN' || n.eventType === 'new_login'
      );

      expect(loginNotif).toBeDefined();
      expect(loginNotif.metadata).toBeDefined();
      expect(loginNotif.metadata.deviceType).toBe('mobile');
      expect(loginNotif.metadata.browser).toBe('Edge');
      expect(loginNotif.metadata.os).toBe('Android');
      expect(loginNotif.metadata.loginTime).toBeDefined();
    });

    it('should not create duplicate notification when logging in from an already recognized device', async () => {
      // Fetch current notifications count
      const beforeRes = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${mainToken}`)
        .expect(200);

      const initialLoginAlerts = beforeRes.body.items.filter(
        (n: any) => n.eventType === 'NEW_LOGIN' || n.eventType === 'new_login'
      ).length;

      // Log in again with the exact same recognised device (mobile, Edge, Android)
      await request(app.getHttpServer())
        .post('/auth/login')
        .set('x-device-type', 'mobile')
        .set('x-device-browser', 'Edge')
        .set('x-device-os', 'Android')
        .send({
          handle: 'test_sess_notif_user',
          password: 'Password123!',
        })
        .expect(200);

      // Count of NEW_LOGIN notifications should remain identical
      const afterRes = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${mainToken}`)
        .expect(200);

      const finalLoginAlerts = afterRes.body.items.filter(
        (n: any) => n.eventType === 'NEW_LOGIN' || n.eventType === 'new_login'
      ).length;

      expect(finalLoginAlerts).toBe(initialLoginAlerts);
    });
  });
});
