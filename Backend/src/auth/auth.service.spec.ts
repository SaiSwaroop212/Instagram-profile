import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthService } from './auth.service.js';
import { AuthRepository } from './auth.repository.js';
import { AuthUtil } from './auth.util.js';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { NotificationRepository } from '../notifications/notification.repository.js';
import { Prisma } from '@prisma/client';

describe('AuthService (Unit)', () => {
  let authService: AuthService;
  let mockAuthRepo: any;
  let mockNotificationRepo: any;

  beforeEach(() => {
    mockAuthRepo = {
      findUserByHandle: vi.fn(),
      findUserById: vi.fn(),
      createUser: vi.fn(),
      createSession: vi.fn(),
      findSessionWithUser: vi.fn(),
      revokeSession: vi.fn(),
      revokeAllUserSessions: vi.fn(),
      isDeviceRecognised: vi.fn().mockResolvedValue(true),
      findActiveSessionsByUserId: vi.fn(),
      findSessionById: vi.fn(),
      revokeSessionById: vi.fn(),
    };
    mockNotificationRepo = {
      emitNotification: vi.fn().mockResolvedValue({ id: 'notif-1' }),
    };
    authService = new AuthService(
      mockAuthRepo as unknown as AuthRepository,
      mockNotificationRepo as unknown as NotificationRepository,
    );
  });

  describe('AuthUtil', () => {
    it('should hash and verify passwords correctly', async () => {
      const password = 'SecretPassword123!';
      const hash = await AuthUtil.hashPassword(password);

      expect(hash).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$/);
      expect(await AuthUtil.verifyPassword(password, hash)).toBe(true);
      expect(await AuthUtil.verifyPassword('WrongPass', hash)).toBe(false);
    });

    it('should normalize handles reliably', () => {
      expect(AuthUtil.normalizeHandle('  @Asha_Sharma  ')).toBe('asha_sharma');
      expect(AuthUtil.normalizeHandle('John_Doe')).toBe('john_doe');
      expect(AuthUtil.normalizeHandle('')).toBe('');
    });

    it('should generate 64-char hex session token and sha-256 hash', () => {
      const token = AuthUtil.generateSessionToken();
      expect(token).toHaveLength(64);
      const hash = AuthUtil.hashSessionToken(token);
      expect(hash).toHaveLength(64);
      expect(hash).not.toBe(token);
    });
  });

  describe('register', () => {
    it('should register a new user and return token and sanitized user', async () => {
      const dto = {
        handle: '  @new_user  ',
        displayName: 'New User',
        password: 'ValidPassword123!',
      };

      const createdUser = {
        id: 'u-123',
        handle: 'new_user',
        displayName: 'New User',
        passwordHash: 'scrypt:salt:hash',
        bio: '',
        avatarSmallUrl: '/fixtures/default-avatar-48.jpg',
        avatarLargeUrl: '/fixtures/default-avatar-96.jpg',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockAuthRepo.createUser.mockResolvedValue(createdUser);
      mockAuthRepo.createSession.mockResolvedValue({ id: 's-123' });

      const res = await authService.register(dto);

      expect(res).toHaveProperty('token');
      expect(res.user.handle).toBe('new_user');
      expect((res.user as any).passwordHash).toBeUndefined();
      expect(mockAuthRepo.createUser).toHaveBeenCalledWith(
        expect.objectContaining({
          handle: 'new_user',
          displayName: 'New User',
        })
      );
    });

    it('should throw ConflictException on duplicate handle race (Prisma P2002)', async () => {
      const error = new Prisma.PrismaClientKnownRequestError('Unique violation', {
        code: 'P2002',
        clientVersion: '6.0.0',
      });
      mockAuthRepo.createUser.mockRejectedValue(error);

      await expect(
        authService.register({
          handle: 'duplicate_user',
          displayName: 'Duplicate',
          password: 'Password123!',
        })
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException on short password (< 8 chars)', async () => {
      await expect(
        authService.register({
          handle: 'valid_handle',
          displayName: 'Valid',
          password: 'short',
        })
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException on invalid handle format', async () => {
      await expect(
        authService.register({
          handle: 'invalid-handle-with-dashes!',
          displayName: 'Valid',
          password: 'Password123!',
        })
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('login', () => {
    it('should login successfully with valid handle and password', async () => {
      const password = 'Password123!';
      const hash = await AuthUtil.hashPassword(password);
      mockAuthRepo.findUserByHandle.mockResolvedValue({
        id: 'u-1',
        handle: 'asha',
        displayName: 'Asha',
        passwordHash: hash,
      });
      mockAuthRepo.createSession.mockResolvedValue({ id: 's-1' });

      const res = await authService.login({ handle: 'ASHA', password });

      expect(res).toHaveProperty('token');
      expect(res.user.handle).toBe('asha');
      expect((res.user as any).passwordHash).toBeUndefined();
    });

    it('should throw UnauthorizedException on nonexistent user without revealing existence', async () => {
      mockAuthRepo.findUserByHandle.mockResolvedValue(null);

      await expect(
        authService.login({ handle: 'nonexistent', password: 'Password123!' })
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException on wrong password', async () => {
      const hash = await AuthUtil.hashPassword('CorrectPassword123!');
      mockAuthRepo.findUserByHandle.mockResolvedValue({
        id: 'u-1',
        handle: 'asha',
        passwordHash: hash,
      });

      await expect(
        authService.login({ handle: 'asha', password: 'WrongPassword' })
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateSession', () => {
    it('should return null for expired session', async () => {
      mockAuthRepo.findSessionWithUser.mockResolvedValue({
        id: 's-1',
        expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
        revokedAt: null,
        user: { id: 'u-1', handle: 'asha' },
      });

      const res = await authService.validateSession('some-token');
      expect(res).toBeNull();
    });

    it('should return null for revoked session', async () => {
      mockAuthRepo.findSessionWithUser.mockResolvedValue({
        id: 's-1',
        expiresAt: new Date(Date.now() + 100000),
        revokedAt: new Date(), // Revoked
        user: { id: 'u-1', handle: 'asha' },
      });

      const res = await authService.validateSession('some-token');
      expect(res).toBeNull();
    });

    it('should return user for active valid session', async () => {
      mockAuthRepo.findSessionWithUser.mockResolvedValue({
        id: 's-1',
        expiresAt: new Date(Date.now() + 100000),
        revokedAt: null,
        user: { id: 'u-1', handle: 'asha' },
      });

      const res = await authService.validateSession('some-token');
      expect(res).not.toBeNull();
      expect(res?.user.handle).toBe('asha');
    });
  });

  describe('logout & logoutAll', () => {
    it('should revoke session on logout', async () => {
      const token = 'my-token';
      await authService.logout(token);
      expect(mockAuthRepo.revokeSession).toHaveBeenCalledWith(
        AuthUtil.hashSessionToken(token)
      );
    });

    it('should revoke all user sessions on logoutAll', async () => {
      await authService.logoutAll('u-123');
      expect(mockAuthRepo.revokeAllUserSessions).toHaveBeenCalledWith('u-123');
    });
  });

  describe('new-device login notifications', () => {
    it('should emit NEW_LOGIN notification when logging in from a new device', async () => {
      const password = 'Password123!';
      const hash = await AuthUtil.hashPassword(password);
      mockAuthRepo.findUserByHandle.mockResolvedValue({
        id: 'u-1',
        handle: 'asha',
        displayName: 'Asha',
        passwordHash: hash,
      });
      mockAuthRepo.createSession.mockResolvedValue({ id: 's-1' });
      mockAuthRepo.isDeviceRecognised.mockResolvedValue(false);

      const deviceInfo = {
        deviceType: 'mobile',
        browser: 'Safari',
        os: 'iOS',
        ipAddress: '127.0.0.1',
        userAgent: 'iPhone Safari',
      };

      await authService.login({ handle: 'asha', password }, deviceInfo);

      expect(mockNotificationRepo.emitNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientId: 'u-1',
          actorId: 'u-1',
          eventType: 'NEW_LOGIN',
          metadata: expect.objectContaining({
            deviceType: 'mobile',
            browser: 'Safari',
            os: 'iOS',
          }),
        })
      );
    });

    it('should NOT emit NEW_LOGIN notification when device is already recognised', async () => {
      const password = 'Password123!';
      const hash = await AuthUtil.hashPassword(password);
      mockAuthRepo.findUserByHandle.mockResolvedValue({
        id: 'u-1',
        handle: 'asha',
        displayName: 'Asha',
        passwordHash: hash,
      });
      mockAuthRepo.createSession.mockResolvedValue({ id: 's-1' });
      mockAuthRepo.isDeviceRecognised.mockResolvedValue(true);

      const deviceInfo = {
        deviceType: 'desktop',
        browser: 'Chrome',
        os: 'Windows',
      };

      await authService.login({ handle: 'asha', password }, deviceInfo);

      expect(mockNotificationRepo.emitNotification).not.toHaveBeenCalled();
    });
  });

  describe('active sessions management', () => {
    it('should return active sessions with sanitized properties and isCurrent flag', async () => {
      const mockSessions = [
        {
          id: 's-1',
          userId: 'u-1',
          deviceType: 'desktop',
          browser: 'Chrome',
          os: 'Windows',
          ipAddress: '192.168.1.1',
          createdAt: new Date('2026-10-30T10:00:00Z'),
          tokenHash: 'secret-hash-must-not-leak',
        },
        {
          id: 's-2',
          userId: 'u-1',
          deviceType: 'mobile',
          browser: 'Safari',
          os: 'iOS',
          ipAddress: null,
          createdAt: new Date('2026-10-30T11:00:00Z'),
          tokenHash: 'another-secret-hash',
        },
      ];
      mockAuthRepo.findActiveSessionsByUserId.mockResolvedValue(mockSessions);

      const result = await authService.getActiveSessions('u-1', 's-1');

      expect(result.sessions).toHaveLength(2);
      expect(result.sessions[0].id).toBe('s-1');
      expect(result.sessions[0].isCurrent).toBe(true);
      expect(result.sessions[1].isCurrent).toBe(false);
      expect((result.sessions[0] as any).tokenHash).toBeUndefined();
      expect((result.sessions[1] as any).tokenHash).toBeUndefined();
    });

    it('should revoke a session owned by the user', async () => {
      mockAuthRepo.findSessionById.mockResolvedValue({
        id: 's-1',
        userId: 'u-1',
      });
      mockAuthRepo.revokeSessionById.mockResolvedValue({ id: 's-1' });

      const res = await authService.revokeUserSessionById('u-1', 's-1');
      expect(res.success).toBe(true);
      expect(mockAuthRepo.revokeSessionById).toHaveBeenCalledWith('s-1');
    });

    it('should throw ForbiddenException if user attempts to revoke another users session', async () => {
      mockAuthRepo.findSessionById.mockResolvedValue({
        id: 's-other',
        userId: 'u-other',
      });

      await expect(
        authService.revokeUserSessionById('u-1', 's-other')
      ).rejects.toThrow(ForbiddenException);
      expect(mockAuthRepo.revokeSessionById).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException if session does not exist', async () => {
      mockAuthRepo.findSessionById.mockResolvedValue(null);

      await expect(
        authService.revokeUserSessionById('u-1', 's-nonexistent')
      ).rejects.toThrow(NotFoundException);

    });
  });
});
