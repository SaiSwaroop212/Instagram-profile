import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { config } from './config/config.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableShutdownHooks();

  app.enableCors({
    origin: (requestOrigin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (like curl, postman, server-to-server)
      if (!requestOrigin) return callback(null, true);
      // Allow any localhost or 127.0.0.1 port (e.g. 5173, 5174, 5175...)
      if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(requestOrigin)) {
        return callback(null, true);
      }
      if (requestOrigin === config.frontendOrigin) {
        return callback(null, true);
      }
      callback(new Error(`Origin ${requestOrigin} not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  });

  await app.listen(config.port);

  console.log(`Server running on http://localhost:${config.port}`);
}

bootstrap();