import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '@prisma/client';

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
    // 1. Verify post exists
    const postExists = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true },
    });

    if (!postExists) {
      throw new NotFoundException('Post not found');
    }

    // 2. Perform desired state operation
    if (desiredState) {
      try {
        await this.prisma.postLike.create({
          data: {
            postId,
            userId: viewerId,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          // P2002: unique constraint violation (already liked)
          // Idempotent: repeated like keeps state liked
          if (error.code === 'P2002') {
            // Already liked, ignore duplicate insert
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }
    } else {
      // Unlike: delete if present, idempotent
      await this.prisma.postLike.deleteMany({
        where: {
          postId,
          userId: viewerId,
        },
      });
    }

    // 3. Authoritative count
    const likeCount = await this.prisma.postLike.count({
      where: { postId },
    });

    return {
      postId,
      likedByViewer: desiredState,
      likeCount,
    };
  }
}
