export class CreatePostDto {
  kind: 'original' | 'reply' | 'repost';
  text?: string | null;
  replyToId?: string | null;
  repostOfId?: string | null;
}
