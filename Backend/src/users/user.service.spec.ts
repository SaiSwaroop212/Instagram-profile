import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UserService } from './user.service.js';
import { UserRepository } from './user.repository.js';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { SafeUser } from '../auth/auth.repository.js';

describe('UserService (Unit - Stage 2: JS-P0-02)', () => {
  let userService: UserService;
  let mockUserRepo: any;

  const mockActor: SafeUser = {
    id: 'user-aaa-111',
    handle: 'user_a',
    displayName: 'User A',
    bio: 'Original bio',
    avatarSmallUrl: '/fixtures/a-48.jpg',
    avatarLargeUrl: '/fixtures/a-96.jpg',
    createdAt: new Date(),
    updatedAt: new Date(),
    deactivatedAt: null,
  };

  beforeEach(() => {
    mockUserRepo = {
      getUserById: vi.fn(),
      findRawUserById: vi.fn(),
      updateProfile: vi.fn(),
      deactivateUser: vi.fn(),
      followUser: vi.fn(),
      unfollowUser: vi.fn(),
      isFollowing: vi.fn(),
      acceptFollowRequest: vi.fn(),
      rejectFollowRequest: vi.fn(),
      getFollowers: vi.fn(),
      getFollowing: vi.fn(),
    };
    userService = new UserService(mockUserRepo as unknown as UserRepository);
  });

  describe('updateProfile', () => {
    it('should allow owner to update valid editable fields (displayName, bio)', async () => {
      mockUserRepo.updateProfile.mockResolvedValue({
        item: {
          id: mockActor.id,
          handle: mockActor.handle,
          displayName: 'Updated Name',
          bio: 'Updated bio',
          avatar: { smallUrl: mockActor.avatarSmallUrl, largeUrl: mockActor.avatarLargeUrl },
          postCount: 0,
          followerCount: 0,
          followingCount: 0,
        },
      });

      const res = await userService.updateProfile(mockActor, 'me', {
        displayName: '  Updated Name  ',
        bio: 'Updated bio',
      });

      expect(res.item.displayName).toBe('Updated Name');
      expect(mockUserRepo.updateProfile).toHaveBeenCalledWith(
        mockActor.id,
        expect.objectContaining({
          displayName: 'Updated Name',
          bio: 'Updated bio',
        })
      );
    });

    it('should normalize and update handle when valid', async () => {
      mockUserRepo.updateProfile.mockResolvedValue({
        item: {
          id: mockActor.id,
          handle: 'new_handle',
          displayName: mockActor.displayName,
          bio: mockActor.bio,
          avatar: { smallUrl: mockActor.avatarSmallUrl, largeUrl: mockActor.avatarLargeUrl },
          postCount: 0,
          followerCount: 0,
          followingCount: 0,
        },
      });

      const res = await userService.updateProfile(mockActor, mockActor.id, {
        handle: '  @New_Handle  ',
      });

      expect(res.item.handle).toBe('new_handle');
      expect(mockUserRepo.updateProfile).toHaveBeenCalledWith(
        mockActor.id,
        expect.objectContaining({ handle: 'new_handle' })
      );
    });

    it('should reject cross-user profile update with 403 Forbidden', async () => {
      await expect(
        userService.updateProfile(mockActor, 'user-bbb-222', {
          displayName: 'Hacked Name',
        })
      ).rejects.toThrow(ForbiddenException);

      expect(mockUserRepo.updateProfile).not.toHaveBeenCalled();
    });

    it('should reject attempts to modify immutable fields with 400 Bad Request', async () => {
      const immutableAttempts = [
        { id: 'new-id' },
        { passwordHash: 'new-hash' },
        { createdAt: new Date() },
        { followerCount: 99999 },
        { postCount: 50 },
      ];

      for (const attempt of immutableAttempts) {
        await expect(
          userService.updateProfile(mockActor, 'me', attempt)
        ).rejects.toThrow(BadRequestException);
      }

      expect(mockUserRepo.updateProfile).not.toHaveBeenCalled();
    });

    it('should reject unknown fields with 400 Bad Request', async () => {
      await expect(
        userService.updateProfile(mockActor, 'me', {
          unknownField: 'malicious-data',
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject empty or invalid display names with 400', async () => {
      await expect(
        userService.updateProfile(mockActor, 'me', { displayName: '   ' })
      ).rejects.toThrow(BadRequestException);

      await expect(
        userService.updateProfile(mockActor, 'me', { displayName: 'a'.repeat(51) })
      ).rejects.toThrow(BadRequestException);
    });

    it('should propagate ConflictException when handle is already taken', async () => {
      mockUserRepo.updateProfile.mockRejectedValue(new ConflictException('Handle is already taken'));

      await expect(
        userService.updateProfile(mockActor, 'me', { handle: 'already_taken' })
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('deactivateAccount', () => {
    it('should allow owner to deactivate their account', async () => {
      const res = await userService.deactivateAccount(mockActor, 'me');
      expect(res.success).toBe(true);
      expect(mockUserRepo.deactivateUser).toHaveBeenCalledWith(mockActor.id);
    });

    it('should reject cross-user deactivation with 403 Forbidden', async () => {
      await expect(
        userService.deactivateAccount(mockActor, 'other-user-id')
      ).rejects.toThrow(ForbiddenException);

      expect(mockUserRepo.deactivateUser).not.toHaveBeenCalled();
    });
  });

  describe('Follow Graph & Privacy (Stage 3: JS-P0-03)', () => {
    it('should allow owner to update isPrivate setting', async () => {
      mockUserRepo.updateProfile.mockResolvedValue({
        item: {
          id: mockActor.id,
          handle: mockActor.handle,
          displayName: mockActor.displayName,
          bio: mockActor.bio,
          avatar: { smallUrl: mockActor.avatarSmallUrl, largeUrl: mockActor.avatarLargeUrl },
          postCount: 0,
          followerCount: 0,
          followingCount: 0,
          isPrivate: true,
        },
      });

      const res = await userService.updateProfile(mockActor, 'me', { isPrivate: true });
      expect(res.item.isPrivate).toBe(true);
      expect(mockUserRepo.updateProfile).toHaveBeenCalledWith(
        mockActor.id,
        expect.objectContaining({ isPrivate: true })
      );
    });

    it('should reject non-boolean isPrivate with 400 Bad Request', async () => {
      await expect(
        userService.updateProfile(mockActor, 'me', { isPrivate: 'true' as any })
      ).rejects.toThrow(BadRequestException);
    });

    it('should delegate followUser to repository', async () => {
      mockUserRepo.followUser.mockResolvedValue({ following: true, status: 'accepted', followerCount: 1 });
      const res = await userService.followUser('target-user-id', 'viewer-id');
      expect(res.following).toBe(true);
      expect(mockUserRepo.followUser).toHaveBeenCalledWith('target-user-id', 'viewer-id');
    });

    it('should delegate unfollowUser to repository', async () => {
      mockUserRepo.unfollowUser.mockResolvedValue({ following: false, status: 'none', followerCount: 0 });
      const res = await userService.unfollowUser('target-user-id', 'viewer-id');
      expect(res.following).toBe(false);
      expect(mockUserRepo.unfollowUser).toHaveBeenCalledWith('target-user-id', 'viewer-id');
    });

    it('should delegate acceptFollowRequest and rejectFollowRequest to repository', async () => {
      mockUserRepo.acceptFollowRequest.mockResolvedValue({ success: true, status: 'accepted' });
      mockUserRepo.rejectFollowRequest.mockResolvedValue({ success: true, status: 'rejected' });

      const acceptRes = await userService.acceptFollowRequest('target-id', 'requester-id');
      expect(acceptRes.status).toBe('accepted');

      const rejectRes = await userService.rejectFollowRequest('target-id', 'requester-id');
      expect(rejectRes.status).toBe('rejected');
    });

    it('should validate limit bounds for getFollowers and getFollowing', async () => {
      await expect(
        userService.getFollowers('target-id', 0)
      ).rejects.toThrow(BadRequestException);

      await expect(
        userService.getFollowers('target-id', 51)
      ).rejects.toThrow(BadRequestException);

      await expect(
        userService.getFollowing('target-id', 0)
      ).rejects.toThrow(BadRequestException);

      await expect(
        userService.getFollowing('target-id', 51)
      ).rejects.toThrow(BadRequestException);
    });
  });
});
