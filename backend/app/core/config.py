from pydantic_settings import BaseSettings
from typing import List, Optional
import os

class Settings(BaseSettings):
    PROJECT_NAME: str = "Central Software Command Center"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api"
    
    # Security
    SECRET_KEY: str = "command-center-super-secure-production-secret-key-389104810283"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 # 24 hours
    
    # Database
    DATABASE_URL: str = "sqlite+aiosqlite:///./command_center.db"
    
    # CORS
    BACKEND_CORS_ORIGINS: List[str] = ["*"]
    
    # Environment & Demo Data
    ENVIRONMENT: str = "production"
    SEED_DEMO_DATA: bool = False
    
    # Root Super Administrator Defaults
    ADMIN_USERNAME: str = "admin"
    ADMIN_EMAIL: str = "admin@command-center.local"
    ADMIN_PASSWORD: str = "Password123!"
    
    # Master Keypairs for License Management (Ed25519)
    # Stored or auto-generated if missing
    LICENSE_PRIVATE_KEY_PEM: Optional[str] = None
    LICENSE_PUBLIC_KEY_PEM: Optional[str] = None
    
    # Monitoring Defaults
    DEFAULT_MONITOR_TIMEOUT_SECONDS: int = 10
    MONITOR_INTERVAL_SECONDS: int = 60
    
    # Email / Webhook
    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    DEFAULT_WEBHOOK_URL: Optional[str] = None

    class Config:
        env_file = ".env"
        extra = "allow"

settings = Settings()
