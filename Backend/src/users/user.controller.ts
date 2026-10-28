import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserService } from './user.service.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/public.decorator.js';
import type { SafeUser } from '../auth/auth.repository.js';
import { parseLimit } from '../common/cursor.util.js';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @UseGuards(AuthGuard)
  @Patch('me')
  updateMyProfile(
    @CurrentUser() actor: SafeUser,
    @Body() body: Record<string, any>
  ) {
    return this.userService.updateProfile(actor, 'me', body);
  }

  @UseGuards(AuthGuard)
  @Post('me/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivateMyAccount(@CurrentUser() actor: SafeUser) {
    return this.userService.deactivateAccount(actor, 'me');
  }

  @UseGuards(AuthGuard)
  @Post('requests/:requesterId/accept')
  @HttpCode(HttpStatus.OK)
  acceptFollowRequest(
    @CurrentUser('id') actorId: string,
    @Param('requesterId') requesterId: string
  ) {
    return this.userService.acceptFollowRequest(actorId, requesterId);
  }

  @UseGuards(AuthGuard)
  @Post('requests/:requesterId/reject')
  @HttpCode(HttpStatus.OK)
  rejectFollowRequest(
    @CurrentUser('id') actorId: string,
    @Param('requesterId') requesterId: string
  ) {
    return this.userService.rejectFollowRequest(actorId, requesterId);
  }

  @UseGuards(AuthGuard)
  @Get('me')
  getMyProfile(@CurrentUser('id') actorId: string) {
    return this.userService.getUserById(actorId, actorId);
  }

  @UseGuards(AuthGuard)
  @Get('me/posts')
  getMyPosts(
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @CurrentUser('id') viewerId?: string
  ) {
    const parsedLimit = parseLimit(limit, 10);
    return this.userService.getUserPosts(viewerId!, parsedLimit, cursor, viewerId);
  }

  @UseGuards(AuthGuard)
  @Public()
  @Get(':id/posts')
  getUserPosts(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @CurrentUser('id') viewerId?: string
  ) {
    const parsedLimit = parseLimit(limit, 10);
    return this.userService.getUserPosts(id, parsedLimit, cursor, viewerId);
  }

  @UseGuards(AuthGuard)
  @Public()
  @Get(':id')
  getUser(
    @Param('id') id: string,
    @CurrentUser('id') viewerId?: string
  ) {
    return this.userService.getUserById(id, viewerId);
  }

  @UseGuards(AuthGuard)
  @Patch(':id')
  updateProfile(
    @CurrentUser() actor: SafeUser,
    @Param('id') id: string,
    @Body() body: Record<string, any>
  ) {
    return this.userService.updateProfile(actor, id, body);
  }

  @UseGuards(AuthGuard)
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  deactivateAccount(
    @CurrentUser() actor: SafeUser,
    @Param('id') id: string
  ) {
    return this.userService.deactivateAccount(actor, id);
  }

  @UseGuards(AuthGuard)
  @Post(':id/follow')
  @HttpCode(HttpStatus.OK)
  followUser(@CurrentUser('id') actorId: string, @Param('id') id: string) {
    return this.userService.followUser(id, actorId);
  }

  @UseGuards(AuthGuard)
  @Delete(':id/follow')
  unfollowUser(@CurrentUser('id') actorId: string, @Param('id') id: string) {
    return this.userService.unfollowUser(id, actorId);
  }

  @UseGuards(AuthGuard)
  @Public()
  @Get(':id/followers')
  getFollowers(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @CurrentUser('id') viewerId?: string
  ) {
    const parsedLimit = limit !== undefined ? parseLimit(limit, 10) : 10;
    return this.userService.getFollowers(id, parsedLimit, cursor, viewerId);
  }

  @UseGuards(AuthGuard)
  @Public()
  @Get(':id/following')
  getFollowing(
    @Param('id') id: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
    @CurrentUser('id') viewerId?: string
  ) {
    const parsedLimit = limit !== undefined ? parseLimit(limit, 10) : 10;
    return this.userService.getFollowing(id, parsedLimit, cursor, viewerId);
  }
}