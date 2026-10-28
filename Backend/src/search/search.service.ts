import { Injectable } from '@nestjs/common';
import { SearchRepository } from './search.repository.js';

@Injectable()
export class SearchService {
  constructor(private readonly searchRepository: SearchRepository) {}

  async searchPosts(
    query?: string,
    limit?: number | string,
    cursor?: string,
    viewerId?: string
  ) {
    return this.searchRepository.searchOriginals(query, limit, cursor, viewerId);
  }

  async searchUsers(
    query?: string,
    limit = 10,
    viewerId?: string
  ) {
    return this.searchRepository.searchUsers(query, limit, viewerId);
  }
}