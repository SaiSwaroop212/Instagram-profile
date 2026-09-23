import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';

describe('Social Feed API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // 1. Health Endpoints
  describe('Health', () => {
    it('/health/live (GET) should return 200 ok', () => {
      return request(app.getHttpServer())
        .get('/health/live')
        .expect(200)
        .expect({ status: 'ok' });
    });

    it('/health/ready (GET) should return 200 ready and connected', () => {
      return request(app.getHttpServer())
        .get('/health/ready')
        .expect(200)
        .expect({ status: 'ready', database: 'connected' });
    });
  });

  // 2. Feed Endpoint & Pagination
  describe('/feed (GET)', () => {
    it('should return 200 with paginated items, nextCursor, and hasMore', async () => {
      const res = await request(app.getHttpServer())
        .get('/feed?limit=10')
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items.length).toBe(10);
      expect(res.body.hasMore).toBe(true);
      expect(res.body.nextCursor).toBeDefined();

      // Check first item shape
      const item = res.body.items[0];
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('kind', 'original');
      expect(item).toHaveProperty('author');
      expect(item.author).toHaveProperty('handle');
      expect(item).toHaveProperty('likeCount');
      expect(item).toHaveProperty('replyCount');
    });

    it('should reject legacy ?page query with 400 Bad Request', () => {
      return request(app.getHttpServer())
        .get('/feed?page=1')
        .expect(400);
    });

    it('should reject out-of-range limit with 400 Bad Request', () => {
      return request(app.getHttpServer())
        .get('/feed?limit=100')
        .expect(400);
    });
  });

  // 3. Post Detail
  describe('/posts/:id (GET)', () => {
    it('should return 200 with post detail under { item: ... }', async () => {
      const res = await request(app.getHttpServer())
        .get('/posts/b0000000-0000-4000-8000-000000000001')
        .expect(200);

      expect(res.body).toHaveProperty('item');
      expect(res.body.item.id).toBe('b0000000-0000-4000-8000-000000000001');
      expect(res.body.item.likeCount).toBe(4);
      expect(res.body.item.replyCount).toBe(3);
    });

    it('should return 404 for nonexistent post', () => {
      return request(app.getHttpServer())
        .get('/posts/b0000000-0000-4000-8000-999999999999')
        .expect(404);
    });
  });

  // 4. Replies
  describe('/posts/:id/replies (GET)', () => {
    it('should return 200 with direct replies', async () => {
      const res = await request(app.getHttpServer())
        .get('/posts/b0000000-0000-4000-8000-000000000001/replies?limit=10')
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body.items.length).toBe(3);
    });
  });

  // 5. User Profile & Media
  describe('/users/:id (GET) & /users/:id/media (GET)', () => {
    it('should return user profile statistics', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/asha')
        .expect(200);

      expect(res.body.item).toHaveProperty('handle', 'asha');
      expect(res.body.item).toHaveProperty('postCount');
      expect(res.body.item).toHaveProperty('followerCount');
      expect(res.body.item).toHaveProperty('followingCount');
    });

    it('should return user media stream with responsive variants', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/asha/media?limit=10')
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body.items.length).toBeGreaterThan(0);
      const media = res.body.items[0];
      expect(media).toHaveProperty('smallUrl');
      expect(media).toHaveProperty('largeUrl');
      expect(media).toHaveProperty('width');
      expect(media).toHaveProperty('height');
    });
  });

  // 6. Search
  describe('/search/posts (GET)', () => {
    it('should perform case-insensitive search and return paginated results', async () => {
      const res = await request(app.getHttpServer())
        .get('/search/posts?q=PostgreSQL')
        .expect(200);

      expect(res.body).toHaveProperty('items');
      expect(res.body.items.length).toBeGreaterThan(0);
    });
  });

  // 7. Like / Unlike
  describe('POST & DELETE /posts/:id/like', () => {
    const postId = 'b0000000-0000-4000-8000-000000000021';

    it('should like a post and return updated state', async () => {
      const res = await request(app.getHttpServer())
        .post(`/posts/${postId}/like`)
        .expect(200);

      expect(res.body).toHaveProperty('postId', postId);
      expect(res.body).toHaveProperty('likedByViewer', true);
      expect(res.body).toHaveProperty('likeCount');
    });

    it('should unlike a post and return updated state', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/posts/${postId}/like`)
        .expect(200);

      expect(res.body).toHaveProperty('postId', postId);
      expect(res.body).toHaveProperty('likedByViewer', false);
    });
  });
});
