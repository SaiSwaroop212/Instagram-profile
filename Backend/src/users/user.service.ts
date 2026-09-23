import { Injectable } from '@nestjs/common';
import { UserRepository } from './user.repository.js';
import { config } from '../config/config.js';

@Injectable()
export class UserService {
  constructor(private readonly userRepository: UserRepository) {}

  async getUserById(id: string) {
    return this.userRepository.getUserById(id);
  }

  async followUser(targetId: string, viewerId = config.demoUserId) {
    return this.userRepository.followUser(targetId, viewerId);
  }

  async unfollowUser(targetId: string, viewerId = config.demoUserId) {
    return this.userRepository.unfollowUser(targetId, viewerId);
  }

  async isFollowing(targetId: string, viewerId = config.demoUserId) {
    return this.userRepository.isFollowing(targetId, viewerId);
  }
}