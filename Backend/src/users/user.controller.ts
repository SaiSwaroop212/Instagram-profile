import { Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { UserService } from './user.service.js';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get(':id')
  getUser(@Param('id') id: string) {
    return this.userService.getUserById(id);
  }

  @Post(':id/follow')
  followUser(@Param('id') id: string) {
    return this.userService.followUser(id);
  }

  @Delete(':id/follow')
  unfollowUser(@Param('id') id: string) {
    return this.userService.unfollowUser(id);
  }

  @Get(':id/following')
  isFollowing(@Param('id') id: string) {
    return this.userService.isFollowing(id);
  }
}