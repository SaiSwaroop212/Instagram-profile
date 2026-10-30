import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { FeedService } from './feed.service.js';
import { parseLimit } from '../common/cursor.util.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/public.decorator.js';

@Controller('feed')
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @UseGuards(AuthGuard)
  @Public()
  @Get()
  getFeed(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('page') page?: string,
    @Query('scope') scope?: string,
    @CurrentUser('id') viewerId?: string
  ) {
    if (page !== undefined) {
      throw new BadRequestException('page parameter is not supported. Use cursor instead.');
    }

    if (scope !== undefined && !['following', 'public'].includes(scope)) {
      throw new BadRequestException('scope must be either "following" or "public"');
    }

    const parsedLimit = parseLimit(limit, 10);
    return this.feedService.getFeed(parsedLimit, cursor, viewerId, scope);
  }

  @UseGuards(AuthGuard)
  @Public()
  @Get('public')
  getPublicFeed(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('page') page?: string,
    @CurrentUser('id') viewerId?: string
  ) {
    if (page !== undefined) {
      throw new BadRequestException('page parameter is not supported. Use cursor instead.');
    }

    const parsedLimit = parseLimit(limit, 10);
    return this.feedService.getFeed(parsedLimit, cursor, viewerId, 'public');
  }
}