import asyncio, sys
sys.path.insert(0, ".")
from app.database.session import init_db, get_session_factory
from app.auth import hash_password, verify_password
from sqlalchemy import text

async def reset():
    await init_db()
    factory = get_session_factory()
    async with factory() as session:
        new_hash = hash_password("Admin123!")
        await session.execute(
            text('UPDATE "User" SET password = :pw WHERE email = :email'),
            {"pw": new_hash, "email": "admin@nexusvision.local"},
        )
        await session.commit()

        result = await session.execute(
            text('SELECT password FROM "User" WHERE email = :email'),
            {"email": "admin@nexusvision.local"},
        )
        row = result.fetchone()
        ok = verify_password("Admin123!", row[0])
        print(f"Password reset OK, verify={ok}")

asyncio.run(reset())
