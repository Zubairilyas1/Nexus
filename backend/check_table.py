import asyncio
from app.database.session import init_db, get_db_session_direct
from sqlalchemy import text

async def check():
    await init_db()
    session = await get_db_session_direct()
    try:
        result = await session.execute(text('SELECT COUNT(*) FROM "VerificationToken"'))
        count = result.scalar()
        print(f'VerificationToken table exists with {count} rows')
    except Exception as e:
        print(f'Error: {e}')
    await session.close()

asyncio.run(check())