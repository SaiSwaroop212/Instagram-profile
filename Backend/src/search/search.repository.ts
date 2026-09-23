import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { decodeCursor, encodeCursor, parseLimit } from '../common/cursor.util.js';
import { fetchBatchMetrics } from '../common/batch-metrics.util.js';
import { mapPostItem } from '../common/dto/dto-mapper.util.js';
import { PaginatedPostsDto } from '../common/dto/post-response.dto.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class SearchRepository {
  constructor(private readonly prisma: PrismaService) {}

  async searchOriginals(
    rawQuery?: string,
    limitParam?: string | number,
    cursorParam?: string,
    viewerId?: string
  ): Promise<PaginatedPostsDto> {
    if (!rawQuery) {
      throw new BadRequestException('q query parameter is required');
    }

    const trimmed = rawQuery.trim();
    if (trimmed.length < 2 || trimmed.length > 80) {
      throw new BadRequestException('q must be between 2 and 80 characters');
    }

    const limit = parseLimit(limitParam, 10);

    const whereClause: Prisma.PostWhereInput = {
      kind: 'original',
      text: {
        contains: trimmed,
        mode: 'insensitive',
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