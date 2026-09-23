import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserProfileDto } from '../common/dto/post-response.dto.js';

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getUserById(idOrHandle: string): Promise<{ item: UserProfileDto }> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrHandle);

    const user = await this.prisma.user.findFirst({
      where: isUuid ? { id: idOrHandle } : { handle: idOrHandle.toLowerCase() },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [postCount, followerCount, followingCount] = await Promise.all([
      this.prisma.post.count({
        where: {
          authorId: user.id,
          kind: 'original',
        },
      }),
      this.prisma.follow.count({
        where: {
          followingId: user.id,
        },
      }),
      this.prisma.follow.count({
        where: {
          followerId: user.id,
        },
      }),
    ]);

    return {
      item: {
        id: user.id,
        handle: user.handle,
        displayName: user.displayName,
        bio: user.bio,
        avatar: {
          smallUrl: user.avatarSmallUrl,
          largeUrl: user.avatarLargeUrl,
        },
        postCount,
        followerCount,
        followingCount,
      },
    };
  }

  async followUser(
    targetIdOrHandle: string,
    viewerId: string
  ): Promise<{ following: boolean; followerCount: number }> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetIdOrHandle);
    const targetUser = await this.prisma.user.findFirst({
      where: isUuid ? { id: targetIdOrHandle } : { handle: targetIdOrHandle.toLowerCase() },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    if (targetUser.id === viewerId) {
      throw new BadRequestException('Users cannot follow themselves');
    }

    // Idempotent follow
    await this.prisma.follow.upsert({
      where: {
        followerId_followingId: {
          followerId: viewerId,
          followingId: targetUser.id,
        },
      },
      update: {},
      create: {
        followerId: viewerId,
        followingId: targetUser.id,
      },
    });

    const followerCount = await this.prisma.follow.count({
      where: { followingId: targetUser.id },
    });

    return { following: true, followerCount };
  }

  async unfollowUser(
    targetIdOrHandle: string,
    viewerId: string
  ): Promise<{ following: boolean; followerCount: number }> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetIdOrHandle);
    const targetUser = await this.prisma.user.findFirst({
      where: isUuid ? { id: targetIdOrHandle } : { handle: targetIdOrHandle.toLowerCase() },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.follow.deleteMany({
      where: {
        followerId: viewerId,
        followingId: targetUser.id,
      },
    });

    const followerCount = await this.prisma.follow.count({
      where: { followingId: targetUser.id },
    });

    return { following: false, followerCount };
  }

  async isFollowing(targetIdOrHandle: string, viewerId: string): Promise<{ following: boolean }> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetIdOrHandle);
    const targetUser = await this.prisma.user.findFirst({
      where: isUuid ? { id: targetIdOrHandle } : { handle: targetIdOrHandle.toLowerCase() },
    });

    if (!targetUser) {
      return { following: false };
    }

    const follow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: viewerId,
          followingId: targetUser.id,
        },
      },
    });

    return { following: Boolean(follow) };
  }
}