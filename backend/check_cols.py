import asyncio, sys
sys.path.insert(0, ".")
from app.database.session import init_db, get_session_factory
from sqlalchemy import text

async def check():
    await init_db()
    factory = get_session_factory()
    async with factory() as session:
        result = await session.execute(text(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'User' ORDER BY ordinal_position"
        ))
        for row in result:
            print(row[0])

asyncio.run(check())
