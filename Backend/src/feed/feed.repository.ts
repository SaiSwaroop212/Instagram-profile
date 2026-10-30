import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { decodeCursor, encodeCursor, parseLimit } from '../common/cursor.util.js';
import { fetchBatchMetrics } from '../common/batch-metrics.util.js';
import { mapPostItem } from '../common/dto/dto-mapper.util.js';
import { PaginatedPostsDto } from '../common/dto/post-response.dto.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class FeedRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getFeed(
    limitParam?: string | number,
    cursorParam?: string,
    viewerId?: string,
    scope?: string
  ): Promise<PaginatedPostsDto> {
    const limit = parseLimit(limitParam, 10);

    // 1. Unauthenticated or explicit public request -> Public Discovery Feed
    if (!viewerId || scope === 'public') {
      const publicResult = await this.fetchPublicFeed(limit, cursorParam, viewerId);
      return {
        ...publicResult,
        feedType: 'public',
        isFallback: false,
      };
    }

    // 2. Authenticated user: Check follow graph & own content state
    const [activeFollowsCount, ownPostsCount] = await Promise.all([
      this.prisma.follow.count({
        where: {
          followerId: viewerId,
          status: 'accepted',
          following: { deactivatedAt: null },
        },
      }),
      this.prisma.post.count({
        where: {
          authorId: viewerId,
          kind: 'original',
          deletedAt: null,
        },
      }),
    ]);

    // 3. Onboarding Case: User follows nobody and has authored 0 posts
    if (activeFollowsCount === 0 && ownPostsCount === 0) {
      if (scope === 'following') {
        return {
          items: [],
          nextCursor: null,
          hasMore: false,
          feedType: 'personalized',
          isFallback: false,
          onboarding: true,
          message: 'You are not following anyone yet.',
        };
      }

      // Default onboarding experience: labeled public fallback
      const publicResult = await this.fetchPublicFeed(limit, cursorParam, viewerId);
      return {
        ...publicResult,
        feedType: 'discovery',
        isFallback: true,
        onboarding: true,
        message: 'You are not following anyone yet. Discover trending posts from the community!',
      };
    }

    // 4. Personalized Feed: Eligible originals from followed authors and the viewer
    const whereClause: Prisma.PostWhereInput = {
      kind: 'original',
      deletedAt: null,
      author: {
        deactivatedAt: null,
        OR: [
          { id: viewerId },
          {
            followers: {
              some: {
                followerId: viewerId,
                status: 'accepted',
              },
            },
          },
        ],
      },
    };

    if (cursorParam) {
      const cursor = decodeCursor(cursorParam);
      const cursorDate = new Date(cursor.createdAt);

      whereClause.OR = [
        {
          createdAt: {
            lt: cursorDate,
          },
        },
        {
          createdAt: cursorDate,
          id: {
            lt: cursor.id,
          },
        },
      ];
    }

    // Fetch limit + 1 to determine hasMore
    const posts = await this.prisma.post.findMany({
      where: whereClause,
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      take: limit + 1,
      include: {
        author: true,
        media: {
          orderBy: { position: 'asc' },
        },
      },
    });

    const hasMore = posts.length > limit;
    const itemsToReturn = hasMore ? posts.slice(0, limit) : posts;

    // Batch metrics with constant query count
    const postIds = itemsToReturn.map((p) => p.id);
    const metrics = await fetchBatchMetrics(this.prisma, postIds, viewerId);

    const mappedItems = itemsToReturn.map((post) =>
      mapPostItem(
        post,
        metrics.likeCounts.get(post.id) || 0,
        metrics.replyCounts.get(post.id) || 0,
        metrics.viewerLikes.has(post.id)
      )
    );

    const lastItem = itemsToReturn[itemsToReturn.length - 1];
    const nextCursor = hasMore && lastItem ? encodeCursor(lastItem.createdAt, lastItem.id) : null;

    return {
      items: mappedItems,
      nextCursor,
      hasMore,
      feedType: 'personalized',
      isFallback: false,
    };
  }

  private async fetchPublicFeed(
    limit: number,
    cursorParam?: string,
    viewerId?: string
  ): Promise<{ items: any[]; nextCursor: string | null; hasMore: boolean }> {
    const whereClause: Prisma.PostWhereInput = {
      kind: 'original',
      deletedAt: null,
      author: {
        deactivatedAt: null,
        isPrivate: false,
        NOT: [
          { handle: { startsWith: 'notif_' } },
          { handle: { startsWith: 'rel_' } },
          { handle: { startsWith: 's5_' } },
          { handle: { startsWith: 'stage5_' } },
          { handle: { startsWith: 'test_' } },
          { handle: { startsWith: 'req_' } },
          { handle: { startsWith: 'pvt_' } },
        ],
      },
    };

    if (cursorParam) {
      const cursor = decodeCursor(cursorParam);
      const cursorDate = new Date(cursor.createdAt);

      whereClause.OR = [
        {
          createdAt: {
            lt: cursorDate,
          },
        },
        {
          createdAt: cursorDate,
          id: {
            lt: cursor.id,
          },
        },
      ];
    }

    const posts = await this.prisma.post.findMany({
      where: whereClause,
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      take: limit + 1,
      include: {
        author: true,
        media: {
          orderBy: { position: 'asc' },
        },
      },
    });

    const hasMore = posts.length > limit;
    const itemsToReturn = hasMore ? posts.slice(0, limit) : posts;

    const postIds = itemsToReturn.map((p) => p.id);
    const metrics = await fetchBatchMetrics(this.prisma, postIds, viewerId);

    const mappedItems = itemsToReturn.map((post) =>
      mapPostItem(
        post,
        metrics.likeCounts.get(post.id) || 0,
        metrics.replyCounts.get(post.id) || 0,
        metrics.viewerLikes.has(post.id)
      )
    );

    const lastItem = itemsToReturn[itemsToReturn.length - 1];
    const nextCursor = hasMore && lastItem ? encodeCursor(lastItem.createdAt, lastItem.id) : null;

    return {
      items: mappedItems,
      nextCursor,
      hasMore,
    };
  }
}