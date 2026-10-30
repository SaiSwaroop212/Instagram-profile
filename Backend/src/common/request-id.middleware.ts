import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const incomingId = req.headers['x-request-id'];
    const requestId =
      typeof incomingId === 'string' && incomingId.trim().length > 0
        ? incomingId.trim()
        : randomUUID();

    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-Id', requestId);

    console.log(`[${requestId}] ${req.method} ${req.originalUrl}`);

    res.on('finish', () => {
      console.log(`[${requestId}] ${req.method} ${req.originalUrl} -> ${res.statusCode}`);
    });

    next();
  }
}