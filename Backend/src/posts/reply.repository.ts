import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { decodeCursor, encodeCursor, parseLimit } from '../common/cursor.util.js';
import { fetchBatchMetrics } from '../common/batch-metrics.util.js';
import { mapPostItem } from '../common/dto/dto-mapper.util.js';
import { PaginatedPostsDto } from '../common/dto/post-response.dto.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class ReplyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getRepliesByPostId(
    postId: string,
    limitParam?: string | number,
    cursorParam?: string,
    viewerId?: string
  ): Promise<PaginatedPostsDto> {
    // 1. Verify parent post exists
    const parentPost = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });

    if (!parentPost) {
      throw new NotFoundException('Post not found');
    }

    const limit = parseLimit(limitParam, 10);

    const whereClause: Prisma.PostWhereInput = {
      replyToId: postId,
      kind: 'reply',
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

    // 2. Fetch limit + 1
    const replies = await this.prisma.post.findMany({
      where: whereClause,
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      take: limit + 1,
      include: {
        author: true,
        media: true,
      },
    });

    const hasMore = replies.length > limit;
    const itemsToReturn = hasMore ? replies.slice(0, limit) : replies;

    // 3. Batch metrics
    const replyIds = itemsToReturn.map((r) => r.id);
    const metrics = await fetchBatchMetrics(this.prisma, replyIds, viewerId);

    const mappedItems = itemsToReturn.map((reply) =>
      mapPostItem(
        reply,
        metrics.likeCounts.get(reply.id) || 0,
        metrics.replyCounts.get(reply.id) || 0,
        metrics.viewerLikes.has(reply.id)
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