import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Notification Inbox API (e2e - JS-P0-06)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let tokenUserA: string;
  let userAId: string;

  let tokenUserB: string;
  let userBId: string;

  let tokenPrivateUser: string;
  let privateUserId: string;

  let postAId: string;
  let notificationLikeId: string;
  let notificationReplyId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaService);

    const suffix = `${Date.now().toString().slice(-6)}_${Math.floor(Math.random() * 1000)}`;

    // 1. Register User A
    const regA = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        handle: `notif_a_${suffix}`,
        email: `notif_a_${suffix}@example.com`,
        displayName: 'User A',
        password: 'Password123!',
      })
      .expect(201);
    tokenUserA = regA.body.token;
    userAId = regA.body.user.id;

    // 2. Register User B
    const regB = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        handle: `notif_b_${suffix}`,
        email: `notif_b_${suffix}@example.com`,
        displayName: 'User B',
        password: 'Password123!',
      })
      .expect(201);
    tokenUserB = regB.body.token;
    userBId = regB.body.user.id;

    // 3. Register Private User
    const regPriv = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        handle: `notif_priv_${suffix}`,
        email: `notif_priv_${suffix}@example.com`,
        displayName: 'Private User',
        password: 'Password123!',
      })
      .expect(201);
    tokenPrivateUser = regPriv.body.token;
    privateUserId = regPriv.body.user.id;

    // Set Private User to private
    await prisma.user.update({
      where: { id: privateUserId },
      data: { isPrivate: true },
    });

    // 4. User A publishes an original post
    const postRes = await request(app.getHttpServer())
      .post('/posts')
      .set('Authorization', `Bearer ${tokenUserA}`)
      .send({
        kind: 'original',
        text: 'User A original post for notifications test',
      })
      .expect(201);
    postAId = postRes.body.item.id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ==========================================================================
  // 1. Required Source Events & Recipient Targeting
  // ==========================================================================
  describe('Source Events Generation', () => {
    it('should create a like notification for author when User B likes post', async () => {
      await request(app.getHttpServer())
        .post(`/posts/${postAId}/like`)
        .set('Authorization', `Bearer ${tokenUserB}`)
        .expect(200);

      const inbox = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      const notif = inbox.body.items.find((n: any) => n.eventType === 'like');
      expect(notif).toBeDefined();
      expect(notif.actor.id).toBe(userBId);
      expect(notif.post.id).toBe(postAId);
      expect(notif.readAt).toBeNull();
      notificationLikeId = notif.id;
    });

    it('should create a reply notification for author when User B replies to post', async () => {
      const res = await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${tokenUserB}`)
        .send({
          kind: 'reply',
          text: 'Great post A!',
          replyToId: postAId,
        })
        .expect(201);

      const inbox = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      const notif = inbox.body.items.find((n: any) => n.eventType === 'reply');
      expect(notif).toBeDefined();
      expect(notif.actor.id).toBe(userBId);
      expect(notif.post.id).toBe(res.body.item.id);
      notificationReplyId = notif.id;
    });

    it('should create a repost notification for author when User B reposts post', async () => {
      await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${tokenUserB}`)
        .send({
          kind: 'repost',
          repostOfId: postAId,
        })
        .expect(201);

      const inbox = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      const notif = inbox.body.items.find((n: any) => n.eventType === 'repost');
      expect(notif).toBeDefined();
      expect(notif.actor.id).toBe(userBId);
    });

    it('should create a follow notification when User B follows User A', async () => {
      await request(app.getHttpServer())
        .post(`/users/${userAId}/follow`)
        .set('Authorization', `Bearer ${tokenUserB}`)
        .expect(200);

      const inbox = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      const notif = inbox.body.items.find((n: any) => n.eventType === 'follow');
      expect(notif).toBeDefined();
      expect(notif.actor.id).toBe(userBId);
      expect(notif.post).toBeNull();
    });

    it('should create an accepted follow request notification when Private User accepts request', async () => {
      // User A requests to follow Private User
      await request(app.getHttpServer())
        .post(`/users/${privateUserId}/follow`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      // Private User accepts follow request
      await request(app.getHttpServer())
        .post(`/users/requests/${userAId}/accept`)
        .set('Authorization', `Bearer ${tokenPrivateUser}`)
        .expect(200);

      // User A receives notification that Private User accepted request
      const inbox = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      const notif = inbox.body.items.find(
        (n: any) => n.sourceEventId === `follow_accept:${privateUserId}:${userAId}`
      );
      expect(notif).toBeDefined();
      expect(notif.actor.id).toBe(privateUserId);
    });
  });

  // ==========================================================================
  // 2. Self-Actions Suppressed
  // ==========================================================================
  describe('Self-Actions Suppression', () => {
    it('should create NO notification when author likes own post', async () => {
      const countBefore = await prisma.notification.count({
        where: { recipientId: userAId },
      });

      await request(app.getHttpServer())
        .post(`/posts/${postAId}/like`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      const countAfter = await prisma.notification.count({
        where: { recipientId: userAId },
      });

      expect(countAfter).toBe(countBefore);
    });

    it('should create NO notification when author replies to own post', async () => {
      const countBefore = await prisma.notification.count({
        where: { recipientId: userAId },
      });

      await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          kind: 'reply',
          text: 'Self reply by author',
          replyToId: postAId,
        })
        .expect(201);

      const countAfter = await prisma.notification.count({
        where: { recipientId: userAId },
      });

      expect(countAfter).toBe(countBefore);
    });
  });

  // ==========================================================================
  // 3. Exactly-Once Deduplication & Concurrency Checkpoint
  // ==========================================================================
  describe('Deduplication & Concurrency Checkpoint', () => {
    it('CHECKPOINT: retrying 10 concurrent likes results in exactly 1 notification', async () => {
      // Create a fresh post
      const freshPostRes = await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          kind: 'original',
          text: 'Post for concurrent like test',
        })
        .expect(201);
      const testPostId = freshPostRes.body.item.id;

      // 10 concurrent like requests from User B
      const likePromises = Array.from({ length: 10 }).map(() =>
        request(app.getHttpServer())
          .post(`/posts/${testPostId}/like`)
          .set('Authorization', `Bearer ${tokenUserB}`)
      );

      const results = await Promise.all(likePromises);
      for (const res of results) {
        expect(res.status).toBe(200);
      }

      // Check database notifications for this post and actor
      const notifs = await prisma.notification.findMany({
        where: {
          recipientId: userAId,
          actorId: userBId,
          postId: testPostId,
          eventType: 'like',
        },
      });

      expect(notifs.length).toBe(1);
    });

    it('should revoke unread notification on unlike, and recreate cleanly on re-like', async () => {
      // Create a fresh post
      const freshPostRes = await request(app.getHttpServer())
        .post('/posts')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          kind: 'original',
          text: 'Post for unlike and re-like test',
        })
        .expect(201);
      const testPostId = freshPostRes.body.item.id;

      // User B likes
      await request(app.getHttpServer())
        .post(`/posts/${testPostId}/like`)
        .set('Authorization', `Bearer ${tokenUserB}`)
        .expect(200);

      let count = await prisma.notification.count({
        where: { postId: testPostId, actorId: userBId },
      });
      expect(count).toBe(1);

      // User B unlikes -> notification revoked
      await request(app.getHttpServer())
        .delete(`/posts/${testPostId}/like`)
        .set('Authorization', `Bearer ${tokenUserB}`)
        .expect(200);

      count = await prisma.notification.count({
        where: { postId: testPostId, actorId: userBId },
      });
      expect(count).toBe(0);

      // User B re-likes -> fresh notification created cleanly
      await request(app.getHttpServer())
        .post(`/posts/${testPostId}/like`)
        .set('Authorization', `Bearer ${tokenUserB}`)
        .expect(200);

      count = await prisma.notification.count({
        where: { postId: testPostId, actorId: userBId },
      });
      expect(count).toBe(1);
    });

    it('CHECKPOINT: rollback in transaction leaves zero false notifications', async () => {
      const initialCount = await prisma.notification.count({
        where: { recipientId: userAId },
      });

      // Attempt to execute an aborted interactive transaction
      await expect(
        prisma.$transaction(async (tx) => {
          await tx.$executeRaw`
            INSERT INTO notifications (recipient_id, actor_id, event_type, post_id, source_event_id)
            VALUES (${userAId}::uuid, ${userBId}::uuid, 'like', ${postAId}::uuid, 'rollback_test_event')
          `;
          // Force an intentional error to trigger rollback
          throw new Error('Forced transaction abort to test zero false notifications');
        })
      ).rejects.toThrow('Forced transaction abort');

      const finalCount = await prisma.notification.count({
        where: { recipientId: userAId },
      });
      expect(finalCount).toBe(initialCount);

      const phantom = await prisma.notification.findUnique({
        where: { sourceEventId: 'rollback_test_event' },
      });
      expect(phantom).toBeNull();
    });
  });

  // ==========================================================================
  // 4. Read Lifecycle & Unread Count
  // ==========================================================================
  describe('Read State Management', () => {
    it('should return authoritative unread count', async () => {
      const res = await request(app.getHttpServer())
        .get('/notifications/unread-count')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      expect(typeof res.body.unreadCount).toBe('number');
      expect(res.body.unreadCount).toBeGreaterThan(0);
    });

    it('should mark a single notification as read', async () => {
      const countResBefore = await request(app.getHttpServer())
        .get('/notifications/unread-count')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .patch(`/notifications/${notificationLikeId}/read`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      const countResAfter = await request(app.getHttpServer())
        .get('/notifications/unread-count')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      expect(countResAfter.body.unreadCount).toBe(countResBefore.body.unreadCount - 1);
    });

    it('should be safe and idempotent on repeated mark read', async () => {
      const countResBefore = await request(app.getHttpServer())
        .get('/notifications/unread-count')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      // Repeat mark read on same notification
      await request(app.getHttpServer())
        .patch(`/notifications/${notificationLikeId}/read`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      const countResAfter = await request(app.getHttpServer())
        .get('/notifications/unread-count')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      expect(countResAfter.body.unreadCount).toBe(countResBefore.body.unreadCount);
    });

    it('should mark all current notifications as read with read-all', async () => {
      const res = await request(app.getHttpServer())
        .post('/notifications/read-all')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.markedCount).toBeGreaterThan(0);

      const countRes = await request(app.getHttpServer())
        .get('/notifications/unread-count')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      expect(countRes.body.unreadCount).toBe(0);
    });
  });

  // ==========================================================================
  // 5. IDOR & Access Controls
  // ==========================================================================
  describe('IDOR & Cross-User Security', () => {
    it('should return only the viewer notifications (User B sees none of User A notifications)', async () => {
      const inboxB = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${tokenUserB}`)
        .expect(200);

      // User B should not see notifications destined for User A
      const hasUserANotif = inboxB.body.items.some(
        (n: any) => n.id === notificationReplyId || n.id === notificationLikeId
      );
      expect(hasUserANotif).toBe(false);
    });

    it('CHECKPOINT: reject cross-user mark-as-read attempt with 403 Forbidden', async () => {
      // User B attempts to mark User A's notification as read
      await request(app.getHttpServer())
        .patch(`/notifications/${notificationReplyId}/read`)
        .set('Authorization', `Bearer ${tokenUserB}`)
        .expect(403);
    });

    it('should reject unauthenticated notifications access with 401 Unauthorized', async () => {
      await request(app.getHttpServer())
        .get('/notifications')
        .expect(401);

      await request(app.getHttpServer())
        .get('/notifications/unread-count')
        .expect(401);

      await request(app.getHttpServer())
        .post('/notifications/read-all')
        .expect(401);
    });
  });

  // ==========================================================================
  // 6. Removed Content & Deactivated Actors Tombstone Policy
  // ==========================================================================
  describe('Tombstone Policy in Notifications Inbox', () => {
    it('should display tombstone text for deleted post in notification inbox', async () => {
      // Soft-delete postA
      await request(app.getHttpServer())
        .delete(`/posts/${postAId}`)
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      const inbox = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      const likeNotif = inbox.body.items.find((n: any) => n.id === notificationLikeId);
      expect(likeNotif).toBeDefined();
      expect(likeNotif.post.isDeleted).toBe(true);
      expect(likeNotif.post.text).toBe('[This post was deleted by author]');
    });

    it('should display deactivated user tombstone when actor account is deactivated', async () => {
      // Deactivate User B
      await request(app.getHttpServer())
        .post('/users/me/deactivate')
        .set('Authorization', `Bearer ${tokenUserB}`)
        .expect(200);

      const inbox = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .expect(200);

      const notifFromUserB = inbox.body.items.find((n: any) => n.id === notificationLikeId);
      expect(notifFromUserB).toBeDefined();
      expect(notifFromUserB.actor.displayName).toBe('[Deactivated user]');
    });
  });
});
