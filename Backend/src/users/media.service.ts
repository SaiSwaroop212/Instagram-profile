import { Injectable } from '@nestjs/common';
import { MediaRepository } from './media.repository.js';

@Injectable()
export class MediaService {
  constructor(private readonly mediaRepository: MediaRepository) {}

  async getMediaByUserId(
    userId: string,
    limit?: number | string,
    cursor?: string,
    viewerId?: string
  ) {
    return this.mediaRepository.getMediaByUserId(userId, limit, cursor, viewerId);
  }
}