import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { SafeUser } from './auth.repository.js';

export const CurrentUser = createParamDecorator(
  (data: keyof SafeUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as SafeUser | undefined;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);
