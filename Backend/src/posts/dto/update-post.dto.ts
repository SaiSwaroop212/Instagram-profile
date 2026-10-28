export class UpdatePostDto {
  text?: string;
  version?: number;
}

export const ALLOWED_POST_UPDATE_FIELDS = new Set([
  'text',
  'version',
]);

export const IMMUTABLE_POST_FIELDS = new Set([
  'id',
  'kind',
  'authorId',
  'author',
  'createdAt',
  'updatedAt',
  'deletedAt',
  'replyToId',
  'repostOfId',
  'replyTargetKind',
  'repostTargetKind',
  'media',
  'likeCount',
  'replyCount',
]);
