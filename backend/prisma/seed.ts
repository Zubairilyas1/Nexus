import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

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
      },
    });
    console.log(`✅ Created zone: ${zone.label}`);
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
    },
  });
  console.log('✅ Created default stream: dev_test_stream');

  // Create default admin user
  await prisma.user.upsert({
    where: { email: 'admin@nexusvision.local' },
    update: {},
    create: {
      email: 'admin@nexusvision.local',
      name: 'Admin User',
      password: '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.PZvO.S', // password: "password"
      role: 'admin',
    },
  });
  console.log('✅ Created default admin user');

  console.log('🎉 Seeding complete!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });