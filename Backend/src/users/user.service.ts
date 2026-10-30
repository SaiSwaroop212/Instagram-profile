import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UserRepository } from './user.repository.js';
import { config } from '../config/config.js';
import {
  ALLOWED_PROFILE_UPDATE_FIELDS,
  IMMUTABLE_FIELDS,
  UpdateProfileDto,
} from './dto/update-profile.dto.js';
import { AuthUtil } from '../auth/auth.util.js';
import type { SafeUser } from '../auth/auth.repository.js';

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async getUserById(id: string, viewerId?: string) {
    return this.userRepository.getUserById(id, viewerId);
  }

  async updateProfile(
    actor: SafeUser,
    targetIdOrHandle: string,
    body: Record<string, any>
  ) {
    if (!actor || !actor.id) {
      throw new ForbiddenException('Authentication required');
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Request body must be an object');
    }

    // 1. Authorization Ownership Check
    const isOwner =
      targetIdOrHandle === 'me' ||
      targetIdOrHandle === actor.id ||
      targetIdOrHandle.toLowerCase() === actor.handle.toLowerCase();

    if (!isOwner) {
      throw new ForbiddenException('You can only update your own profile');
    }

    // 2. Strict Allowlist & Immutable Field Rejection
    const keys = Object.keys(body);
    if (keys.length === 0) {
      throw new BadRequestException('At least one field must be provided to update');
    }

    for (const key of keys) {
      if (IMMUTABLE_FIELDS.has(key)) {
        throw new BadRequestException(`Field "${key}" is immutable and cannot be updated`);
      }
      if (!ALLOWED_PROFILE_UPDATE_FIELDS.has(key)) {
        throw new BadRequestException(`Unknown or unsupported field "${key}"`);
      }
    }

    // 3. Field Constraints & Normalization
    const updateData: UpdateProfileDto = {};

    if (body.displayName !== undefined) {
      if (typeof body.displayName !== 'string') {
        throw new BadRequestException('Display name must be a string');
      }
      const trimmed = body.displayName.trim();
      if (trimmed.length < 1 || trimmed.length > 50) {
        throw new BadRequestException('Display name must be between 1 and 50 characters');
      }
      updateData.displayName = trimmed;
    }

    if (body.bio !== undefined) {
      if (typeof body.bio !== 'string') {
        throw new BadRequestException('Bio must be a string');
      }
      if (body.bio.length > 280) {
        throw new BadRequestException('Bio cannot exceed 280 characters');
      }
      updateData.bio = body.bio;
    }

    if (body.avatarSmallUrl !== undefined) {
      if (typeof body.avatarSmallUrl !== 'string' || body.avatarSmallUrl.trim().length === 0) {
        throw new BadRequestException('Avatar small URL must not be empty');
      }
      updateData.avatarSmallUrl = body.avatarSmallUrl.trim();
    }

    if (body.avatarLargeUrl !== undefined) {
      if (typeof body.avatarLargeUrl !== 'string' || body.avatarLargeUrl.trim().length === 0) {
        throw new BadRequestException('Avatar large URL must not be empty');
      }
      updateData.avatarLargeUrl = body.avatarLargeUrl.trim();
    }

    if (body.handle !== undefined) {
      if (typeof body.handle !== 'string') {
        throw new BadRequestException('Handle must be a string');
      }
      const normalizedHandle = AuthUtil.normalizeHandle(body.handle);
      if (!/^[a-z0-9_]{1,30}$/.test(normalizedHandle)) {
        throw new BadRequestException(
          'Handle must be 1-30 lowercase characters, numbers, or underscores'
        );
      }
      updateData.handle = normalizedHandle;
    }

    if (body.isPrivate !== undefined) {
      if (typeof body.isPrivate !== 'boolean') {
        throw new BadRequestException('isPrivate must be a boolean');
      }
      updateData.isPrivate = body.isPrivate;
    }

    return this.userRepository.updateProfile(actor.id, updateData);
  }

  async deactivateAccount(actor: SafeUser, targetIdOrHandle: string) {
    if (!actor || !actor.id) {
      throw new ForbiddenException('Authentication required');
    }

    const isOwner =
      targetIdOrHandle === 'me' ||
      targetIdOrHandle === actor.id ||
      targetIdOrHandle.toLowerCase() === actor.handle.toLowerCase();

    if (!isOwner) {
      throw new ForbiddenException('You can only deactivate your own account');
    }

    await this.userRepository.deactivateUser(actor.id);
    return { success: true, message: 'Account deactivated successfully' };
  }

  async followUser(targetId: string, viewerId = config.demoUserId) {
    return this.userRepository.followUser(targetId, viewerId);
  }

  async unfollowUser(targetId: string, viewerId = config.demoUserId) {
    return this.userRepository.unfollowUser(targetId, viewerId);
  }

  async acceptFollowRequest(actorId: string, requesterId: string) {
    return this.userRepository.acceptFollowRequest(actorId, requesterId);
  }

  async rejectFollowRequest(actorId: string, requesterId: string) {
    return this.userRepository.rejectFollowRequest(actorId, requesterId);
  }

  async getFollowers(
    targetId: string,
    limit = 10,
    cursor?: string,
    viewerId?: string
  ) {
    if (limit < 1 || limit > 50) {
      throw new BadRequestException('Limit must be between 1 and 50');
    }
    return this.userRepository.getFollowers(targetId, limit, cursor, viewerId);
  }

  async getFollowing(
    targetId: string,
    limit = 10,
    cursor?: string,
    viewerId?: string
  ) {
    if (limit < 1 || limit > 50) {
      throw new BadRequestException('Limit must be between 1 and 50');
    }
    return this.userRepository.getFollowing(targetId, limit, cursor, viewerId);
  }

  async isFollowing(targetId: string, viewerId = config.demoUserId) {
    return this.userRepository.isFollowing(targetId, viewerId);
  }

  async getUserPosts(
    targetId: string,
    limit = 10,
    cursor?: string,
    viewerId?: string
  ) {
    return this.userRepository.getUserPosts(targetId, limit, cursor, viewerId);
  }
}