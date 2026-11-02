import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PostRepository, CreatePostCommand } from './post.repository.js';
import { LikeRepository } from './like.repository.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { config } from '../config/config.js';
import { AppLogger } from '../common/app-logger.js';

@Injectable()
export class PostService {
  constructor(
    private readonly postRepository: PostRepository,
    private readonly likeRepository: LikeRepository,
    @Optional() private readonly prisma?: PrismaService
  ) {}

  async getPostById(id: string, viewerId?: string) {
    const post = await this.postRepository.getPostById(id, viewerId);

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return post;
  }

  async createPost(
    command: CreatePostCommand,
    authorId: string = config.demoUserId,
    authorHandle?: string
  ) {
    try {
      const result = await this.postRepository.createPost(authorId, command);

      if (command.kind === 'reply') {
        const handle = authorHandle || result?.item?.author?.handle || authorId;
        AppLogger.logActivity({
          event: 'COMMENT_CREATED',
          user: handle,
          userId: authorId,
          postId: command.replyToId,
          commentId: result.item.id,
        });
      }

      return result;
    } catch (error) {
      if (command.kind === 'reply') {
        AppLogger.logError('COMMENT_CREATED', error, {
          user: authorHandle || authorId,
          userId: authorId,
          postId: command.replyToId,
        });
      }
      throw error;
    }
  }

  async setLike(
    postId: string,
    desiredState: boolean,
    viewerId: string = config.demoUserId,
    viewerHandle?: string
  ) {
    const eventName = desiredState ? 'POST_LIKED' : 'POST_UNLIKED';
    try {
      const result = await this.likeRepository.setLike(postId, viewerId, desiredState);

      let handle = viewerHandle;
      if (!handle && this.prisma) {
        try {
          const user = await this.prisma.user.findUnique({
            where: { id: viewerId },
            select: { handle: true },
          });
          if (user) handle = user.handle;
        } catch {
          // ignore lookup failure
        }
      }
      handle = handle || viewerId;

      AppLogger.logActivity({
        event: eventName,
        user: handle,
        userId: viewerId,
        postId,
      });

      return result;
    } catch (error) {
      AppLogger.logError(eventName, error, {
        user: viewerHandle || viewerId,
        userId: viewerId,
        postId,
      });
      throw error;
    }
  }

  async updatePost(id: string, authorId: string, updateDto: any) {
    return this.postRepository.updatePost(id, authorId, updateDto);
  }

  async deletePost(
    id: string,
    authorId: string,
    authorHandle?: string
  ) {
    try {
      const result = await this.postRepository.deletePost(id, authorId);

      const deleteRes = result as typeof result & { kind?: string; replyToId?: string | null };
      if (deleteRes.kind === 'reply') {
        const handle = authorHandle || authorId;
        AppLogger.logActivity({
          event: 'COMMENT_DELETED',
          user: handle,
          userId: authorId,
          postId: deleteRes.replyToId,
          commentId: id,
        });
      }

      return result;
    } catch (error) {
      AppLogger.logError('COMMENT_DELETED', error, {
        user: authorHandle || authorId,
        userId: authorId,
        commentId: id,
      });
      throw error;
    }
  }
}
