import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { Role } from '../generated/prisma/enums';
import { AuthService } from './auth.service';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

const now = new Date();
const user = {
  id: 'user-id',
  email: 'user@example.com',
  password: 'hashed-password',
  role: Role.USER,
  isActive: true,
  createdAt: now,
  updatedAt: now,
};

const safeUser = {
  id: user.id,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
  createdAt: user.createdAt,
};

describe('AuthService', () => {
  let prisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    refreshToken: {
      create: jest.Mock;
      findUnique: jest.Mock;
      deleteMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let service: AuthService;

  beforeEach(() => {
    jest.mocked(bcrypt.hash).mockReset();
    jest.mocked(bcrypt.compare).mockReset();

    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: {
        create: jest.fn(),
        findUnique: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    service = new AuthService(
      prisma as never,
      {
        signAsync: jest.fn().mockResolvedValue('access-token'),
      } as unknown as JwtService,
      {
        getOrThrow: jest.fn((key: string) =>
          key === 'JWT_SECRET' ? 'x'.repeat(32) : '15m',
        ),
      } as unknown as ConfigService,
    );
  });

  it('hashes passwords when registering a new user', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(safeUser);
    jest.mocked(bcrypt.hash).mockResolvedValue('hash' as never);

    await expect(
      service.register({ email: 'USER@example.com', password: 'Password123' }),
    ).resolves.toEqual(safeUser);

    expect(bcrypt.hash).toHaveBeenCalledWith('Password123', 12);
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'user@example.com',
          password: 'hash',
        }),
      }),
    );
  });

  it('rejects duplicate registrations', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

    await expect(
      service.register({ email: user.email, password: 'Password123' }),
    ).rejects.toThrow(ConflictException);
  });

  it('returns generic unauthorized errors for bad credentials', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    jest.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(
      service.login({ email: user.email, password: 'wrong-password' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('stores hashed refresh tokens and returns the raw token once', async () => {
    prisma.user.findUnique.mockResolvedValue(user);
    prisma.refreshToken.create.mockResolvedValue({});
    jest.mocked(bcrypt.compare).mockResolvedValue(true as never);

    const result = await service.login({
      email: user.email,
      password: 'Password123',
    });

    expect(result.refreshToken).toBeTruthy();
    expect(prisma.refreshToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: user.id,
          token: expect.not.stringMatching(result.refreshToken),
        }),
      }),
    );
  });

  it('rotates valid refresh tokens inside a transaction', async () => {
    const storedToken = {
      id: 'refresh-id',
      userId: user.id,
      expiresAt: new Date(Date.now() + 60_000),
      user,
    };
    prisma.refreshToken.findUnique.mockResolvedValue(storedToken);
    prisma.$transaction.mockImplementation(async (callback) =>
      callback({
        refreshToken: {
          delete: jest.fn(),
          create: jest.fn(),
        },
      }),
    );

    const result = await service.refresh('raw-refresh-token');

    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toBeTruthy();
    expect(result.refreshToken).not.toBe('raw-refresh-token');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('changes password and revokes all sessions', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: user.id,
      password: user.password,
      isActive: true,
    });
    prisma.$transaction.mockResolvedValue([]);
    jest.mocked(bcrypt.compare).mockResolvedValue(true as never);
    jest.mocked(bcrypt.hash).mockResolvedValue('new-hash' as never);

    await expect(
      service.changePassword(user.id, {
        currentPassword: 'Password123',
        newPassword: 'NewPassword123',
      }),
    ).resolves.toBeUndefined();

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { password: 'new-hash' },
    });
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: user.id },
    });
  });

  it('rejects password change when current password is wrong', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: user.id,
      password: user.password,
      isActive: true,
    });
    jest.mocked(bcrypt.compare).mockResolvedValue(false as never);

    await expect(
      service.changePassword(user.id, {
        currentPassword: 'wrong-password',
        newPassword: 'NewPassword123',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
