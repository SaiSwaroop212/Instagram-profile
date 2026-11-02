import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppLogger, requestContext } from './app-logger.js';
import { PostService } from '../posts/post.service.js';

describe('AppLogger & User Activity Logging', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('formats activity logs with UTC timestamp and required fields', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const line = AppLogger.logActivity({
      event: 'USER_LOGIN',
      user: 'swaroop',
      userId: '123',
    });

    expect(consoleSpy).toHaveBeenCalledWith(line);
    // Verifies ISO 8601 UTC format ending in Z
    expect(line).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] USER_LOGIN \| User: swaroop \| UserID: 123$/);
  });

  it('includes RequestID when requestContext has active store', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    let line = '';
    requestContext.run({ requestId: 'req-abc-999' }, () => {
      line = AppLogger.logActivity({
        event: 'USER_LOGOUT',
        user: 'swaroop',
        userId: '123',
      });
    });

    expect(consoleSpy).toHaveBeenCalledWith(line);
    expect(line).toMatch(/USER_LOGOUT \| User: swaroop \| UserID: 123 \| RequestID: req-abc-999$/);
  });

  it('formats POST_LIKED and POST_UNLIKED with PostID', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const likedLine = AppLogger.logActivity({
      event: 'POST_LIKED',
      user: 'swaroop',
      userId: '123',
      postId: '456',
    });

    expect(consoleSpy).toHaveBeenCalledWith(likedLine);
    expect(likedLine).toMatch(/POST_LIKED \| User: swaroop \| UserID: 123 \| PostID: 456$/);

    const unlikedLine = AppLogger.logActivity({
      event: 'POST_UNLIKED',
      user: 'swaroop',
      userId: '123',
      postId: '456',
    });

    expect(consoleSpy).toHaveBeenCalledWith(unlikedLine);
    expect(unlikedLine).toMatch(/POST_UNLIKED \| User: swaroop \| UserID: 123 \| PostID: 456$/);
  });

  it('formats COMMENT_CREATED and COMMENT_DELETED with PostID and CommentID', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const createdLine = AppLogger.logActivity({
      event: 'COMMENT_CREATED',
      user: 'swaroop',
      userId: '123',
      postId: '456',
      commentId: 'cmt-789',
    });

    expect(consoleSpy).toHaveBeenCalledWith(createdLine);
    expect(createdLine).toMatch(/COMMENT_CREATED \| User: swaroop \| UserID: 123 \| PostID: 456 \| CommentID: cmt-789$/);

    const deletedLine = AppLogger.logActivity({
      event: 'COMMENT_DELETED',
      user: 'swaroop',
      userId: '123',
      postId: '456',
      commentId: 'cmt-789',
    });

    expect(consoleSpy).toHaveBeenCalledWith(deletedLine);
    expect(deletedLine).toMatch(/COMMENT_DELETED \| User: swaroop \| UserID: 123 \| PostID: 456 \| CommentID: cmt-789$/);
  });

  it('logs errors when operations fail without crashing', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    AppLogger.logError('COMMENT_CREATED', new Error('Database connection lost'), {
      user: 'swaroop',
      userId: '123',
      postId: '456',
    });

    expect(errorSpy).toHaveBeenCalled();
    const loggedError = errorSpy.mock.calls[0][0];
    expect(loggedError).toContain('ERROR | Operation: COMMENT_CREATED | Message: Database connection lost | User: swaroop | UserID: 123 | PostID: 456');
  });

  describe('PostService integration', () => {
    it('logs COMMENT_CREATED when a reply post is created', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const mockPostRepo: any = {
        createPost: vi.fn().mockResolvedValue({
          item: {
            id: 'cmt-101',
            author: { id: 'user-1', handle: 'swaroop' },
          },
        }),
      };
      const mockLikeRepo: any = {};

      const service = new PostService(mockPostRepo, mockLikeRepo);
      await service.createPost(
        { kind: 'reply', replyToId: 'post-555', text: 'Nice post!' },
        'user-1',
        'swaroop'
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/COMMENT_CREATED \| User: swaroop \| UserID: user-1 \| PostID: post-555 \| CommentID: cmt-101/)
      );
    });

    it('logs POST_LIKED and POST_UNLIKED on setLike', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const mockPostRepo: any = {};
      const mockLikeRepo: any = {
        setLike: vi.fn().mockResolvedValue({ postId: 'post-100', likedByViewer: true, likeCount: 5 }),
      };

      const service = new PostService(mockPostRepo, mockLikeRepo);
      await service.setLike('post-100', true, 'user-1', 'swaroop');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/POST_LIKED \| User: swaroop \| UserID: user-1 \| PostID: post-100/)
      );

      mockLikeRepo.setLike.mockResolvedValueOnce({ postId: 'post-100', likedByViewer: false, likeCount: 4 });
      await service.setLike('post-100', false, 'user-1', 'swaroop');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/POST_UNLIKED \| User: swaroop \| UserID: user-1 \| PostID: post-100/)
      );
    });

    it('logs COMMENT_DELETED when a reply is deleted', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const mockPostRepo: any = {
        deletePost: vi.fn().mockResolvedValue({
          success: true,
          id: 'cmt-101',
          message: 'Post deleted successfully',
          kind: 'reply',
          replyToId: 'post-555',
        }),
      };
      const mockLikeRepo: any = {};

      const service = new PostService(mockPostRepo, mockLikeRepo);
      await service.deletePost('cmt-101', 'user-1', 'swaroop');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/COMMENT_DELETED \| User: swaroop \| UserID: user-1 \| PostID: post-555 \| CommentID: cmt-101/)
      );
    });
  });
});
