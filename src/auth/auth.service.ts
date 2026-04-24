import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import type { StringValue } from 'ms';

import { UserModel } from '../generated/prisma/models/User';
import { PrismaService } from '../prisma/prisma.service';
import { AuthResponse, JwtPayload, SafeUser } from './auth.types';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(dto: RegisterDto): Promise<SafeUser> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    const password = await bcrypt.hash(dto.password, 12);

    return this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        password,
      },
      select: this.safeUserSelect(),
    });
  }

  async login(dto: LoginDto): Promise<AuthResponse & { refreshToken: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user?.isActive) {
      this.logger.warn(`Failed login for ${dto.email.toLowerCase()}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.password);

    if (!passwordMatches) {
      this.logger.warn(`Failed login for ${dto.email.toLowerCase()}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    const refreshToken = await this.createRefreshToken(user.id);

    return {
      accessToken: await this.signAccessToken(user),
      refreshToken,
      user: this.toAuthUser(user),
    };
  }

  async refresh(
    refreshToken?: string,
  ): Promise<AuthResponse & { refreshToken: string }> {
    if (!refreshToken) {
      throw new UnauthorizedException('Missing refresh token');
    }

    const tokenHash = this.hashRefreshToken(refreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: tokenHash },
      include: { user: true },
    });

    if (
      !storedToken ||
      storedToken.expiresAt <= new Date() ||
      !storedToken.user.isActive
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const nextRefreshToken = await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.delete({ where: { id: storedToken.id } });

      const rawToken = this.generateRefreshToken();
      await tx.refreshToken.create({
        data: {
          token: this.hashRefreshToken(rawToken),
          userId: storedToken.userId,
          expiresAt: this.refreshTokenExpiresAt(),
        },
      });

      return rawToken;
    });

    return {
      accessToken: await this.signAccessToken(storedToken.user),
      refreshToken: nextRefreshToken,
      user: this.toAuthUser(storedToken.user),
    };
  }

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (!refreshToken) {
      return;
    }

    await this.prisma.refreshToken.deleteMany({
      where: {
        userId,
        token: this.hashRefreshToken(refreshToken),
      },
    });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
  }

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        password: true,
        isActive: true,
      },
    });

    if (!user?.isActive) {
      throw new UnauthorizedException('Invalid token');
    }

    const currentPasswordMatches = await bcrypt.compare(
      dto.currentPassword,
      user.password,
    );

    if (!currentPasswordMatches) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must be different from current password',
      );
    }

    const password = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { password },
      }),
      this.prisma.refreshToken.deleteMany({
        where: { userId },
      }),
    ]);
  }

  async getMe(userId: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: this.safeUserSelect(),
    });

    if (!user?.isActive) {
      throw new UnauthorizedException('Invalid token');
    }

    return user;
  }

  getRefreshTokenMaxAgeMs(): number {
    return 7 * 24 * 60 * 60 * 1000;
  }

  private async createRefreshToken(userId: string): Promise<string> {
    const refreshToken = this.generateRefreshToken();

    await this.prisma.refreshToken.create({
      data: {
        token: this.hashRefreshToken(refreshToken),
        userId,
        expiresAt: this.refreshTokenExpiresAt(),
      },
    });

    return refreshToken;
  }

  private generateRefreshToken(): string {
    return randomBytes(64).toString('hex');
  }

  private hashRefreshToken(refreshToken: string): string {
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  private refreshTokenExpiresAt(): Date {
    return new Date(Date.now() + this.getRefreshTokenMaxAgeMs());
  }

  private async signAccessToken(
    user: Pick<UserModel, 'id' | 'email' | 'role'>,
  ) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const expiresIn = this.configService.getOrThrow<string>(
      'JWT_ACCESS_TOKEN_EXPIRY',
    ) as StringValue;

    return this.jwtService.signAsync(payload, {
      secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      expiresIn,
    });
  }

  private toAuthUser(user: Pick<UserModel, 'id' | 'email' | 'role'>) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  }

  private safeUserSelect() {
    return {
      id: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
    } satisfies Record<keyof SafeUser, true>;
  }
}
