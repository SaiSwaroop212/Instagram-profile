import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { PostService } from './post.service.js';
import { CreatePostDto } from './create-post.dto.js';

@Controller('posts')
export class PostController {
  constructor(private readonly postService: PostService) {}

  @Get(':id')
  getPost(@Param('id') id: string) {
    return this.postService.getPostById(id);
  }

  @Post()
  createPost(@Body() body: CreatePostDto) {
    return this.postService.createPost(body);
  }

  @Post(':id/like')
  @HttpCode(200)
  likePost(@Param('id') id: string) {
    return this.postService.setLike(id, true);
  }

  @Delete(':id/like')
  unlikePost(@Param('id') id: string) {
    return this.postService.setLike(id, false);
  }
}