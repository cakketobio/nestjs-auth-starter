import { Role } from '../generated/prisma/enums';

export type JwtPayload = {
  sub: string;
  email: string;
  role: Role;
};

export type SafeUser = {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: Date;
};

export type AuthResponse = {
  accessToken: string;
  user: Omit<SafeUser, 'isActive' | 'createdAt'>;
};

export type CookieAuthResponse = {
  user: Omit<SafeUser, 'isActive' | 'createdAt'>;
};
