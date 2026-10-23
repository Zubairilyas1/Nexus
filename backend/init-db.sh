#!/bin/bash
# Database initialization script for NexusVision

set -e

echo "🚀 Initializing NexusVision database..."

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL environment variable is not set"
  exit 1
fi

echo "📦 Installing Prisma..."
npx prisma generate

echo "🔧 Running database migrations..."
npx prisma migrate deploy

echo "🌱 Seeding database with default data..."
npx prisma db seed

echo "✅ Database initialization complete!"