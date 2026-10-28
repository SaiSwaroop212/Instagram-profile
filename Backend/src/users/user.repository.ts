import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  PaginatedPostsDto,
  PaginatedUsersDto,
  SafeUserSummaryDto,
  UserProfileDto,
} from '../common/dto/post-response.dto.js';
import { NotificationRepository } from '../notifications/notification.repository.js';
import { decodeCursor, encodeCursor, parseLimit } from '../common/cursor.util.js';
import { fetchBatchMetrics } from '../common/batch-metrics.util.js';
import { mapPostItem } from '../common/dto/dto-mapper.util.js';
import { Prisma, type User } from '@prisma/client';

export interface UpdateProfileData {
  displayName?: string;
  bio?: string;
  avatarSmallUrl?: string;
  avatarLargeUrl?: string;
  handle?: string;
  isPrivate?: boolean;
}

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getUserById(idOrHandle: string, viewerId?: string): Promise<{ item: UserProfileDto }> {
    const effectiveId = (idOrHandle.toLowerCase() === 'me' && viewerId) ? viewerId : idOrHandle;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(effectiveId);

    const user = await this.prisma.user.findFirst({
      where: isUuid
        ? { id: effectiveId, deactivatedAt: null }
        : { handle: effectiveId.toLowerCase(), deactivatedAt: null },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [postCount, followerCount, followingCount] = await Promise.all([
      this.prisma.post.count({
        where: {
          authorId: user.id,
          kind: 'original',
          deletedAt: null,
        },
      }),
      this.prisma.follow.count({
        where: {
          followingId: user.id,
          status: 'accepted',
          follower: { deactivatedAt: null },
        },
      }),
      this.prisma.follow.count({
        where: {
          followerId: user.id,
          status: 'accepted',
          following: { deactivatedAt: null },
        },
      }),
    ]);

    let relationship = {
      following: false,
      status: 'none' as 'none' | 'pending' | 'accepted',
      followedBy: false,
    };

    if (viewerId) {
      const [followOut, followIn] = await Promise.all([
        this.prisma.follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: viewerId,
              followingId: user.id,
            },
          },
        }),
        this.prisma.follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: user.id,
              followingId: viewerId,
            },
          },
        }),
      ]);

      relationship = {
        following: followOut?.status === 'accepted',
        status: (followOut?.status as 'pending' | 'accepted') || 'none',
        followedBy: followIn?.status === 'accepted',
      };
    }

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
        isPrivate: user.isPrivate,
        following: relationship.following,
        relationship,
      },
    };
  }

  async findRawUserById(idOrHandle: string): Promise<User | null> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrHandle);
    return this.prisma.user.findFirst({
      where: isUuid ? { id: idOrHandle } : { handle: idOrHandle.toLowerCase() },
    });
  }

  async updateProfile(userId: string, data: UpdateProfileData): Promise<{ item: UserProfileDto }> {
    try {
      const updatedUser = await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      });

      const [postCount, followerCount, followingCount] = await Promise.all([
        this.prisma.post.count({
          where: {
            authorId: updatedUser.id,
            kind: 'original',
            deletedAt: null,
          },
        }),
        this.prisma.follow.count({
          where: {
            followingId: updatedUser.id,
            status: 'accepted',
            follower: { deactivatedAt: null },
          },
        }),
        this.prisma.follow.count({
          where: {
            followerId: updatedUser.id,
            status: 'accepted',
            following: { deactivatedAt: null },
          },
        }),
      ]);

      return {
        item: {
          id: updatedUser.id,
          handle: updatedUser.handle,
          displayName: updatedUser.displayName,
          bio: updatedUser.bio,
          avatar: {
            smallUrl: updatedUser.avatarSmallUrl,
            largeUrl: updatedUser.avatarLargeUrl,
          },
          postCount,
          followerCount,
          followingCount,
          isPrivate: updatedUser.isPrivate,
        },
      };
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Handle is already taken');
      }
      throw err;
    }
  }

  async deactivateUser(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { deactivatedAt: new Date() },
      }),
      this.prisma.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async followUser(
    targetIdOrHandle: string,
    viewerId: string
  ): Promise<{ following: boolean; status: 'accepted' | 'pending'; followerCount: number }> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetIdOrHandle);
    const targetUser = await this.prisma.user.findFirst({
      where: isUuid
        ? { id: targetIdOrHandle, deactivatedAt: null }
        : { handle: targetIdOrHandle.toLowerCase(), deactivatedAt: null },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    if (targetUser.id === viewerId) {
      throw new BadRequestException('Users cannot follow themselves');
    }

    const desiredStatus = targetUser.isPrivate ? 'pending' : 'accepted';

    // Desired-state follow handling:
    // If relationship already exists, return current valid state (or upgrade pending -> accepted if target went public)
    const existing = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: viewerId,
          followingId: targetUser.id,
        },
      },
    });

    let followStatus: 'accepted' | 'pending';

    try {
      if (existing) {
        if (existing.status === 'accepted') {
          followStatus = 'accepted';
        } else {
          if (!targetUser.isPrivate && existing.status !== 'accepted') {
            await this.prisma.follow.update({
              where: {
                followerId_followingId: {
                  followerId: viewerId,
                  followingId: targetUser.id,
                },
              },
              data: { status: 'accepted' },
            });
            followStatus = 'accepted';
          } else {
            followStatus = existing.status as 'pending' | 'accepted';
          }
        }
      } else {
        const created = await this.prisma.follow.upsert({
          where: {
            followerId_followingId: {
              followerId: viewerId,
              followingId: targetUser.id,
            },
          },
          update: desiredStatus === 'accepted' ? { status: 'accepted' } : {},
          create: {
            followerId: viewerId,
            followingId: targetUser.id,
            status: desiredStatus,
          },
        });
        followStatus = created.status as 'accepted' | 'pending';
      }
    } catch (err: any) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const raceRow = await this.prisma.follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: viewerId,
              followingId: targetUser.id,
            },
          },
        });
        followStatus = (raceRow?.status as 'accepted' | 'pending') || desiredStatus;
      } else {
        throw err;
      }
    }

    const followerCount = await this.prisma.follow.count({
      where: {
        followingId: targetUser.id,
        status: 'accepted',
        follower: { deactivatedAt: null },
      },
    });

    if (followStatus === 'accepted') {
      await NotificationRepository.emitNotification(this.prisma, {
        recipientId: targetUser.id,
        actorId: viewerId,
        eventType: 'follow',
        postId: null,
        sourceEventId: `follow:${viewerId}:${targetUser.id}`,
      });
    } else if (followStatus === 'pending') {
      await NotificationRepository.emitNotification(this.prisma, {
        recipientId: targetUser.id,
        actorId: viewerId,
        eventType: 'follow_request',
        postId: null,
        sourceEventId: `follow_request:${viewerId}:${targetUser.id}`,
      });
    }

    return {
      following: followStatus === 'accepted',
      status: followStatus,
      followerCount,
    };
  }

  async unfollowUser(
    targetIdOrHandle: string,
    viewerId: string
  ): Promise<{ following: boolean; status: 'none'; followerCount: number }> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetIdOrHandle);
    const targetUser = await this.prisma.user.findFirst({
      where: isUuid
        ? { id: targetIdOrHandle, deactivatedAt: null }
        : { handle: targetIdOrHandle.toLowerCase(), deactivatedAt: null },
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

    await NotificationRepository.revokeNotification(this.prisma, `follow:${viewerId}:${targetUser.id}`);
    await NotificationRepository.revokeNotification(this.prisma, `follow_request:${viewerId}:${targetUser.id}`);

    const followerCount = await this.prisma.follow.count({
      where: {
        followingId: targetUser.id,
        status: 'accepted',
        follower: { deactivatedAt: null },
      },
    });

    return { following: false, status: 'none', followerCount };
  }

  async acceptFollowRequest(
    actorId: string,
    requesterIdOrHandle: string
  ): Promise<{ success: boolean; status: 'accepted' }> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requesterIdOrHandle);
    const requester = await this.prisma.user.findFirst({
      where: isUuid
        ? { id: requesterIdOrHandle, deactivatedAt: null }
        : { handle: requesterIdOrHandle.toLowerCase(), deactivatedAt: null },
    });

    if (!requester) {
      throw new NotFoundException('Requester not found');
    }

    const follow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: requester.id,
          followingId: actorId,
        },
      },
    });

    if (!follow || follow.status !== 'pending') {
      throw new NotFoundException('Pending follow request not found');
    }

    await this.prisma.follow.update({
      where: {
        followerId_followingId: {
          followerId: requester.id,
          followingId: actorId,
        },
      },
      data: { status: 'accepted' },
    });

    await NotificationRepository.revokeNotification(this.prisma, `follow_request:${requester.id}:${actorId}`);

    await NotificationRepository.emitNotification(this.prisma, {
      recipientId: requester.id,
      actorId,
      eventType: 'follow',
      postId: null,
      sourceEventId: `follow_accept:${actorId}:${requester.id}`,
    });

    return { success: true, status: 'accepted' };
  }

  async rejectFollowRequest(
    actorId: string,
    requesterIdOrHandle: string
  ): Promise<{ success: boolean; status: 'rejected' }> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requesterIdOrHandle);
    const requester = await this.prisma.user.findFirst({
      where: isUuid
        ? { id: requesterIdOrHandle, deactivatedAt: null }
        : { handle: requesterIdOrHandle.toLowerCase(), deactivatedAt: null },
    });

    if (!requester) {
      throw new NotFoundException('Requester not found');
    }

    const follow = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: requester.id,
          followingId: actorId,
        },
      },
    });

    if (!follow || follow.status !== 'pending') {
      throw new NotFoundException('Pending follow request not found');
    }

    await this.prisma.follow.delete({
      where: {
        followerId_followingId: {
          followerId: requester.id,
          followingId: actorId,
        },
      },
    });

    await NotificationRepository.revokeNotification(this.prisma, `follow_request:${requester.id}:${actorId}`);

    return { success: true, status: 'rejected' };
  }

  async getFollowers(
    targetIdOrHandle: string,
    limit: number,
    cursor?: string,
    viewerId?: string
  ): Promise<PaginatedUsersDto> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetIdOrHandle);
    const targetUser = await this.prisma.user.findFirst({
      where: isUuid
        ? { id: targetIdOrHandle, deactivatedAt: null }
        : { handle: targetIdOrHandle.toLowerCase(), deactivatedAt: null },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    // Visibility check for private profiles
    if (targetUser.isPrivate && viewerId !== targetUser.id) {
      let isApproved = false;
      if (viewerId) {
        const follow = await this.prisma.follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: viewerId,
              followingId: targetUser.id,
            },
          },
        });
        isApproved = follow?.status === 'accepted';
      }
      if (!isApproved) {
        throw new ForbiddenException('This account is private');
      }
    }

    const follows = await this.prisma.follow.findMany({
      where: {
        followingId: targetUser.id,
        status: 'accepted',
        follower: { deactivatedAt: null },
      },
      take: limit + 1,
      ...(cursor
        ? {
            skip: 1,
            cursor: {
              followerId_followingId: {
                followerId: cursor,
                followingId: targetUser.id,
              },
            },
          }
        : {}),
      orderBy: [{ createdAt: 'desc' }, { followerId: 'desc' }],
      include: {
        follower: true,
      },
    });

    const hasMore = follows.length > limit;
    const activeFollows = hasMore ? follows.slice(0, limit) : follows;

    const items: SafeUserSummaryDto[] = activeFollows.map((f) => ({
      id: f.follower.id,
      handle: f.follower.handle,
      displayName: f.follower.displayName,
      bio: f.follower.bio,
      avatar: {
        smallUrl: f.follower.avatarSmallUrl,
        largeUrl: f.follower.avatarLargeUrl,
      },
      isPrivate: f.follower.isPrivate,
    }));

    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    return {
      items,
      nextCursor,
      hasMore,
    };
  }

  async getFollowing(
    targetIdOrHandle: string,
    limit: number,
    cursor?: string,
    viewerId?: string
  ): Promise<PaginatedUsersDto> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetIdOrHandle);
    const targetUser = await this.prisma.user.findFirst({
      where: isUuid
        ? { id: targetIdOrHandle, deactivatedAt: null }
        : { handle: targetIdOrHandle.toLowerCase(), deactivatedAt: null },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    // Visibility check for private profiles
    if (targetUser.isPrivate && viewerId !== targetUser.id) {
      let isApproved = false;
      if (viewerId) {
        const follow = await this.prisma.follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: viewerId,
              followingId: targetUser.id,
            },
          },
        });
        isApproved = follow?.status === 'accepted';
      }
      if (!isApproved) {
        throw new ForbiddenException('This account is private');
      }
    }

    const follows = await this.prisma.follow.findMany({
      where: {
        followerId: targetUser.id,
        status: 'accepted',
        following: { deactivatedAt: null },
      },
      take: limit + 1,
      ...(cursor
        ? {
            skip: 1,
            cursor: {
              followerId_followingId: {
                followerId: targetUser.id,
                followingId: cursor,
              },
            },
          }
        : {}),
      orderBy: [{ createdAt: 'desc' }, { followingId: 'desc' }],
      include: {
        following: true,
      },
    });

    const hasMore = follows.length > limit;
    const activeFollows = hasMore ? follows.slice(0, limit) : follows;

    const items: SafeUserSummaryDto[] = activeFollows.map((f) => ({
      id: f.following.id,
      handle: f.following.handle,
      displayName: f.following.displayName,
      bio: f.following.bio,
      avatar: {
        smallUrl: f.following.avatarSmallUrl,
        largeUrl: f.following.avatarLargeUrl,
      },
      isPrivate: f.following.isPrivate,
    }));

    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].id : null;

    // Check if viewer is following targetUser (for v1 backward compatibility)
    let isFollowing = false;
    if (viewerId) {
      const viewerFollow = await this.prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: viewerId,
            followingId: targetUser.id,
          },
        },
      });
      isFollowing = viewerFollow?.status === 'accepted';
    }

    return {
      items,
      nextCursor,
      hasMore,
      following: isFollowing,
    };
  }

  async isFollowing(targetIdOrHandle: string, viewerId: string): Promise<{ following: boolean }> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetIdOrHandle);
    const targetUser = await this.prisma.user.findFirst({
      where: isUuid
        ? { id: targetIdOrHandle, deactivatedAt: null }
        : { handle: targetIdOrHandle.toLowerCase(), deactivatedAt: null },
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

    return { following: follow?.status === 'accepted' };
  }

  async getUserPosts(
    idOrHandle: string,
    limitParam?: string | number,
    cursorParam?: string,
    viewerId?: string
  ): Promise<PaginatedPostsDto> {
    const effectiveId = (idOrHandle.toLowerCase() === 'me' && viewerId) ? viewerId : idOrHandle;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(effectiveId);

    const user = await this.prisma.user.findFirst({
      where: isUuid
        ? { id: effectiveId, deactivatedAt: null }
        : { handle: effectiveId.toLowerCase(), deactivatedAt: null },
      select: { id: true, isPrivate: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isPrivate && viewerId !== user.id) {
      let isApproved = false;
      if (viewerId) {
        const follow = await this.prisma.follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: viewerId,
              followingId: user.id,
            },
          },
        });
        isApproved = follow?.status === 'accepted';
      }
      if (!isApproved) {
        throw new ForbiddenException('This account is private');
      }
    }

    const limit = parseLimit(limitParam, 10);

    const whereClause: Prisma.PostWhereInput = {
      authorId: user.id,
      kind: 'original',
      deletedAt: null,
    };

    if (cursorParam) {
      const cursor = decodeCursor(cursorParam);
      const cursorDate = new Date(cursor.createdAt);

      whereClause.OR = [
        {
          createdAt: {
            lt: cursorDate,
          },
        },
        {
          createdAt: cursorDate,
          id: {
            lt: cursor.id,
          },
        },
      ];
    }

    const posts = await this.prisma.post.findMany({
      where: whereClause,
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      take: limit + 1,
      include: {
        author: true,
        media: {
          orderBy: { position: 'asc' },
        },
      },
    });

    const hasMore = posts.length > limit;
    const itemsToReturn = hasMore ? posts.slice(0, limit) : posts;

    const postIds = itemsToReturn.map((p) => p.id);
    const metrics = await fetchBatchMetrics(this.prisma, postIds, viewerId);

    const mappedItems = itemsToReturn.map((post) =>
      mapPostItem(
        post,
        metrics.likeCounts.get(post.id) || 0,
        metrics.replyCounts.get(post.id) || 0,
        metrics.viewerLikes.has(post.id)
      )
    );

    const lastItem = itemsToReturn[itemsToReturn.length - 1];
    const nextCursor = hasMore && lastItem ? encodeCursor(lastItem.createdAt, lastItem.id) : null;

    return {
      items: mappedItems,
      nextCursor,
      hasMore,
      feedType: 'user_posts',
      isFallback: false,
    };
  }
}