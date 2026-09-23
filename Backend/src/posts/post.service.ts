import { Injectable, NotFoundException } from '@nestjs/common';
import { PostRepository, CreatePostCommand } from './post.repository.js';
import { LikeRepository } from './like.repository.js';
import { config } from '../config/config.js';

@Injectable()
export class PostService {
  constructor(
    private readonly postRepository: PostRepository,
    private readonly likeRepository: LikeRepository
  ) {}

  async getPostById(id: string, viewerId: string = config.demoUserId) {
    const post = await this.postRepository.getPostById(id, viewerId);

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    return post;
  }

  async createPost(command: CreatePostCommand, authorId: string = config.demoUserId) {
    return this.postRepository.createPost(authorId, command);
  }

  async setLike(postId: string, desiredState: boolean, viewerId: string = config.demoUserId) {
    return this.likeRepository.setLike(postId, viewerId, desiredState);
  }
}