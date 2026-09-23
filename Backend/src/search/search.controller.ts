import { Controller, Get, Query } from '@nestjs/common';
import { SearchService } from './search.service.js';
import { parseLimit } from '../common/cursor.util.js';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get('posts')
  searchPosts(
    @Query('q') query?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string
  ) {
    const parsedLimit = parseLimit(limit, 10);
    return this.searchService.searchPosts(query, parsedLimit, cursor);
  }
}