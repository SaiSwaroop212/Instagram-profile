import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { requestContext } from './app-logger.js';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();
    const incomingId = req.headers['x-request-id'];
    const requestId =
      typeof incomingId === 'string' && incomingId.trim().length > 0
        ? incomingId.trim()
        : randomUUID();

    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-Id', requestId);

    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.ip ||
      req.socket?.remoteAddress ||
      'unknown';

    const userHandle = req.body?.handle ? ` [@${req.body.handle}]` : '';
    console.log(`[${requestId}] ${req.method} ${req.originalUrl}${userHandle} (IP: ${clientIp})`);

    res.on('finish', () => {
      const durationMs = Date.now() - startTime;
      console.log(`[${requestId}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs}ms)`);
    });

    requestContext.run({ requestId }, () => {
      next();
    });
  }
}
