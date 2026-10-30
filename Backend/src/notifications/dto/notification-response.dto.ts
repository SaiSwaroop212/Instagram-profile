import { AuthorDto } from '../../common/dto/post-response.dto.js';

export interface NotificationPostSummaryDto {
  id: string;
  kind: string;
  text: string | null;
  isDeleted: boolean;
}

export interface DeviceNotificationMetadata {
  deviceType: string;
  browser: string;
  os: string;
  loginTime: string;
  [key: string]: any;
}

export interface NotificationItemDto {
  id: string;
  eventType: 'like' | 'reply' | 'repost' | 'follow' | 'follow_request' | 'NEW_LOGIN' | 'new_login' | string;
  createdAt: string;
  readAt: string | null;
  sourceEventId: string;
  actor: AuthorDto;
  post: NotificationPostSummaryDto | null;
  metadata?: DeviceNotificationMetadata | Record<string, any> | null;
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
