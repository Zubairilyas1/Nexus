import asyncio, sys
sys.path.insert(0, ".")
from app.database.session import init_db, get_session_factory
from sqlalchemy import text

async def check():
    await init_db()
    factory = get_session_factory()
    async with factory() as session:
        result = await session.execute(text('SELECT email, name, "emailVerified", "globalRole" FROM "User"'))
        for row in result:
            print(f"email={row[0]} | verified={row[2]} | role={row[3]}")

asyncio.run(check())
