import asyncio
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from backend.app.core.config import settings
from backend.app.core.init_db import init_db
from backend.app.services.monitoring_engine import monitoring_worker_loop
from backend.app.services.websocket_manager import ws_manager

# API Routers
from backend.app.api.auth import router as auth_router
from backend.app.api.dashboard import router as dashboard_router
from backend.app.api.applications import router as applications_router
from backend.app.api.servers import router as servers_router
from backend.app.api.monitoring import router as monitoring_router
from backend.app.api.domains import router as domains_router
from backend.app.api.deployments import router as deployments_router
from backend.app.api.git import router as git_router
from backend.app.api.licenses import router as licenses_router
from backend.app.api.logs import router as logs_router
from backend.app.api.backups import router as backups_router
from backend.app.api.alerts import router as alerts_router
from backend.app.api.admin import router as admin_router
from backend.app.api.topology import router as topology_router
from backend.app.api.search import router as search_router
from backend.app.api.system_health import router as system_health_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize DB schema and seed data
    await init_db(seed_demo=True)
    
    # Launch background monitoring worker loop
    monitoring_task = asyncio.create_task(monitoring_worker_loop())
    yield
    monitoring_task.cancel()

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Enterprise Central Software Command Center API for multi-server infrastructure and application lifecycle management.",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket Endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection open and accept client messages/pings
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception:
        ws_manager.disconnect(websocket)

# Health endpoint
@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }

# Register Routers
app.include_router(auth_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")
app.include_router(applications_router, prefix="/api")
app.include_router(servers_router, prefix="/api")
app.include_router(monitoring_router, prefix="/api")
app.include_router(domains_router, prefix="/api")
app.include_router(deployments_router, prefix="/api")
app.include_router(git_router, prefix="/api")
app.include_router(licenses_router, prefix="/api")
app.include_router(logs_router, prefix="/api")
app.include_router(backups_router, prefix="/api")
app.include_router(alerts_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(topology_router, prefix="/api")
app.include_router(search_router, prefix="/api")
app.include_router(system_health_router, prefix="/api")
