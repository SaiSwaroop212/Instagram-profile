import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationRepository } from '../notifications/notification.repository.js';

export interface LikeResultDto {
  postId: string;
  likedByViewer: boolean;
  likeCount: number;
}

@Injectable()
export class LikeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async setLike(
    postId: string,
    viewerId: string,
    desiredState: boolean
  ): Promise<LikeResultDto> {
    return await this.prisma.$transaction(async (tx) => {
      // 1. Verify post exists and is not deleted
      const post = await tx.post.findUnique({
        where: { id: postId },
        select: { id: true, authorId: true, deletedAt: true },
      });

      if (!post || post.deletedAt !== null) {
        throw new NotFoundException('Post not found');
      }

      const sourceEventId = `like:${postId}:${viewerId}`;

      // 2. Perform desired state operation
      if (desiredState) {
        await tx.$executeRaw`
          INSERT INTO post_likes (post_id, user_id)
          VALUES (${postId}::uuid, ${viewerId}::uuid)
          ON CONFLICT (post_id, user_id) DO NOTHING
        `;

        // Emit notification inside same transaction (self-action filtered inside emitNotification)
        await NotificationRepository.emitNotification(tx, {
          recipientId: post.authorId,
          actorId: viewerId,
          eventType: 'like',
          postId,
          sourceEventId,
        });
      } else {
        // Unlike: delete if present, idempotent
        await tx.postLike.deleteMany({
          where: {
            postId,
            userId: viewerId,
          },
        });

        // Revoke unread notification on unlike
        await NotificationRepository.revokeNotification(tx, sourceEventId);
      }

      // 3. Authoritative count
      const likeCount = await tx.postLike.count({
        where: { postId },
      });

      return {
        postId,
        likedByViewer: desiredState,
        likeCount,
      };
    });
  }
}

