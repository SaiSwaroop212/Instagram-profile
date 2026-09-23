import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { config, maskDatabaseUrl } from '../config/config.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      datasources: {
        db: {
          url: config.databaseUrl,
        },
      },
      log: process.env.NODE_ENV === 'test' ? [] : ['warn', 'error'],
    });
  }

  async onModuleInit() {
    this.logger.log(`Connecting to PostgreSQL database at ${maskDatabaseUrl(config.databaseUrl)}...`);
    
    // Connect with bounded timeout
    const connectPromise = this.$connect();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`Database connection timed out after ${config.databaseConnectTimeoutMs}ms`)),
        config.databaseConnectTimeoutMs
      )
    );

    try {
      await Promise.race([connectPromise, timeoutPromise]);
      this.logger.log('Database connection established successfully.');
    } catch (error) {
      this.logger.error(`Failed to connect to database: ${(error as Error).message}`);
      throw error;
    }
  }

  async onModuleDestroy() {
    this.logger.log('Disconnecting from database...');
    await this.$disconnect();
    this.logger.log('Database disconnected.');
  }

  // Health check helper for /health/ready
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
