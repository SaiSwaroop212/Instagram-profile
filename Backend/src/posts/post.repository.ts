import {
  Injectable,
  NotFoundException,
  ConflictException,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { mapPostItem } from '../common/dto/dto-mapper.util.js';
import { PostItemDto } from '../common/dto/post-response.dto.js';
import { Prisma } from '@prisma/client';

export interface CreatePostCommand {
  kind: 'original' | 'reply' | 'repost';
  text?: string | null;
  replyToId?: string | null;
  repostOfId?: string | null;
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

    if (!post) {
      return null;
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
      // 1. If reply, verify target exists and is an original
      if (kind === 'reply' && replyToId) {
        const target = await tx.post.findUnique({
          where: { id: replyToId },
          select: { id: true, kind: true },
        });

        if (!target) {
          throw new NotFoundException('Reply target post not found');
        }
        if (target.kind !== 'original') {
          throw new UnprocessableEntityException('Can only reply to an original post');
        }
      }

      // 2. If repost, verify target exists and is an original
      if (kind === 'repost' && repostOfId) {
        const target = await tx.post.findUnique({
          where: { id: repostOfId },
          select: { id: true, kind: true },
        });

        if (!target) {
          throw new NotFoundException('Repost target post not found');
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

        return {
          item: mapPostItem(created, 0, 0, false),
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
}