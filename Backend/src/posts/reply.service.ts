import { Injectable } from '@nestjs/common';
import { ReplyRepository } from './reply.repository.js';
import { config } from '../config/config.js';

@Injectable()
export class ReplyService {
  constructor(private readonly replyRepository: ReplyRepository) {}

  async getRepliesByPostId(
    postId: string,
    limit?: number | string,
    cursor?: string,
    viewerId: string = config.demoUserId
  ) {
    return this.replyRepository.getRepliesByPostId(postId, limit, cursor, viewerId);
  }
}