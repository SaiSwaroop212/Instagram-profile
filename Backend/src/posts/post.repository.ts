import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { mapPostItem } from '../common/dto/dto-mapper.util.js';
import { PostItemDto } from '../common/dto/post-response.dto.js';
import { NotificationRepository } from '../notifications/notification.repository.js';
import {
  ALLOWED_POST_UPDATE_FIELDS,
  IMMUTABLE_POST_FIELDS,
} from './dto/update-post.dto.js';
import { Prisma } from '@prisma/client';

export interface CreatePostCommand {
  kind: 'original' | 'reply' | 'repost';
  text?: string | null;
  replyToId?: string | null;
  repostOfId?: string | null;
  media?: Array<{
    smallUrl: string;
    largeUrl: string;
    altText?: string;
    width?: number;
    height?: number;
  }>;
}

@Injectable()
export class PostRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getPostById(id: string, viewerId?: string): Promise<{ item: PostItemDto } | null> {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: {
        author: true,
        media: {
          orderBy: { position: 'asc' },
        },
        repostOf: {
          include: {
            author: true,
          },
        },
      },
    });

    if (!post || post.author.deactivatedAt !== null) {
      return null;
    }

    if (post.author.isPrivate && viewerId !== post.author.id) {
      let isApproved = false;
      if (viewerId) {
        const follow = await this.prisma.follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: viewerId,
              followingId: post.author.id,
            },
          },
        });
        isApproved = follow?.status === 'accepted';
      }
      if (!isApproved) {
        throw new ForbiddenException('This account is private');
      }
    }

    const [likeCount, replyCount, viewerLike] = await Promise.all([
      this.prisma.postLike.count({ where: { postId: id } }),
      this.prisma.post.count({ where: { replyToId: id, kind: 'reply' } }),
      viewerId
        ? this.prisma.postLike.findUnique({
            where: { postId_userId: { postId: id, userId: viewerId } },
          })
        : null,
    ]);

    // Handle soft-deleted post
    if (post.deletedAt !== null) {
      if (replyCount === 0) {
        return null;
      }
      return {
        item: mapPostItem(post, likeCount, replyCount, false),
      };
    }

    return {
      item: mapPostItem(post, likeCount, replyCount, !!viewerLike),
    };
  }

  async createPost(authorId: string, command: CreatePostCommand): Promise<{ item: PostItemDto }> {
    const { kind, text, replyToId, repostOfId } = command;

    if (!['original', 'reply', 'repost'].includes(kind)) {
      throw new BadRequestException(`Invalid post kind: ${kind}`);
    }

    // Validate body rules
    if (kind === 'original') {
      if (!text || text.trim().length === 0 || text.length > 280) {
        throw new UnprocessableEntityException('Original post text must be between 1 and 280 characters');
      }
      if (replyToId || repostOfId) {
        throw new UnprocessableEntityException('Original post cannot have replyToId or repostOfId');
      }
    } else if (kind === 'reply') {
      if (!text || text.trim().length === 0 || text.length > 280) {
        throw new UnprocessableEntityException('Reply text must be between 1 and 280 characters');
      }
      if (!replyToId) {
        throw new UnprocessableEntityException('replyToId is required for reply');
      }
      if (repostOfId) {
        throw new UnprocessableEntityException('Reply cannot have repostOfId');
      }
    } else if (kind === 'repost') {
      if (text !== undefined && text !== null && text.trim().length > 0) {
        throw new UnprocessableEntityException('Repost cannot contain text');
      }
      if (!repostOfId) {
        throw new UnprocessableEntityException('repostOfId is required for repost');
      }
      if (replyToId) {
        throw new UnprocessableEntityException('Repost cannot have replyToId');
      }
    }

    return await this.prisma.$transaction(async (tx) => {
      let targetReplyAuthorId: string | null = null;
      let targetRepostAuthorId: string | null = null;
      // 1. If reply, verify target exists and is an original and not deleted
      if (kind === 'reply' && replyToId) {
        const target = await tx.post.findUnique({
          where: { id: replyToId },
          select: { id: true, kind: true, authorId: true, deletedAt: true },
        });

        if (!target) {
          throw new NotFoundException('Reply target post not found');
        }
        if (target.deletedAt !== null) {
          throw new BadRequestException('Cannot reply to a deleted post');
        }
        if (target.kind !== 'original') {
          throw new UnprocessableEntityException('Can only reply to an original post');
        }
        targetReplyAuthorId = target.authorId;
      }

      // 2. If repost, verify target exists and is an original and not deleted
      if (kind === 'repost' && repostOfId) {
        const target = await tx.post.findUnique({
          where: { id: repostOfId },
          select: { id: true, kind: true, authorId: true, deletedAt: true },
        });

        if (!target) {
          throw new NotFoundException('Repost target post not found');
        }
        if (target.deletedAt !== null) {
          throw new BadRequestException('Cannot repost a deleted post');
        }
        if (target.kind !== 'original') {
          throw new UnprocessableEntityException('Can only repost an original post');
        }

        // Check if user already reposted this original
        const existingRepost = await tx.post.findFirst({
          where: {
            authorId,
            repostOfId,
            kind: 'repost',
          },
        });
        if (existingRepost) {
          throw new ConflictException('You have already reposted this post');
        }

        targetRepostAuthorId = target.authorId;
      }

      // 3. Create post
      try {
        const created = await tx.post.create({
          data: {
            authorId,
            kind,
            text: kind === 'repost' ? null : text?.trim(),
            replyToId: kind === 'reply' ? replyToId : null,
            repostOfId: kind === 'repost' ? repostOfId : null,
          },
          include: {
            author: true,
            media: true,
            repostOf: {
              include: {
                author: true,
              },
            },
          },
        });

        // 3.5 Insert media if provided
        if (command.media && Array.isArray(command.media) && command.media.length > 0 && kind === 'original') {
          for (let idx = 0; idx < Math.min(command.media.length, 4); idx++) {
            const m = command.media[idx];
            if (m && m.largeUrl) {
              await tx.$executeRawUnsafe(
                `INSERT INTO post_media (post_id, position, alt_text, width, height, small_url, large_url)
                 VALUES ($1::uuid, $2, $3, $4, $5, $6, $7)`,
                created.id,
                idx,
                (m.altText || text?.trim()?.slice(0, 50) || 'Post photo').trim() || 'Post photo',
                m.width || 800,
                m.height || 800,
                m.smallUrl || m.largeUrl,
                m.largeUrl
              );
            }
          }
        }

        const finalCreated = (command.media && command.media.length > 0)
          ? await tx.post.findUnique({
              where: { id: created.id },
              include: {
                author: true,
                media: {
                  orderBy: { position: 'asc' },
                },
                repostOf: {
                  include: {
                    author: true,
                  },
                },
              },
            })
          : created;

        // 4. Emit notifications inside same transaction
        if (kind === 'reply' && targetReplyAuthorId) {
          await NotificationRepository.emitNotification(tx, {
            recipientId: targetReplyAuthorId,
            actorId: authorId,
            eventType: 'reply',
            postId: created.id,
            sourceEventId: `reply:${created.id}`,
          });
        } else if (kind === 'repost' && targetRepostAuthorId) {
          await NotificationRepository.emitNotification(tx, {
            recipientId: targetRepostAuthorId,
            actorId: authorId,
            eventType: 'repost',
            postId: created.id,
            sourceEventId: `repost:${created.id}`,
          });
        }

        return {
          item: mapPostItem(finalCreated || created, 0, 0, false),
        };
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          // P2002: unique constraint violation
          if (error.code === 'P2002') {
            throw new ConflictException('Post creation conflicted with existing unique constraint');
          }
        }
        throw error;
      }
    });
  }

  async updatePost(
    id: string,
    authorId: string,
    updateDto: any
  ): Promise<{ item: PostItemDto }> {
    if (!updateDto || typeof updateDto !== 'object') {
      throw new BadRequestException('Invalid request body');
    }

    // 1. Immutable & unrecognized fields check
    for (const key of Object.keys(updateDto)) {
      if (IMMUTABLE_POST_FIELDS.has(key)) {
        throw new BadRequestException(`Field '${key}' is immutable and cannot be updated`);
      }
      if (!ALLOWED_POST_UPDATE_FIELDS.has(key)) {
        throw new BadRequestException(`Field '${key}' is not allowed for post update`);
      }
    }

    if (updateDto.text === undefined) {
      throw new BadRequestException('text field is required for post update');
    }

    const trimmedText = typeof updateDto.text === 'string' ? updateDto.text.trim() : '';
    if (trimmedText.length === 0 || updateDto.text.length > 280) {
      throw new UnprocessableEntityException('Post text must be between 1 and 280 characters');
    }

    // 2. Fetch target post
    const existing = await this.prisma.post.findUnique({
      where: { id },
    });

    if (!existing || existing.deletedAt !== null) {
      throw new NotFoundException('Post not found');
    }

    if (existing.authorId !== authorId) {
      throw new ForbiddenException('You can only edit your own posts');
    }

    if (existing.kind === 'repost') {
      throw new BadRequestException('Reposts cannot be edited');
    }

    // 3. Optimistic Concurrency Control (OCC)
    if (updateDto.version !== undefined && updateDto.version !== existing.version) {
      throw new ConflictException(
        `Edit conflict: expected version ${updateDto.version} but post is at version ${existing.version}`
      );
    }

    // Atomic compare-and-swap
    const updateResult = await this.prisma.post.updateMany({
      where: {
        id,
        version: existing.version,
        deletedAt: null,
      },
      data: {
        text: trimmedText,
        version: { increment: 1 },
        updatedAt: new Date(),
      },
    });

    if (updateResult.count === 0) {
      throw new ConflictException('Concurrent edit conflict. The post was modified by another session.');
    }

    // 4. Return updated post
    const updated = await this.prisma.post.findUnique({
      where: { id },
      include: {
        author: true,
        media: {
          orderBy: { position: 'asc' },
        },
        repostOf: {
          include: {
            author: true,
          },
        },
      },
    });

    const [likeCount, replyCount] = await Promise.all([
      this.prisma.postLike.count({ where: { postId: id } }),
      this.prisma.post.count({ where: { replyToId: id, kind: 'reply' } }),
    ]);

    return {
      item: mapPostItem(updated!, likeCount, replyCount, false),
    };
  }

  async deletePost(
    id: string,
    authorId: string
  ): Promise<{ success: boolean; id: string; message: string }> {
    const post = await this.prisma.post.findUnique({
      where: { id },
      select: { id: true, authorId: true, deletedAt: true },
    });

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (post.authorId !== authorId) {
      throw new ForbiddenException('You can only delete your own posts');
    }

    // Idempotent: if already deleted, return success without error
    if (post.deletedAt !== null) {
      return {
        success: true,
        id: post.id,
        message: 'Post already deleted',
      };
    }

    await this.prisma.post.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });

    return {
      success: true,
      id: post.id,
      message: 'Post deleted successfully',
    };
  }
}