import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('live')
  live() {
    return this.healthService.getLiveStatus();
  }

  @Get('ready')
  async ready() {
    return this.healthService.getReadyStatus();
  }
}