import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { SearchService } from './search.service.js';
import { parseLimit } from '../common/cursor.util.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/public.decorator.js';

@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @UseGuards(AuthGuard)
  @Public()
  @Get('posts')
  searchPosts(
    @Query('q') query?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @CurrentUser('id') viewerId?: string
  ) {
    const parsedLimit = parseLimit(limit, 10);
    return this.searchService.searchPosts(query, parsedLimit, cursor, viewerId);
  }

  @UseGuards(AuthGuard)
  @Public()
  @Get('users')
  searchUsers(
    @Query('q') query?: string,
    @Query('limit') limit?: string,
    @CurrentUser('id') viewerId?: string
  ) {
    const parsedLimit = parseLimit(limit, 10);
    return this.searchService.searchUsers(query, parsedLimit, viewerId);
  }
}