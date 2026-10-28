import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthService } from './auth.service.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      if (isPublic) {
        return true;
      }

      // Isolated test identity support (only in test environment)
      if (process.env.NODE_ENV === 'test') {
        const testUserId =
          (request.headers['x-test-user-id'] as string) ||
          (process.env.ALLOW_V1_TEST_DEMO_FALLBACK === 'true'
            ? 'a0000000-0000-4000-8000-000000000001'
            : null);

        if (testUserId) {
          const testUser = await this.authService.getTestUser(testUserId);
          if (testUser) {
            (request as any).user = testUser;
            (request as any).sessionId = 'test-session-id';
            return true;
          }
        }
      }

      throw new UnauthorizedException('Authentication required');
    }

    const authResult = await this.authService.validateSession(token);

    if (!authResult) {
      if (isPublic) {
        return true;
      }
      throw new UnauthorizedException('Session is invalid or expired');
    }

    (request as any).user = authResult.user;
    (request as any).sessionId = authResult.sessionId;

    return true;
  }

  private extractToken(request: Request): string | null {
    // 1. Authorization: Bearer <token>
    const authHeader = request.headers.authorization;
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }

    // 2. Custom header: X-Session-Token: <token>
    const sessionHeader = request.headers['x-session-token'];
    if (sessionHeader && typeof sessionHeader === 'string') {
      return sessionHeader.trim();
    }

    // 3. Cookie header: session=<token>
    const cookieHeader = request.headers.cookie;
    if (cookieHeader && typeof cookieHeader === 'string') {
      const match = cookieHeader.match(/(?:^|;\s*)(?:session|session_token)=([^;]+)/);
      if (match) {
        return decodeURIComponent(match[1]);
      }
    }

    return null;
  }
}
