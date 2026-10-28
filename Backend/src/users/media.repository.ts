import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
    cursorParam?: string,
    viewerId?: string
  ): Promise<PaginatedProfileMediaDto> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrHandle);

    const user = await this.prisma.user.findFirst({
      where: isUuid
        ? { id: idOrHandle, deactivatedAt: null }
        : { handle: idOrHandle.toLowerCase(), deactivatedAt: null },
      select: { id: true, isPrivate: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isPrivate && viewerId !== user.id) {
      let isApproved = false;
      if (viewerId) {
        const follow = await this.prisma.follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: viewerId,
              followingId: user.id,
            },
          },
        });
        isApproved = follow?.status === 'accepted';
      }
      if (!isApproved) {
        throw new ForbiddenException('This account is private');
      }
    }

    const limit = parseLimit(limitParam, 10);

    const whereClause: Prisma.PostMediaWhereInput = {
      post: {
        authorId: user.id,
        kind: 'original',
        deletedAt: null,
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