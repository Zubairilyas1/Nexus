import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
import os
from dotenv import load_dotenv

load_dotenv('.env')
url = os.environ.get("DATABASE_URL")

async def main():
    engine = create_async_engine(url)
    async with engine.begin() as conn:
        from sqlalchemy import text
        await conn.execute(text('ALTER TABLE "Zone" ADD COLUMN IF NOT EXISTS "streamId" VARCHAR(100);'))
        await conn.execute(text('CREATE INDEX IF NOT EXISTS "Zone_streamId_idx" ON "Zone"("streamId");'))
    await engine.dispose()

asyncio.run(main())
