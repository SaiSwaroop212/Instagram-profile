import { Injectable } from '@nestjs/common';
import { NotificationRepository } from './notification.repository.js';

@Injectable()
export class NotificationService {
  constructor(private readonly notificationRepository: NotificationRepository) {}

  async getNotifications(recipientId: string, limit?: number, cursor?: string) {
    return this.notificationRepository.getNotifications(recipientId, limit, cursor);
  }

  async getUnreadCount(recipientId: string) {
    return this.notificationRepository.getUnreadCount(recipientId);
  }

  async markAsRead(notificationId: string, recipientId: string) {
    return this.notificationRepository.markAsRead(notificationId, recipientId);
  }

  async markAllAsRead(recipientId: string, beforeTimestamp?: Date) {
    return this.notificationRepository.markAllAsRead(recipientId, beforeTimestamp);
  }
}
