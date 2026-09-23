import { PrismaService } from '../prisma/prisma.service.js';

export interface BatchMetrics {
  likeCounts: Map<string, number>;
  replyCounts: Map<string, number>;
  viewerLikes: Set<string>;
}

export async function fetchBatchMetrics(
  prisma: PrismaService,
  postIds: string[],
  viewerId?: string
): Promise<BatchMetrics> {
  const likeCounts = new Map<string, number>();
  const replyCounts = new Map<string, number>();
  const viewerLikes = new Set<string>();

  if (postIds.length === 0) {
    return { likeCounts, replyCounts, viewerLikes };
  }

  // 1. Batch like counts
  const likeGroup = await prisma.postLike.groupBy({
    by: ['postId'],
    where: {
      postId: { in: postIds },
    },
    _count: {
      postId: true,
    },
  });
  for (const item of likeGroup) {
    likeCounts.set(item.postId, item._count.postId);
  }

  // 2. Batch reply counts
  const replyGroup = await prisma.post.groupBy({
    by: ['replyToId'],
    where: {
      replyToId: { in: postIds },
      kind: 'reply',
    },
    _count: {
      replyToId: true,
    },
  });
  for (const item of replyGroup) {
    if (item.replyToId) {
      replyCounts.set(item.replyToId, item._count.replyToId);
    }
  }

  // 3. Batch viewer likes (single query)
  if (viewerId) {
    const viewerLikedPosts = await prisma.postLike.findMany({
      where: {
        postId: { in: postIds },
        userId: viewerId,
      },
      select: {
        postId: true,
      },
    });
    for (const item of viewerLikedPosts) {
      viewerLikes.add(item.postId);
    }
  }

  return { likeCounts, replyCounts, viewerLikes };
}
