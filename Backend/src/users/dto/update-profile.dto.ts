export class UpdateProfileDto {
  displayName?: string;
  bio?: string;
  avatarSmallUrl?: string;
  avatarLargeUrl?: string;
  handle?: string;
  isPrivate?: boolean;
}

export const ALLOWED_PROFILE_UPDATE_FIELDS = new Set([
  'displayName',
  'bio',
  'avatarSmallUrl',
  'avatarLargeUrl',
  'handle',
  'isPrivate',
]);

export const IMMUTABLE_FIELDS = new Set([
  'id',
  'passwordHash',
  'password',
  'createdAt',
  'updatedAt',
  'deactivatedAt',
  'followerCount',
  'followingCount',
  'postCount',
]);
