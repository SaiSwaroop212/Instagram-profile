import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface.js';
import { config } from './config.js';

export const corsOptions: CorsOptions = {
  origin: (requestOrigin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (curl, mobile, server-to-server)
    if (!requestOrigin) return callback(null, true);

    // Allow loopback / localhost origins on any port
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(requestOrigin)) {
      return callback(null, true);
    }

    // Allow configured production frontend origin or any vercel app deployment
    if (requestOrigin === config.frontendOrigin || (requestOrigin && /^https:\/\/[a-zA-Z0-9.-]+\.vercel\.app$/.test(requestOrigin))) {
      return callback(null, true);
    }

    // Disallow any other origin
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Request-Id'],
};
