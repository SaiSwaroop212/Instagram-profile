import { AsyncLocalStorage } from 'node:async_hooks';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const requestContext = new AsyncLocalStorage<{ requestId: string }>();

export type ActivityEventName =
  | 'USER_REGISTERED'
  | 'USER_LOGIN'
  | 'USER_LOGOUT'
  | 'POST_LIKED'
  | 'POST_UNLIKED'
  | 'COMMENT_CREATED'
  | 'COMMENT_DELETED';

export interface ActivityLogContext {
  event: ActivityEventName;
  user: string;
  userId?: string | null;
  postId?: string | null;
  commentId?: string | null;
  requestId?: string | null;
}

export class AppLogger {
  private static logFilePath = path.join(process.cwd(), 'activity.log');

  /**
   * Log an activity event in the standard format:
   * [2026-11-02T12:15:30.000Z] EVENT_NAME | User: <handle> | UserID: <id> [| PostID: <id>] [| CommentID: <id>] [| RequestID: <reqId>]
   */
  static logActivity(context: ActivityLogContext): string {
    const timestamp = new Date().toISOString();
    const parts: string[] = [
      `[${timestamp}] ${context.event}`,
      `User: ${context.user}`,
    ];

    if (context.userId) {
      parts.push(`UserID: ${context.userId}`);
    }

    if (context.postId) {
      parts.push(`PostID: ${context.postId}`);
    }

    if (context.commentId) {
      parts.push(`CommentID: ${context.commentId}`);
    }

    const reqId = context.requestId || requestContext.getStore()?.requestId;
    if (reqId) {
      parts.push(`RequestID: ${reqId}`);
    }

    const line = parts.join(' | ');

    // Always output to console for immediate visibility in terminal
    console.log(line);

    // Also append to activity.log file safely
    try {
      fs.appendFileSync(this.logFilePath, line + '\n', 'utf8');
    } catch {
      // Ignore file write errors in restricted environments
    }

    return line;
  }

  /**
   * Log errors that occur during user activity operations
   */
  static logError(
    operation: string,
    error: any,
    context?: Partial<ActivityLogContext>
  ): void {
    const timestamp = new Date().toISOString();
    const reqId = context?.requestId || requestContext.getStore()?.requestId;
    const msg = error instanceof Error ? error.message : String(error);

    const parts: string[] = [
      `[${timestamp}] ERROR`,
      `Operation: ${operation}`,
      `Message: ${msg}`,
    ];

    if (context?.user) {
      parts.push(`User: ${context.user}`);
    }
    if (context?.userId) {
      parts.push(`UserID: ${context.userId}`);
    }
    if (context?.postId) {
      parts.push(`PostID: ${context.postId}`);
    }
    if (context?.commentId) {
      parts.push(`CommentID: ${context.commentId}`);
    }
    if (reqId) {
      parts.push(`RequestID: ${reqId}`);
    }

    const line = parts.join(' | ');
    console.error(line);

    try {
      fs.appendFileSync(this.logFilePath, line + '\n', 'utf8');
    } catch {
      // Ignore
    }
  }
}
