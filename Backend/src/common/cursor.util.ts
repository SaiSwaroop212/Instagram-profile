import { BadRequestException } from '@nestjs/common';

export interface DecodedCursor {
  v: number;
  createdAt: string;
  id: string;
}

export function parseLimit(limitParam?: string | number, defaultLimit = 10): number {
  if (limitParam === undefined || limitParam === null || limitParam === '') {
    return defaultLimit;
  }

  const num = typeof limitParam === 'number' ? limitParam : Number(limitParam);

  if (!Number.isInteger(num) || num < 1 || num > 50) {
    throw new BadRequestException('limit must be an integer from 1 to 50');
  }

  return num;
}

export function encodeCursor(createdAt: Date | string, id: string): string {
  const dateStr = typeof createdAt === 'string' ? createdAt : createdAt.toISOString();
  const payload = JSON.stringify({
    v: 1,
    createdAt: dateStr,
    id,
  });

  return Buffer.from(payload, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function decodeCursor(cursorToken: string): DecodedCursor {
  if (cursorToken.length > 1024) {
    throw new BadRequestException('Invalid cursor: token exceeds maximum length');
  }

  try {
    let base64 = cursorToken.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }

    const jsonString = Buffer.from(base64, 'base64').toString('utf8');
    const parsed = JSON.parse(jsonString);

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      parsed.v !== 1 ||
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.id !== 'string'
    ) {
      throw new BadRequestException('Invalid cursor format');
    }

    // Validate timestamp
    const date = new Date(parsed.createdAt);
    if (isNaN(date.getTime())) {
      throw new BadRequestException('Invalid cursor: malformed timestamp');
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(parsed.id)) {
      throw new BadRequestException('Invalid cursor: malformed ID');
    }

    return parsed;
  } catch (error) {
    if (error instanceof BadRequestException) {
      throw error;
    }
    throw new BadRequestException('Invalid cursor encoding');
  }
}
