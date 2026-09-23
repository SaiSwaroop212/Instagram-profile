import { PostItemDto, AuthorDto, MediaDto } from './post-response.dto.js';

export interface PostWithRelations {
  id: string;
  kind: string;
  text: string | null;
  createdAt: Date;
  replyToId: string | null;
  repostOfId: string | null;
  author: {
    id: string;
    handle: string;
    displayName: string;
    avatarSmallUrl: string;
    avatarLargeUrl: string;
  };
  media?: Array<{
    id: string;
    altText: string;
    width: number;
    height: number;
    position: number;
    smallUrl: string;
    largeUrl: string;
  }>;
  repostOf?: {
    id: string;
    text: string | null;
    author: {
      id: string;
      handle: string;
      displayName: string;
      avatarSmallUrl: string;
      avatarLargeUrl: string;
    };
  } | null;
}

export function mapAuthor(user: {
  id: string;
  handle: string;
  displayName: string;
  avatarSmallUrl: string;
  avatarLargeUrl: string;
}): AuthorDto {
  return {
    id: user.id,
    handle: user.handle,
    displayName: user.displayName,
    avatar: {
      smallUrl: user.avatarSmallUrl,
      largeUrl: user.avatarLargeUrl,
    },
  };
}

export function mapMedia(
  mediaList?: Array<{
    id: string;
    altText: string;
    width: number;
    height: number;
    position: number;
    smallUrl: string;
    largeUrl: string;
  }>
): MediaDto[] {
  if (!mediaList || mediaList.length === 0) return [];
  return mediaList.map((m) => ({
    id: m.id,
    altText: m.altText,
    width: m.width,
    height: m.height,
    position: m.position,
    smallUrl: m.smallUrl,
    largeUrl: m.largeUrl,
  }));
}

export function mapPostItem(
  post: PostWithRelations,
  likeCount: number,
  replyCount: number,
  likedByViewer: boolean
): PostItemDto {
  const result: PostItemDto = {
    id: post.id,
    kind: post.kind,
    text: post.text,
    createdAt: post.createdAt.toISOString(),
    author: mapAuthor(post.author),
    media: mapMedia(post.media),
    likeCount,
    replyCount,
    likedByViewer,
    replyToId: post.replyToId,
    repostOfId: post.repostOfId,
  };

  if (post.repostOf) {
    result.referencedPost = {
      id: post.repostOf.id,
      text: post.repostOf.text,
      author: mapAuthor(post.repostOf.author),
    };
  }

  return result;
}
