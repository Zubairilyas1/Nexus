const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@nexusvision.local';
  const password = 'Admin123!';
  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      password: hashedPassword,
      emailVerified: new Date(),
      globalRole: 'SUPER_ADMIN',
    },
    create: {
      email,
      name: 'Admin',
      password: hashedPassword,
      emailVerified: new Date(),
      globalRole: 'SUPER_ADMIN',
    },
  });

  console.log('Admin user created/updated:', user.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });