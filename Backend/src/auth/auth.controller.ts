import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { AuthUtil } from './auth.util.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { Public } from './public.decorator.js';
import { CurrentUser } from './current-user.decorator.js';
import type { SafeUser } from './auth.repository.js';
import { AuthGuard } from './auth.guard.js';

@UseGuards(AuthGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() body: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const deviceInfo = AuthUtil.extractDeviceInfo(req, body);
    const result = await this.authService.register(body, deviceInfo);

    res.cookie('session', result.token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return result;
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const deviceInfo = AuthUtil.extractDeviceInfo(req, body);
    const result = await this.authService.login(body, deviceInfo);

    res.cookie('session', result.token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = this.extractTokenFromRequest(req);
    if (token) {
      await this.authService.logout(token);
    }

    res.clearCookie('session', { path: '/' });
    return { success: true };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser('id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logoutAll(userId);
    res.clearCookie('session', { path: '/' });
    return { success: true };
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  getMe(@CurrentUser() user: SafeUser) {
    return { user };
  }

  @Get('sessions')
  @HttpCode(HttpStatus.OK)
  async getSessions(
    @CurrentUser('id') userId: string,
    @Req() req: Request,
  ) {
    const currentSessionId = (req as any).sessionId;
    return this.authService.getActiveSessions(userId, currentSessionId);
  }

  @Delete('sessions/:id')
  @HttpCode(HttpStatus.OK)
  async revokeSession(
    @CurrentUser('id') userId: string,
    @Param('id') sessionId: string,
  ) {
    await this.authService.revokeUserSessionById(userId, sessionId);
    return { success: true };
  }

  private extractTokenFromRequest(req: Request): string | null {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim();
    }
    const sessionHeader = req.headers['x-session-token'];
    if (sessionHeader && typeof sessionHeader === 'string') {
      return sessionHeader.trim();
    }
    const cookieHeader = req.headers.cookie;
    if (cookieHeader) {
      const match = cookieHeader.match(/(?:^|;\s*)(?:session|session_token)=([^;]+)/);
      if (match) return decodeURIComponent(match[1]);
    }
    return null;
  }
}
