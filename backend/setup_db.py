"""One-time database setup: create tables + seed admin user."""
import asyncio
import sys
sys.path.insert(0, ".")

from app.database.session import init_db, get_session_factory
from app.models import Base
from app.auth import hash_password
from sqlalchemy import text
from datetime import datetime, timezone
import uuid


async def setup():
    await init_db()
    factory = get_session_factory()

    async with factory() as session:
        # Create all tables
        async with session.begin():
            conn = await session.connection()
            await conn.run_sync(Base.metadata.create_all)
        print("Tables created OK")

        # Check if admin exists
        result = await session.execute(
            text('SELECT id FROM "User" WHERE email = :email'),
            {"email": "admin@nexusvision.local"},
        )
        if result.fetchone():
            print("Admin user already exists")
            return

        # Create admin user
        uid = str(uuid.uuid4())
        pw_hash = hash_password("Admin123!")
        now = datetime.now(timezone.utc)
        await session.execute(
            text(
                'INSERT INTO "User" (id, email, name, "passwordHash", "globalRole", "emailVerified", "createdAt", "updatedAt") '
                "VALUES (:id, :email, :name, :pw, :role, :verified, :now, :now)"
            ),
            {
                "id": uid,
                "email": "admin@nexusvision.local",
                "name": "Admin",
                "pw": pw_hash,
                "role": "SUPER_ADMIN",
                "verified": now,
                "now": now,
            },
        )
        await session.commit()
        print("Admin user created OK")


if __name__ == "__main__":
    asyncio.run(setup())
