import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { MediaService } from './media.service.js';
import { parseLimit } from '../common/cursor.util.js';

@Controller('users')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Get(':id/media')
  getMedia(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @Query('page') page?: string
  ) {
    if (page !== undefined) {
      throw new BadRequestException('page parameter is not supported. Use cursor instead.');
    }

    const parsedLimit = parseLimit(limit, 10);
    return this.mediaService.getMediaByUserId(id, parsedLimit, cursor);
  }
}