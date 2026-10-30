import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PostService } from './post.service.js';
import { CreatePostDto } from './create-post.dto.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { Public } from '../auth/public.decorator.js';

@Controller('posts')
export class PostController {
  constructor(private readonly postService: PostService) {}

  @UseGuards(AuthGuard)
  @Public()
  @Get(':id')
  getPost(@Param('id') id: string, @CurrentUser('id') viewerId?: string) {
    return this.postService.getPostById(id, viewerId);
  }

  @UseGuards(AuthGuard)
  @Post()
  createPost(@CurrentUser('id') actorId: string, @Body() body: CreatePostDto) {
    return this.postService.createPost(body, actorId);
  }

  @UseGuards(AuthGuard)
  @Post(':id/like')
  @HttpCode(200)
  likePost(@CurrentUser('id') actorId: string, @Param('id') id: string) {
    return this.postService.setLike(id, true, actorId);
  }

  @UseGuards(AuthGuard)
  @Delete(':id/like')
  unlikePost(@CurrentUser('id') actorId: string, @Param('id') id: string) {
    return this.postService.setLike(id, false, actorId);
  }

  @UseGuards(AuthGuard)
  @Patch(':id')
  updatePost(
    @CurrentUser('id') actorId: string,
    @Param('id') id: string,
    @Body() body: any
  ) {
    return this.postService.updatePost(id, actorId, body);
  }

  @UseGuards(AuthGuard)
  @Delete(':id')
  @HttpCode(200)
  deletePost(@CurrentUser('id') actorId: string, @Param('id') id: string) {
    return this.postService.deletePost(id, actorId);
  }
}