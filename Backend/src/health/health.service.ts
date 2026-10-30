import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  getLiveStatus() {
    return {
      status: 'ok',
    };
  }

  async getReadyStatus() {
    const isDbReady = await this.prisma.isHealthy();
    if (!isDbReady) {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        message: 'Database connection failed',
      });
    }

    return {
      status: 'ready',
      database: 'connected',
    };
  }
}