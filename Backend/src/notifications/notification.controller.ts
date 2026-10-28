import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Query,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { NotificationService } from './notification.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';

@Controller('notifications')
@UseGuards(AuthGuard)
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  getNotifications(
    @CurrentUser('id') viewerId: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string
  ) {
    return this.notificationService.getNotifications(viewerId, limit ? parseInt(limit, 10) : undefined, cursor);
  }

  @Get('unread-count')
  getUnreadCount(@CurrentUser('id') viewerId: string) {
    return this.notificationService.getUnreadCount(viewerId);
  }

  @Patch(':id/read')
  @HttpCode(200)
  markAsReadPatch(
    @CurrentUser('id') viewerId: string,
    @Param('id') id: string
  ) {
    return this.notificationService.markAsRead(id, viewerId);
  }

  @Post(':id/read')
  @HttpCode(200)
  markAsReadPost(
    @CurrentUser('id') viewerId: string,
    @Param('id') id: string
  ) {
    return this.notificationService.markAsRead(id, viewerId);
  }

  @Post('read-all')
  @HttpCode(200)
  markAllAsRead(@CurrentUser('id') viewerId: string) {
    return this.notificationService.markAllAsRead(viewerId);
  }
}
