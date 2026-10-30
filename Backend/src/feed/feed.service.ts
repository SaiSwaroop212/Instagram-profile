import { Injectable } from '@nestjs/common';
import { FeedRepository } from './feed.repository.js';

@Injectable()
export class FeedService {
  constructor(private readonly feedRepository: FeedRepository) {}

  getFeed(
    limit?: number | string,
    cursor?: string,
    viewerId?: string,
    scope?: string
  ) {
    return this.feedRepository.getFeed(limit, cursor, viewerId, scope);
  }
}