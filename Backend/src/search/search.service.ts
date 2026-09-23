import { Injectable } from '@nestjs/common';
import { SearchRepository } from './search.repository.js';
import { config } from '../config/config.js';

@Injectable()
export class SearchService {
  constructor(private readonly searchRepository: SearchRepository) {}

  async searchPosts(
    query?: string,
    limit?: number | string,
    cursor?: string,
    viewerId: string = config.demoUserId
  ) {
    return this.searchRepository.searchOriginals(query, limit, cursor, viewerId);
  }
}