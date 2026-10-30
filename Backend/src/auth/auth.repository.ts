import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthSession, User } from '@prisma/client';
import type { DeviceInfo } from './auth.util.js';

export interface CreateUserData {
  handle: string;
  displayName: string;
  passwordHash: string;
  bio?: string;
  avatarSmallUrl?: string;
  avatarLargeUrl?: string;
  isPrivate?: boolean;
}

export type SafeUser = Omit<User, 'passwordHash'>;

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findUserByHandle(handle: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { handle },
    });
  }

  async findUserById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async createUser(data: CreateUserData): Promise<User> {
    return this.prisma.user.create({
      data: {
        handle: data.handle,
        displayName: data.displayName,
        passwordHash: data.passwordHash,
        bio: data.bio ?? '',
        avatarSmallUrl: data.avatarSmallUrl ?? '/fixtures/default-avatar-48.jpg',
        avatarLargeUrl: data.avatarLargeUrl ?? '/fixtures/default-avatar-96.jpg',
        isPrivate: Boolean(data.isPrivate),
      },
    });
  }

  async createSession(
    userId: string,
    tokenHash: string,
    expiresAt: Date,
    deviceInfo?: DeviceInfo
  ): Promise<AuthSession> {
    return this.prisma.authSession.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        deviceType: deviceInfo?.deviceType ?? null,
        browser: deviceInfo?.browser ?? null,
        os: deviceInfo?.os ?? null,
        ipAddress: deviceInfo?.ipAddress ?? null,
        userAgent: deviceInfo?.userAgent ?? null,
      },
    });
  }

  async isDeviceRecognised(userId: string, deviceInfo?: DeviceInfo): Promise<boolean> {
    if (!deviceInfo) return true;
    const matching = await this.prisma.authSession.findFirst({
      where: {
        userId,
        deviceType: deviceInfo.deviceType,
        browser: deviceInfo.browser,
        os: deviceInfo.os,
      },
    });
    return Boolean(matching);
  }

  async findActiveSessionsByUserId(userId: string): Promise<AuthSession[]> {
    return this.prisma.authSession.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findSessionById(id: string): Promise<AuthSession | null> {
    return this.prisma.authSession.findUnique({
      where: { id },
    });
  }

  async revokeSessionById(sessionId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async findSessionWithUser(tokenHash: string): Promise<(AuthSession & { user: User }) | null> {
    return this.prisma.authSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
  }

  async revokeSession(tokenHash: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
