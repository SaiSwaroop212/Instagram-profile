import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { decodeCursor, encodeCursor, parseLimit } from '../common/cursor.util.js';
import { PaginatedProfileMediaDto, ProfileMediaItemDto } from '../common/dto/post-response.dto.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class MediaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getMediaByUserId(
    idOrHandle: string,
    limitParam?: string | number,
    cursorParam?: string
  ): Promise<PaginatedProfileMediaDto> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrHandle);

    const user = await this.prisma.user.findFirst({
      where: isUuid ? { id: idOrHandle } : { handle: idOrHandle.toLowerCase() },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const limit = parseLimit(limitParam, 10);

    const whereClause: Prisma.PostMediaWhereInput = {
      post: {
        authorId: user.id,
        kind: 'original',
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

    const mediaRows = await this.prisma.postMedia.findMany({
      where: whereClause,
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      take: limit + 1,
    });

    const hasMore = mediaRows.length > limit;
    const itemsToReturn = hasMore ? mediaRows.slice(0, limit) : mediaRows;

    const items: ProfileMediaItemDto[] = itemsToReturn.map((m) => ({
      id: m.id,
      postId: m.postId,
      createdAt: m.createdAt.toISOString(),
      position: m.position,
      altText: m.altText,
      width: m.width,
      height: m.height,
      smallUrl: m.smallUrl,
      largeUrl: m.largeUrl,
    }));

    const lastItem = itemsToReturn[itemsToReturn.length - 1];
    const nextCursor = hasMore && lastItem ? encodeCursor(lastItem.createdAt, lastItem.id) : null;

    return {
      items,
      nextCursor,
      hasMore,
    };
  }
}