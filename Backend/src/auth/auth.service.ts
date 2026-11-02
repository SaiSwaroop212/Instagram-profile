import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthRepository, type SafeUser } from './auth.repository.js';
import { AuthUtil, type DeviceInfo } from './auth.util.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { Prisma } from '@prisma/client';
import { NotificationRepository } from '../notifications/notification.repository.js';
import { AppLogger } from '../common/app-logger.js';

export interface AuthResponse {
  token: string;
  user: SafeUser;
}

@Injectable()
export class AuthService {
  // Session lifespan: 7 days
  private readonly sessionDurationMs = 7 * 24 * 60 * 60 * 1000;

  constructor(
    private readonly authRepository: AuthRepository,
    @Optional() private readonly notificationRepository?: NotificationRepository
  ) {}

  private sanitizeUser(user: any): SafeUser {
    const { passwordHash: _passwordHash, ...safe } = user;
    return safe as SafeUser;
  }

  async register(dto: RegisterDto, deviceInfo?: DeviceInfo): Promise<AuthResponse> {
    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException('Request body is required');
    }

    const normalizedHandle = AuthUtil.normalizeHandle(dto.handle);
    if (!normalizedHandle) {
      throw new BadRequestException('Handle is required');
    }

    if (!/^[a-z0-9_]{1,30}$/.test(normalizedHandle)) {
      throw new BadRequestException(
        'Handle must be 1-30 lowercase characters, numbers, or underscores'
      );
    }

    const trimmedDisplayName = dto.displayName ? dto.displayName.trim() : '';
    if (!trimmedDisplayName || trimmedDisplayName.length > 50) {
      throw new BadRequestException('Display name must be between 1 and 50 characters');
    }

    if (!dto.password || typeof dto.password !== 'string' || dto.password.length < 8) {
      throw new BadRequestException('Password must be at least 8 characters long');
    }

    if (dto.password.length > 128) {
      throw new BadRequestException('Password exceeds maximum length of 128 characters');
    }

    const passwordHash = await AuthUtil.hashPassword(dto.password);

    try {
      const user = await this.authRepository.createUser({
        handle: normalizedHandle,
        displayName: trimmedDisplayName,
        passwordHash,
        bio: dto.bio,
        avatarSmallUrl: dto.avatarSmallUrl,
        avatarLargeUrl: dto.avatarLargeUrl,
        isPrivate: Boolean(dto.isPrivate),
      });

      const { token } = await this.createSession(user.id, deviceInfo);
      const safeUser = this.sanitizeUser(user);

      AppLogger.logActivity({
        event: 'USER_REGISTERED',
        user: safeUser.handle,
        userId: safeUser.id,
      });

      return {
        token,
        user: safeUser,
      };
    } catch (err: any) {
      AppLogger.logError('USER_REGISTERED', err, { user: normalizedHandle });
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Handle is already taken');
      }
      throw err;
    }
  }

  async login(dto: LoginDto, deviceInfo?: DeviceInfo): Promise<AuthResponse> {
    if (!dto || !dto.handle || !dto.password) {
      throw new UnauthorizedException('Invalid handle or password');
    }

    const normalizedHandle = AuthUtil.normalizeHandle(dto.handle);
    const user = await this.authRepository.findUserByHandle(normalizedHandle);

    try {
      if (!user || user.deactivatedAt) {
        // Execute dummy constant-time verification to defeat timing enumeration attacks
        await AuthUtil.verifyPassword(dto.password, '');
        throw new UnauthorizedException('Invalid handle or password');
      }

      const isValidPassword = await AuthUtil.verifyPassword(dto.password, user.passwordHash);
      if (!isValidPassword) {
        throw new UnauthorizedException('Invalid handle or password');
      }

      const isRecognised = await this.authRepository.isDeviceRecognised(
        user.id,
        deviceInfo,
      );
      if (!isRecognised && this.notificationRepository) {
        const nowIso = new Date().toISOString();
        await this.notificationRepository.emitNotification({
          recipientId: user.id,
          actorId: user.id,
          eventType: 'NEW_LOGIN',
          metadata: {
            deviceType: deviceInfo?.deviceType || 'unknown',
            browser: deviceInfo?.browser || 'unknown',
            os: deviceInfo?.os || 'unknown',
            loginTime: nowIso,
          },
        });
      }

      const { token } = await this.createSession(user.id, deviceInfo);
      const safeUser = this.sanitizeUser(user);

      AppLogger.logActivity({
        event: 'USER_LOGIN',
        user: safeUser.handle,
        userId: safeUser.id,
      });

      return {
        token,
        user: safeUser,
      };
    } catch (err: any) {
      AppLogger.logError('USER_LOGIN', err, {
        user: normalizedHandle,
        userId: user ? user.id : undefined,
      });
      throw err;
    }
  }

  async createSession(userId: string, deviceInfo?: DeviceInfo): Promise<{ token: string; expiresAt: Date }> {
    const rawToken = AuthUtil.generateSessionToken();
    const tokenHash = AuthUtil.hashSessionToken(rawToken);
    const expiresAt = new Date(Date.now() + this.sessionDurationMs);

    await this.authRepository.createSession(userId, tokenHash, expiresAt, deviceInfo);

    return { token: rawToken, expiresAt };
  }

  async validateSession(rawToken: string): Promise<{ user: SafeUser; sessionId: string } | null> {
    if (!rawToken || typeof rawToken !== 'string') {
      return null;
    }

    const tokenHash = AuthUtil.hashSessionToken(rawToken.trim());
    const session = await this.authRepository.findSessionWithUser(tokenHash);

    if (!session) {
      return null;
    }

    if (session.revokedAt !== null) {
      return null;
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    if (session.user.deactivatedAt) {
      return null;
    }

    return {
      sessionId: session.id,
      user: this.sanitizeUser(session.user),
    };
  }

  async logout(rawToken: string, user?: SafeUser): Promise<void> {
    if (!rawToken) return;
    try {
      const tokenHash = AuthUtil.hashSessionToken(rawToken.trim());
      let currentUser = user;
      if (!currentUser) {
        const sessionWithUser = await this.authRepository.findSessionWithUser(tokenHash);
        if (sessionWithUser) {
          currentUser = this.sanitizeUser(sessionWithUser.user);
        }
      }

      await this.authRepository.revokeSession(tokenHash);

      if (currentUser) {
        AppLogger.logActivity({
          event: 'USER_LOGOUT',
          user: currentUser.handle,
          userId: currentUser.id,
        });
      }
    } catch (err: any) {
      AppLogger.logError('USER_LOGOUT', err, {
        user: user?.handle,
        userId: user?.id,
      });
      throw err;
    }
  }

  async logoutAll(userId: string): Promise<void> {
    try {
      const user = await this.authRepository.findUserById(userId);
      await this.authRepository.revokeAllUserSessions(userId);
      if (user) {
        AppLogger.logActivity({
          event: 'USER_LOGOUT',
          user: user.handle,
          userId: user.id,
        });
      }
    } catch (err: any) {
      AppLogger.logError('USER_LOGOUT', err, { userId });
      throw err;
    }
  }

  async getMe(userId: string): Promise<{ user: SafeUser }> {
    const user = await this.authRepository.findUserById(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return { user: this.sanitizeUser(user) };
  }

  async getTestUser(userId: string): Promise<SafeUser | null> {
    const user = await this.authRepository.findUserById(userId);
    return user ? this.sanitizeUser(user) : null;
  }

  async getActiveSessions(userId: string, currentSessionId?: string) {
    const rawSessions =
      await this.authRepository.findActiveSessionsByUserId(userId);
    const sessions = rawSessions.map((s) => ({
      id: s.id,
      deviceType: s.deviceType || 'unknown',
      browser: s.browser || 'unknown',
      os: s.os || 'unknown',
      ipAddress: s.ipAddress || null,
      createdAt: s.createdAt,
      lastSeenAt: s.createdAt,
      isCurrent: currentSessionId ? s.id === currentSessionId : false,
    }));
    return {
      sessions,
      items: sessions,
      total: sessions.length,
    };
  }

  async revokeUserSessionById(userId: string, sessionId: string) {
    const session = await this.authRepository.findSessionById(sessionId);
    if (!session) {
      throw new NotFoundException('Session not found');
    }
    if (session.userId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to revoke this session',
      );
    }
    await this.authRepository.revokeSessionById(sessionId);
    return { success: true, message: 'Session revoked successfully' };
  }
}
