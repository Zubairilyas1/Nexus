import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('ðŸŒ± Seeding database...');

  // Create default organization
  const org = await prisma.organization.upsert({
    where: { slug: 'default-org' },
    update: {},
    create: {
      name: 'Default Organization',
      slug: 'default-org',
    },
  });
  console.log(`âœ… Created organization: ${org.name}`);

  // Create default project
  const project = await prisma.project.upsert({
    where: { organizationId_slug: { organizationId: org.id, slug: 'default' } },
    update: {},
    create: {
      name: 'Default Project',
      slug: 'default',
      organizationId: org.id,
    },
  });
  console.log(`âœ… Created project: ${project.name}`);

  // Create default zones
  const zones = [
    {
      id: 'zone_main_lane',
      label: 'Main Lane',
      color: '#06b6d4',
      maxDwellMs: 30000,
      active: true,
      coordinates: [
        { x: 300, y: 300 },
        { x: 980, y: 300 },
        { x: 1100, y: 720 },
        { x: 200, y: 720 },
      ],
    },
    {
      id: 'zone_side_lane',
      label: 'Side Lane',
      color: '#f97316',
      maxDwellMs: 30000,
      active: true,
      coordinates: [
        { x: 100, y: 100 },
        { x: 400, y: 100 },
        { x: 500, y: 400 },
        { x: 50, y: 400 },
      ],
    },
    {
      id: 'zone_parking',
      label: 'Parking Area',
      color: '#a855f7',
      maxDwellMs: 3600000,
      active: true,
      coordinates: [
        { x: 50, y: 50 },
        { x: 400, y: 50 },
        { x: 400, y: 400 },
        { x: 50, y: 400 },
      ],
    },
  ];

  for (const zone of zones) {
    await prisma.zone.upsert({
      where: { id: zone.id },
      update: {},
      create: {
        id: zone.id,
        label: zone.label,
        color: zone.color,
        maxDwellMs: zone.maxDwellMs,
        active: zone.active,
        coordinates: zone.coordinates,
        projectId: project.id,
      },
    });
    console.log(`âœ… Created zone: ${zone.label}`);
  }

  // Create default stream
  await prisma.stream.upsert({
    where: { streamId: 'dev_test_stream' },
    update: {},
    create: {
      streamId: 'dev_test_stream',
      name: 'Development Test Stream',
      rtspUrl: '',
      youtubeUrl: 'https://www.youtube.com/watch?v=gCNeDWCI0vo',
      frameWidth: 1280,
      frameHeight: 720,
      targetFps: 30,
      enabled: true,
      organizationId: org.id,
      projectId: project.id,
    },
  });
  console.log('âœ… Created default stream: dev_test_stream');

  // Create default admin user
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@nexusvision.local' },
    update: { emailVerified: new Date() },
    create: {
      email: 'admin@nexusvision.local',
      name: 'Admin User',
      password: '$2b$12$wCWQD.9PJTpYbScUTavZBuwllQpic1dNX/NYE2ivGjUzBRY42lMGa', // password: "password"
      globalRole: 'SUPER_ADMIN',
      emailVerified: new Date(),
    },
  });
  console.log('âœ… Created default admin user');

  // Create memberships for admin
  await prisma.membership.upsert({
    where: { userId_organizationId: { userId: adminUser.id!, organizationId: org.id } },
    update: {},
    create: {
      userId: adminUser.id!,
      organizationId: org.id,
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      joinedAt: new Date(),
    },
  });

  await prisma.projectMembership.upsert({
    where: { userId_projectId: { userId: adminUser.id, projectId: project.id } },
    update: {},
    create: {
      userId: adminUser.id,
      projectId: project.id,
      role: 'PROJECT_ADMIN',
    },
  });

  console.log('âœ… Created admin memberships');

  console.log('ðŸŽ‰ Seeding complete!');
}

main()
  .catch((e) => {
    console.error('âŒ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
