import {
  MiddlewareConsumer,
  Module,
  NestModule,
} from '@nestjs/common';

import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

import { PrismaModule } from './prisma/prisma.module.js';

import { HealthController } from './health/health.controller.js';
import { HealthService } from './health/health.service.js';

import { FeedController } from './feed/feed.controller.js';
import { FeedService } from './feed/feed.service.js';
import { FeedRepository } from './feed/feed.repository.js';

import { PostController } from './posts/post.controller.js';
import { PostService } from './posts/post.service.js';
import { PostRepository } from './posts/post.repository.js';
import { LikeRepository } from './posts/like.repository.js';

import { UserController } from './users/user.controller.js';
import { UserService } from './users/user.service.js';
import { UserRepository } from './users/user.repository.js';

import { ReplyController } from './posts/reply.controller.js';
import { ReplyService } from './posts/reply.service.js';
import { ReplyRepository } from './posts/reply.repository.js';

import { MediaController } from './users/media.controller.js';
import { MediaService } from './users/media.service.js';
import { MediaRepository } from './users/media.repository.js';

// Search
import { SearchController } from './search/search.controller.js';
import { SearchService } from './search/search.service.js';
import { SearchRepository } from './search/search.repository.js';

// Request ID middleware
import { RequestIdMiddleware } from './common/request-id.middleware.js';

@Module({
  imports: [PrismaModule],

  controllers: [
    AppController,
    HealthController,
    FeedController,
    PostController,
    UserController,
    ReplyController,
    MediaController,
    SearchController,
  ],

  providers: [
    AppService,
    HealthService,
    FeedService,
    FeedRepository,
    PostService,
    PostRepository,
    LikeRepository,
    UserService,
    UserRepository,
    ReplyService,
    ReplyRepository,
    MediaService,
    MediaRepository,
    SearchService,
    SearchRepository,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}