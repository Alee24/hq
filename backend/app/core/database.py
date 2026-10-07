from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base
from backend.app.core.config import settings

connect_args = {}
if "sqlite" in settings.DATABASE_URL:
    connect_args = {"check_same_thread": False}

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    connect_args=connect_args,
    future=True,
    pool_pre_ping=True
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False
)

Base = declarative_base()

def update_db_engine(new_url: str):
    """Dynamically updates the database engine and session maker to support resilient failover and auto-healing."""
    global engine
    c_args = {}
    if "sqlite" in new_url:
        c_args = {"check_same_thread": False}
    new_engine = create_async_engine(
        new_url,
        echo=False,
        connect_args=c_args,
        future=True,
        pool_pre_ping=True
    )
    engine = new_engine
    AsyncSessionLocal.configure(bind=new_engine)
    return new_engine

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
