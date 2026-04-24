import { Request } from 'express';

import { Role } from '../../generated/prisma/enums';

export type AuthenticatedUser = {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
};

export type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};
