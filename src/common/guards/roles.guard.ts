import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { Role } from '../../generated/prisma/enums';
import { ROLES_KEY } from '../constants';
import { AuthenticatedRequest } from '../types/authenticated-request';

const roleRank: Record<Role, number> = {
  USER: 1,
  ADMIN: 2,
  SUPER_ADMIN: 3,
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (
      !user ||
      !requiredRoles.some((role) => roleRank[user.role] >= roleRank[role])
    ) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
