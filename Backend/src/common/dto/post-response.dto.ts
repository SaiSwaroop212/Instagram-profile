export interface AuthorDto {
  id: string;
  handle: string;
  displayName: string;
  avatar: {
    smallUrl: string;
    largeUrl: string;
  };
}

export interface MediaDto {
  id: string;
  altText: string;
  width: number;
  height: number;
  position: number;
  smallUrl: string;
  largeUrl: string;
}

export interface PostItemDto {
  id: string;
  kind: string;
  text: string | null;
  createdAt: string;
  author: AuthorDto;
  media: MediaDto[];
  likeCount: number;
  replyCount: number;
  likedByViewer: boolean;
  replyToId: string | null;
  repostOfId: string | null;
  referencedPost?: {
    id: string;
    text: string | null;
    author: AuthorDto;
  } | null;
}

export interface PaginatedPostsDto {
  items: PostItemDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ProfileMediaItemDto {
  id: string;
  postId: string;
  createdAt: string;
  position: number;
  altText: string;
  width: number;
  height: number;
  smallUrl: string;
  largeUrl: string;
}

export interface PaginatedProfileMediaDto {
  items: ProfileMediaItemDto[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface UserProfileDto {
  id: string;
  handle: string;
  displayName: string;
  bio: string;
  avatar: {
    smallUrl: string;
    largeUrl: string;
  };
  postCount: number;
  followerCount: number;
  followingCount: number;
}
