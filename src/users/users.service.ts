import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Role } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: this.safeUserSelect(),
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: this.safeUserSelect(),
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async updateRole(id: string, role: Role) {
    await this.ensureUserExists(id);

    return this.prisma.user.update({
      where: { id },
      data: { role },
      select: this.safeUserSelect(),
    });
  }

  async deactivate(id: string) {
    const user = await this.ensureUserExists(id);

    if (user.role === Role.SUPER_ADMIN) {
      throw new BadRequestException(
        'SUPER_ADMIN accounts cannot be deactivated',
      );
    }

    return this.prisma.user.update({
      where: { id },
      data: { isActive: false, refreshTokens: { deleteMany: {} } },
      select: this.safeUserSelect(),
    });
  }

  async remove(id: string) {
    await this.ensureUserExists(id);
    await this.prisma.user.delete({ where: { id } });
  }

  private async ensureUserExists(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private safeUserSelect() {
    return {
      id: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    };
  }
}
