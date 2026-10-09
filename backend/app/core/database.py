from datetime import datetime, timezone
from sqlalchemy import event
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.orm import declarative_base, Session
from backend.app.core.config import settings

@event.listens_for(Session, "before_flush")
def sanitize_datetimes_before_flush(session, flush_context, instances):
    """
    Universal failsafe: Ensures that any datetime attribute on inserted or updated
    SQLAlchemy models is converted to a naive UTC datetime.
    This prevents asyncpg TypeError: 'can't subtract offset-naive and offset-aware datetimes'
    when interacting with PostgreSQL TIMESTAMP WITHOUT TIME ZONE columns.
    """
    try:
        for obj in session.new.union(session.dirty):
            state = getattr(obj, "_sa_instance_state", None)
            if not state:
                continue
            for prop in state.mapper.column_attrs:
                val = getattr(obj, prop.key, None)
                if isinstance(val, datetime) and val.tzinfo is not None:
                    setattr(obj, prop.key, val.astimezone(timezone.utc).replace(tzinfo=None))
    except Exception:
        pass

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
