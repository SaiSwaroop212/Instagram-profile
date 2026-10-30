import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthSession, User } from '@prisma/client';

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

  async createSession(userId: string, tokenHash: string, expiresAt: Date): Promise<AuthSession> {
    return this.prisma.authSession.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
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
