import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { ReplyService } from './reply.service.js';
import { parseLimit } from '../common/cursor.util.js';

@Controller('posts')
export class ReplyController {
  constructor(private readonly replyService: ReplyService) {}

  @Get(':id/replies')
  getReplies(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('page') page?: string
  ) {
    if (page !== undefined) {
      throw new BadRequestException('page parameter is not supported. Use cursor instead.');
    }

    const parsedLimit = parseLimit(limit, 10);
    return this.replyService.getRepliesByPostId(id, parsedLimit, cursor);
  }
}