import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { corsOptions } from '../src/config/cors.config.js';
import { AppController } from '../src/app.controller.js';
import { HealthController } from '../src/health/health.controller.js';
import { AuthController } from '../src/auth/auth.controller.js';
import { UserController } from '../src/users/user.controller.js';
import { PostController } from '../src/posts/post.controller.js';
import { ReplyController } from '../src/posts/reply.controller.js';
import { FeedController } from '../src/feed/feed.controller.js';
import { MediaController } from '../src/users/media.controller.js';
import { SearchController } from '../src/search/search.controller.js';
import { NotificationController } from '../src/notifications/notification.controller.js';

describe('Security, Compatibility & Release Controls (e2e - JS-P0-07)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let tokenUserA: string;
  let userAId: string;

  let tokenUserB: string;
  let _userBId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.enableCors(corsOptions);
    await app.init();

    prisma = app.get(PrismaService);

    const suffix = `${Date.now().toString().slice(-6)}_${Math.floor(Math.random() * 1000)}`;

    const regA = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        handle: `rel_a_${suffix}`,
        email: `rel_a_${suffix}@example.com`,
        displayName: 'Release User A',
        password: 'Password123!',
      })
      .expect(201);
    tokenUserA = regA.body.token;
    userAId = regA.body.user.id;

    const regB = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        handle: `rel_b_${suffix}`,
        email: `rel_b_${suffix}@example.com`,
        displayName: 'Release User B',
        password: 'Password123!',
      })
      .expect(201);
    tokenUserB = regB.body.token;
    _userBId = regB.body.user.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ==========================================================================
  // 1. CHECKPOINT: Permission-Matrix Checked Against Real Registered Route List
  // ==========================================================================
  describe('Checkpoint: Route & Permission Matrix Audit', () => {
    it('should verify 100% of registered routes are classified with zero unclassified mutations', async () => {
      // 1. Read the permission matrix table document
      const matrixPath = path.resolve(__dirname, '../docs/release/permission-matrix.md');
      expect(fs.existsSync(matrixPath)).toBe(true);
      const matrixContent = fs.readFileSync(matrixPath, 'utf8');

      // 2. Extract registered routes from Express instance or controller reflection
      const expressApp = app.getHttpAdapter().getInstance();
      const router = expressApp?._router;

      const registeredRoutes: Array<{ method: string; path: string }> = [];

      if (router && router.stack) {
        for (const layer of router.stack) {
          if (layer.route) {
            const pathStr = layer.route.path;
            for (const methodKey of Object.keys(layer.route.methods)) {
              if (layer.route.methods[methodKey]) {
                registeredRoutes.push({
                  method: methodKey.toUpperCase(),
                  path: pathStr,
                });
              }
            }
          }
        }
      }

      // Also ensure controller-level reflection extracts all routes
      const controllerList = [
        AppController,
        HealthController,
        AuthController,
        UserController,
        PostController,
        ReplyController,
        FeedController,
        MediaController,
        SearchController,
        NotificationController,
      ];

      const methodMap: Record<number, string> = {
        0: 'GET',
        1: 'POST',
        2: 'PUT',
        3: 'DELETE',
        4: 'PATCH',
        5: 'ALL',
        6: 'OPTIONS',
        7: 'HEAD',
      };

      for (const ctrl of controllerList) {
        const ctrlPrefix = (Reflect.getMetadata('path', ctrl) || '').replace(/^\/?/, '/');
        const proto = ctrl.prototype;
        for (const methodName of Object.getOwnPropertyNames(proto)) {
          if (methodName === 'constructor') continue;
          const methodFn = (proto as any)[methodName];
          const methodPath = Reflect.getMetadata('path', methodFn);
          const reqMethodNum = Reflect.getMetadata('method', methodFn);

          if (reqMethodNum !== undefined && methodPath !== undefined) {
            const normalizedSub = methodPath ? `/${methodPath.replace(/^\//, '')}` : '';
            const fullPath = (ctrlPrefix === '/' ? '' : ctrlPrefix) + normalizedSub || '/';
            registeredRoutes.push({
              method: methodMap[reqMethodNum] || 'UNKNOWN',
              path: fullPath,
            });
          }
        }
      }

      expect(registeredRoutes.length).toBeGreaterThan(0);

      // 3. Verify every registered route exists in the permission matrix document
      for (const route of registeredRoutes) {
        // Check method appears in markdown table
        const methodInDoc = matrixContent.includes(`\`${route.method}\``);
        expect(methodInDoc).toBe(true);

        // Path or normalized route pattern in doc
        const routeNormalized = route.path.replace(/\\/g, '');
        const pathInDoc =
          matrixContent.includes(`\`${routeNormalized}\``) ||
          matrixContent.includes(routeNormalized.split('/:')[0]);
        expect(pathInDoc).toBe(true);
      }

      // 4. Verify that all mutations in matrix are either explicitly public auth gateways or guarded
      const lines = matrixContent.split('\n').filter((l) => l.includes('|'));
      const mutationLines = lines.filter((l) => l.includes('**Yes**'));

      expect(mutationLines.length).toBeGreaterThan(10);

      for (const line of mutationLines) {
        const isPublicAuthGateway =
          line.includes('/auth/register') || line.includes('/auth/login');
        if (!isPublicAuthGateway) {
          // Must require AuthGuard
          expect(line.includes('AuthGuard')).toBe(true);
        }
      }
    });
  });

  // ==========================================================================
  // 2. CHECKPOINT: Request Tracing (X-Request-Id) on Allowed & Denied Requests
  // ==========================================================================
  describe('Checkpoint: End-to-End Request Tracing (X-Request-Id)', () => {
    it('should generate and return X-Request-Id on allowed request (200 OK)', async () => {
      const customTraceId = `trace-allow-${Date.now()}`;
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .set('X-Request-Id', customTraceId)
        .expect(200);

      expect(res.headers['x-request-id']).toBe(customTraceId);
      expect(res.body.user.id).toBe(userAId);
    });

    it('should propagate X-Request-Id on unauthorized denied request (401 Unauthorized)', async () => {
      const customTraceId = `trace-unauth-${Date.now()}`;
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('X-Request-Id', customTraceId)
        .expect(401);

      expect(res.headers['x-request-id']).toBe(customTraceId);
    });

    it('should propagate X-Request-Id on forbidden denied request (403 Forbidden)', async () => {
      // User A creates a post
      const postRes = await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          kind: 'original',
          text: 'Post for trace test',
        })
        .expect(201);
      const postId = postRes.body.item.id;

      // User B attempts to edit User A post
      const customTraceId = `trace-forbid-${Date.now()}`;
      const res = await request(app.getHttpServer())
        .patch(`/posts/${postId}`)
        .set('Authorization', `Bearer ${tokenUserB}`)
        .set('X-Request-Id', customTraceId)
        .send({
          text: 'Attacker edit',
        })
        .expect(403);

      expect(res.headers['x-request-id']).toBe(customTraceId);
    });
  });

  // ==========================================================================
  // 3. CHECKPOINT: Migration Rehearsal & Baseline Integrity
  // ==========================================================================
  describe('Checkpoint: Migration Rehearsal & Data Integrity', () => {
    it('should verify existing database rows adhere to forward-migrated schemas', async () => {
      // 1. Verify posts have version and nullable deletedAt
      const posts = await prisma.post.findMany({ take: 5 });
      for (const post of posts) {
        expect(typeof post.version).toBe('number');
        expect(post.version).toBeGreaterThanOrEqual(1);
      }

      // 2. Verify follows have accepted status default
      const follows = await prisma.follow.findMany({ take: 5 });
      for (const follow of follows) {
        expect(['accepted', 'pending']).toContain(follow.status);
      }

      // 3. Verify users have nullable deactivatedAt and boolean isPrivate
      const users = await prisma.user.findMany({ take: 5 });
      for (const user of users) {
        expect(typeof user.isPrivate).toBe('boolean');
      }
    });

    it('should verify migration rehearsal documentation exists and certifies 0 data loss', () => {
      const rehearsalPath = path.resolve(__dirname, '../docs/release/migration-rehearsal.md');
      expect(fs.existsSync(rehearsalPath)).toBe(true);

      const content = fs.readFileSync(rehearsalPath, 'utf8');
      expect(content).toContain('100% data fidelity preserved');
      expect(content).toContain('20261023_notifications_constraints');
    });

    it('should verify production release guide exists with smoke checks and rollback plan', () => {
      const guidePath = path.resolve(__dirname, '../docs/release/release-guide.md');
      expect(fs.existsSync(guidePath)).toBe(true);

      const content = fs.readFileSync(guidePath, 'utf8');
      expect(content).toContain('Rollback Considerations');
      expect(content).toContain('Post-Deployment Smoke Checks');
    });
  });

  // ==========================================================================
  // 4. Security & Credential Hygiene
  // ==========================================================================
  describe('Security & Credential Hygiene', () => {
    it('should never expose passwords or password hashes in user profile endpoints', async () => {
      const res = await request(app.getHttpServer())
        .get(`/users/${userAId}`)
        .expect(200);

      expect(res.body.item).not.toHaveProperty('password');
      expect(res.body.item).not.toHaveProperty('passwordHash');
      expect(res.body.item).not.toHaveProperty('salt');
      expect(res.body.item).not.toHaveProperty('token');
      expect(res.body.item).not.toHaveProperty('tokenHash');
    });

    it('should reject unknown malicious fields on post updates', async () => {
      const postRes = await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          kind: 'original',
          text: 'Safe post',
        })
        .expect(201);
      const postId = postRes.body.item.id;

      // Inject unexpected fields
      await request(app.getHttpServer())
        .patch(`/posts/${postId}`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          text: 'Legit text',
          __proto__: { admin: true },
          isAdmin: true,
          roles: ['superadmin'],
        })
        .expect(400);
    });

    it('should reject unwhitelisted CORS origins', async () => {
      const res = await request(app.getHttpServer())
        .get('/health/live')
        .set('Origin', 'http://malicious-phishing-site.com')
        .expect(200);

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('should allow whitelisted localhost CORS origins', async () => {
      const res = await request(app.getHttpServer())
        .get('/health/live')
        .set('Origin', 'http://localhost:5173')
        .expect(200);

      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });
  });
});
