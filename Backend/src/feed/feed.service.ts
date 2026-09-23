import { Injectable } from '@nestjs/common';
import { FeedRepository } from './feed.repository.js';
import { config } from '../config/config.js';

@Injectable()
export class FeedService {
  constructor(private readonly feedRepository: FeedRepository) {}

  getFeed(limit?: number | string, cursor?: string, viewerId: string = config.demoUserId) {
    return this.feedRepository.getFeed(limit, cursor, viewerId);
  }
}