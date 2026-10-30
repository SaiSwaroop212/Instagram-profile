import { AuthorDto } from '../../common/dto/post-response.dto.js';

export interface NotificationPostSummaryDto {
  id: string;
  kind: string;
  text: string | null;
  isDeleted: boolean;
}

export interface NotificationItemDto {
  id: string;
  eventType: 'like' | 'reply' | 'repost' | 'follow' | 'follow_request';
  createdAt: string;
  readAt: string | null;
  sourceEventId: string;
  actor: AuthorDto;
  post: NotificationPostSummaryDto | null;
}

export interface PaginatedNotificationsDto {
  items: NotificationItemDto[];
  nextCursor: string | null;
  hasMore: boolean;
  unreadCount: number;
}

export interface UnreadCountDto {
  unreadCount: number;
}
