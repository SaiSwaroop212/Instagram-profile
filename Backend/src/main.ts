import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module.js';
import { config } from './config/config.js';

import { corsOptions } from './config/cors.config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(json({ limit: '25mb' }));
  app.use(urlencoded({ extended: true, limit: '25mb' }));

  app.enableShutdownHooks();
  app.enableCors(corsOptions);

  await app.listen(config.port);

  console.log(`Server running on http://localhost:${config.port}`);
}

bootstrap();