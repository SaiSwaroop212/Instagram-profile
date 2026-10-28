export class CreatePostDto {
  kind: 'original' | 'reply' | 'repost';
  text?: string | null;
  replyToId?: string | null;
  repostOfId?: string | null;
  media?: Array<{
    smallUrl: string;
    largeUrl: string;
    altText?: string;
    width?: number;
    height?: number;
  }>;
}
