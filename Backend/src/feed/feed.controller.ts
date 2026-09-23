import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { FeedService } from './feed.service.js';
import { parseLimit } from '../common/cursor.util.js';

@Controller('feed')
export class FeedController {
  constructor(private readonly feedService: FeedService) {}

  @Get()
  getFeed(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('page') page?: string
  ) {
    if (page !== undefined) {
      throw new BadRequestException('page parameter is not supported. Use cursor instead.');
    }

    const parsedLimit = parseLimit(limit, 10);
    return this.feedService.getFeed(parsedLimit, cursor);
  }
}