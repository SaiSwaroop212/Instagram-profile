import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { decodeCursor, encodeCursor, parseLimit } from '../common/cursor.util.js';
import { mapAuthor } from '../common/dto/dto-mapper.util.js';
import {
  NotificationItemDto,
  PaginatedNotificationsDto,
  UnreadCountDto,
} from './dto/notification-response.dto.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getNotifications(
    recipientId: string,
    limitParam?: string | number,
    cursorParam?: string
  ): Promise<PaginatedNotificationsDto> {
    const limit = parseLimit(limitParam, 10);

    const whereClause: Prisma.NotificationWhereInput = {
      recipientId,
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

    const [rows, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: whereClause,
        orderBy: [
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        take: limit + 1,
        include: {
          actor: true,
          post: true,
        },
      }),
      this.prisma.notification.count({
        where: {
          recipientId,
          readAt: null,
        },
      }),
    ]);

    const hasMore = rows.length > limit;
    const itemsToReturn = hasMore ? rows.slice(0, limit) : rows;

    const items: NotificationItemDto[] = itemsToReturn.map((n) => {
      // Deactivated actor tombstone
      const isActorDeactivated = n.actor.deactivatedAt !== null;
      const actorDto = isActorDeactivated
        ? {
            id: n.actor.id,
            handle: 'deactivated',
            displayName: '[Deactivated user]',
            avatar: {
              smallUrl: '',
              largeUrl: '',
            },
          }
        : mapAuthor(n.actor);

      // Post tombstone if deleted
      let postDto = null;
      if (n.post) {
        const isPostDeleted = Boolean(n.post.deletedAt);
        postDto = {
          id: n.post.id,
          kind: n.post.kind,
          text: isPostDeleted ? '[This post was deleted by author]' : n.post.text,
          isDeleted: isPostDeleted,
        };
      }

      return {
        id: n.id,
        eventType: n.eventType as 'like' | 'reply' | 'repost' | 'follow' | 'follow_request',
        createdAt: n.createdAt.toISOString(),
        readAt: n.readAt ? n.readAt.toISOString() : null,
        sourceEventId: n.sourceEventId,
        actor: actorDto,
        post: postDto,
      };
    });

    const lastItem = itemsToReturn[itemsToReturn.length - 1];
    const nextCursor = hasMore && lastItem ? encodeCursor(lastItem.createdAt, lastItem.id) : null;

    return {
      items,
      nextCursor,
      hasMore,
      unreadCount,
    };
  }

  async getUnreadCount(recipientId: string): Promise<UnreadCountDto> {
    const unreadCount = await this.prisma.notification.count({
      where: {
        recipientId,
        readAt: null,
      },
    });

    return { unreadCount };
  }

  async markAsRead(notificationId: string, recipientId: string): Promise<{ success: boolean; id: string }> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      select: { id: true, recipientId: true, readAt: true },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.recipientId !== recipientId) {
      throw new ForbiddenException('You do not have permission to modify this notification');
    }

    if (notification.readAt === null) {
      await this.prisma.notification.update({
        where: { id: notificationId },
        data: { readAt: new Date() },
      });
    }

    return {
      success: true,
      id: notificationId,
    };
  }

  async markAllAsRead(recipientId: string, beforeTimestamp?: Date): Promise<{ success: boolean; markedCount: number }> {
    const cutoff = beforeTimestamp || new Date();

    const result = await this.prisma.notification.updateMany({
      where: {
        recipientId,
        readAt: null,
        createdAt: {
          lte: cutoff,
        },
      },
      data: {
        readAt: new Date(),
      },
    });

    return {
      success: true,
      markedCount: result.count,
    };
  }

  static async emitNotification(
    tx: Prisma.TransactionClient,
    data: {
      recipientId: string;
      actorId: string;
      eventType: 'like' | 'reply' | 'repost' | 'follow' | 'follow_request';
      postId?: string | null;
      sourceEventId: string;
    }
  ): Promise<void> {
    // 1. Self-actions produce no notification
    if (data.recipientId === data.actorId) {
      return;
    }

    // 2. Exactly-once creation via sourceEventId unique constraint with ON CONFLICT DO NOTHING
    if (data.postId) {
      await (tx as any).$executeRaw`
        INSERT INTO notifications (recipient_id, actor_id, event_type, post_id, source_event_id)
        VALUES (${data.recipientId}::uuid, ${data.actorId}::uuid, ${data.eventType}, ${data.postId}::uuid, ${data.sourceEventId})
        ON CONFLICT (source_event_id) DO NOTHING
      `;
    } else {
      await (tx as any).$executeRaw`
        INSERT INTO notifications (recipient_id, actor_id, event_type, post_id, source_event_id)
        VALUES (${data.recipientId}::uuid, ${data.actorId}::uuid, ${data.eventType}, NULL, ${data.sourceEventId})
        ON CONFLICT (source_event_id) DO NOTHING
      `;
    }
  }

  static async revokeNotification(
    tx: Prisma.TransactionClient,
    sourceEventId: string
  ): Promise<void> {
    try {
      await tx.notification.deleteMany({
        where: {
          sourceEventId,
        },
      });
    } catch {
      // Ignore cleanup error if already removed
    }
  }
}
