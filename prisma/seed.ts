import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

import { PrismaClient } from '../src/generated/prisma/client';
import { Role } from '../src/generated/prisma/enums';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const users = [
  { email: 'superadmin@example.com', role: Role.SUPER_ADMIN },
  { email: 'admin@example.com', role: Role.ADMIN },
  { email: 'user@example.com', role: Role.USER },
];

async function main() {
  const password = await bcrypt.hash('Password123', 12);

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: { password, role: user.role, isActive: true },
      create: { ...user, password },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
