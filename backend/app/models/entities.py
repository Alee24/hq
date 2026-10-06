import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, Text, ForeignKey, Index, JSON
)
from sqlalchemy.orm import relationship
from backend.app.core.database import Base

def utcnow():
    return datetime.now(timezone.utc)

class User(Base):
    __tablename__ = "users"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    role = Column(String(50), default="READ_ONLY", nullable=False, index=True) 
    # SUPER_ADMIN, INFRASTRUCTURE_ADMIN, DEPLOYMENT_ADMIN, APPLICATION_ADMIN, LICENSE_ADMIN, MONITORING_ADMIN, READ_ONLY
    is_active = Column(Boolean, default=True)
    mfa_enabled = Column(Boolean, default=False)
    mfa_secret = Column(String(64), nullable=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    deleted_at = Column(DateTime, nullable=True)

class Server(Base):
    __tablename__ = "servers"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=False, index=True)
    hostname = Column(String(255), nullable=False, index=True)
    provider = Column(String(100), default="Custom VPS") # DigitalOcean, Hetzner, AWS, Linode
    public_ip = Column(String(45), nullable=False, index=True)
    private_ip = Column(String(45), nullable=True)
    os = Column(String(100), default="Ubuntu Linux")
    os_version = Column(String(50), default="24.04 LTS")
    kernel = Column(String(100), default="6.8.0-generic")
    cpu_cores = Column(Integer, default=4)
    ram_total_mb = Column(Integer, default=8192)
    disk_total_gb = Column(Integer, default=160)
    ssh_port = Column(Integer, default=22)
    ssh_user = Column(String(50), default="root")
    ssh_auth_type = Column(String(20), default="KEY") # KEY, PASSWORD
    ssh_key = Column(Text, nullable=True)
    ssh_password = Column(String(255), nullable=True)
    agent_token = Column(String(64), nullable=True)
    connection_type = Column(String(20), default="SSH") # SSH, AGENT, DIRECT
    status = Column(String(20), default="ONLINE", index=True) # ONLINE, OFFLINE, DEGRADED, MAINTENANCE
    last_heartbeat = Column(DateTime, default=utcnow)
    agent_version = Column(String(50), default="1.0.0")
    agent_status = Column(String(20), default="CONNECTED")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    deleted_at = Column(DateTime, nullable=True)

    applications = relationship("Application", back_populates="server")
    metrics = relationship("ServerMetric", back_populates="server", cascade="all, delete-orphan")

class Application(Base):
    __tablename__ = "applications"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(150), nullable=False, index=True)
    description = Column(Text, nullable=True)
    environment = Column(String(50), default="production", index=True) # production, staging, development
    domain = Column(String(255), nullable=False, index=True)
    server_id = Column(String(36), ForeignKey("servers.id"), nullable=False, index=True)
    port = Column(Integer, default=80)
    app_type = Column(String(50), default="Web Application") # Web App, API, Static Site, Background Service
    framework = Column(String(50), default="FastAPI / React")
    repo_url = Column(String(255), nullable=True)
    git_branch = Column(String(100), default="main")
    current_version = Column(String(50), default="v1.0.0")
    current_commit = Column(String(40), default="8a92f31")
    latest_repo_commit = Column(String(40), default="8a92f31")
    deployment_status = Column(String(50), default="IDLE") # IDLE, DEPLOYING, SUCCESS, FAILED
    process_manager = Column(String(50), default="Docker") # Docker, Docker Compose, systemd, PM2, Supervisor, Nginx
    service_name = Column(String(100), default="app-service")
    uptime_percent = Column(Float, default=99.98)
    http_status = Column(Integer, default=200)
    ssl_status = Column(String(50), default="VALID") # VALID, EXPIRING, EXPIRED, INVALID
    license_id = Column(String(36), ForeignKey("licenses.id"), nullable=True, index=True)
    last_deployment_at = Column(DateTime, nullable=True)
    last_restart_at = Column(DateTime, nullable=True)
    health_check_url = Column(String(255), default="/health")
    health_status = Column(String(20), default="ONLINE", index=True) # ONLINE, DEGRADED, OFFLINE, MAINTENANCE, UNKNOWN
    is_maintenance = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    deleted_at = Column(DateTime, nullable=True)

    server = relationship("Server", back_populates="applications")
    license = relationship("License", back_populates="applications")
    domains = relationship("Domain", back_populates="application")
    deployments = relationship("Deployment", back_populates="application", cascade="all, delete-orphan")
    monitoring_checks = relationship("MonitoringCheck", back_populates="application", cascade="all, delete-orphan")

class Domain(Base):
    __tablename__ = "domains"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    domain_name = Column(String(255), nullable=False, unique=True, index=True)
    application_id = Column(String(36), ForeignKey("applications.id"), nullable=True, index=True)
    server_ip = Column(String(45), nullable=False)
    dns_status = Column(String(50), default="RESOLVED") # RESOLVED, FAILED, PROPAGATING
    ssl_status = Column(String(50), default="VALID") # VALID, EXPIRING, EXPIRED, INVALID
    ssl_issuer = Column(String(100), default="Let's Encrypt Authority X3")
    ssl_expires_at = Column(DateTime, nullable=True)
    days_remaining = Column(Integer, default=74)
    redirect_status = Column(String(50), default="HTTP_TO_HTTPS") # HTTP_TO_HTTPS, NONE, CUSTOM
    auto_renew = Column(Boolean, default=True)
    last_checked_at = Column(DateTime, default=utcnow)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    application = relationship("Application", back_populates="domains")

class ServerMetric(Base):
    __tablename__ = "server_metrics"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    server_id = Column(String(36), ForeignKey("servers.id"), nullable=False, index=True)
    cpu_percent = Column(Float, default=0.0)
    ram_percent = Column(Float, default=0.0)
    disk_percent = Column(Float, default=0.0)
    disk_io_read_mb = Column(Float, default=0.0)
    disk_io_write_mb = Column(Float, default=0.0)
    network_rx_kb = Column(Float, default=0.0)
    network_tx_kb = Column(Float, default=0.0)
    load_1m = Column(Float, default=0.5)
    load_5m = Column(Float, default=0.4)
    load_15m = Column(Float, default=0.3)
    open_ports = Column(JSON, default=list) # [80, 443, 22, 5432]
    running_processes_count = Column(Integer, default=112)
    timestamp = Column(DateTime, default=utcnow, index=True)

    server = relationship("Server", back_populates="metrics")

class MonitoringCheck(Base):
    __tablename__ = "monitoring_checks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    application_id = Column(String(36), ForeignKey("applications.id"), nullable=False, index=True)
    target_url = Column(String(255), nullable=False)
    check_type = Column(String(50), default="HTTP_GET") # HTTP_GET, TCP_PORT, DNS, SSL_CERT
    interval_seconds = Column(Integer, default=60) # 30, 60, 300, 600
    timeout_seconds = Column(Integer, default=10)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    application = relationship("Application", back_populates="monitoring_checks")
    results = relationship("MonitoringResult", back_populates="check", cascade="all, delete-orphan")

class MonitoringResult(Base):
    __tablename__ = "monitoring_results"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    check_id = Column(String(36), ForeignKey("monitoring_checks.id"), nullable=False, index=True)
    application_id = Column(String(36), ForeignKey("applications.id"), nullable=False, index=True)
    status_code = Column(Integer, default=200)
    response_time_ms = Column(Float, default=120.0)
    is_up = Column(Boolean, default=True)
    ssl_valid = Column(Boolean, default=True)
    ssl_days_left = Column(Integer, default=60)
    error_message = Column(Text, nullable=True)
    timestamp = Column(DateTime, default=utcnow, index=True)

    check = relationship("MonitoringCheck", back_populates="results")

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    application_id = Column(String(36), ForeignKey("applications.id"), nullable=True, index=True)
    server_id = Column(String(36), ForeignKey("servers.id"), nullable=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    severity = Column(String(20), default="WARNING") # INFO, WARNING, CRITICAL
    status = Column(String(20), default="RESOLVED") # INVESTIGATING, IDENTIFIED, MONITORING, RESOLVED
    started_at = Column(DateTime, default=utcnow)
    resolved_at = Column(DateTime, nullable=True)
    duration_seconds = Column(Integer, default=0)

class Deployment(Base):
    __tablename__ = "deployments"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    application_id = Column(String(36), ForeignKey("applications.id"), nullable=False, index=True)
    environment = Column(String(50), default="production", index=True)
    branch = Column(String(100), default="main")
    commit_hash = Column(String(40), nullable=False)
    previous_commit_hash = Column(String(40), nullable=True)
    commit_message = Column(Text, nullable=False)
    commit_author = Column(String(100), default="Deploy Bot")
    status = Column(String(20), default="SUCCESS", index=True) # PENDING, BUILDING, TESTING, DEPLOYING, SUCCESS, FAILED, ROLLED_BACK
    deployed_by = Column(String(100), default="admin")
    logs = Column(Text, nullable=True)
    duration_seconds = Column(Integer, default=42)
    backup_id = Column(String(36), nullable=True)
    created_at = Column(DateTime, default=utcnow, index=True)

    application = relationship("Application", back_populates="deployments")

class DeploymentRollback(Base):
    __tablename__ = "deployment_rollbacks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    application_id = Column(String(36), ForeignKey("applications.id"), nullable=False, index=True)
    deployment_id = Column(String(36), ForeignKey("deployments.id"), nullable=False)
    target_commit = Column(String(40), nullable=False)
    target_version = Column(String(50), nullable=False)
    reason = Column(Text, nullable=False)
    triggered_by = Column(String(100), default="admin")
    status = Column(String(20), default="COMPLETED")
    logs = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow)

class License(Base):
    __tablename__ = "licenses"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    license_key = Column(String(100), unique=True, index=True, nullable=False) # e.g. LIC-2026-000381
    product_name = Column(String(150), nullable=False, index=True)
    customer_name = Column(String(150), nullable=False)
    customer_email = Column(String(255), nullable=False)
    product_version = Column(String(50), default="v2.4.1")
    license_type = Column(String(50), default="Enterprise") # Trial, Standard, Enterprise, Perpetual
    allowed_installations = Column(Integer, default=5)
    active_installations = Column(Integer, default=1)
    status = Column(String(30), default="ACTIVE", index=True) # ACTIVE, EXPIRING_SOON, EXPIRED, SUSPENDED, REVOKED, INVALID
    features = Column(JSON, default=dict) # {"ha_cluster": True, "api_rate_unlimited": True, "ssl_automation": True}
    payload_b64 = Column(Text, nullable=True)
    signature_b64 = Column(Text, nullable=True)
    issued_at = Column(DateTime, default=utcnow)
    expires_at = Column(DateTime, nullable=False, index=True)
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    deleted_at = Column(DateTime, nullable=True)

    applications = relationship("Application", back_populates="license")
    activations = relationship("LicenseActivation", back_populates="license", cascade="all, delete-orphan")

class LicenseActivation(Base):
    __tablename__ = "license_activations"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    license_id = Column(String(36), ForeignKey("licenses.id"), nullable=False, index=True)
    installation_fingerprint = Column(String(128), nullable=False, index=True)
    hostname = Column(String(255), nullable=False)
    ip_address = Column(String(45), nullable=False)
    activated_at = Column(DateTime, default=utcnow)
    last_validated_at = Column(DateTime, default=utcnow)
    is_active = Column(Boolean, default=True)
    token = Column(String(255), nullable=False)

    license = relationship("License", back_populates="activations")

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), nullable=True)
    username = Column(String(100), nullable=False, index=True)
    action = Column(String(100), nullable=False, index=True) # e.g. RESTART_APPLICATION, DEPLOY_COMMIT, CREATE_LICENSE
    entity_type = Column(String(50), nullable=False, index=True) # application, server, license, deployment, system
    entity_id = Column(String(36), nullable=True)
    ip_address = Column(String(45), default="127.0.0.1")
    user_agent = Column(String(255), nullable=True)
    details = Column(JSON, default=dict)
    result = Column(String(20), default="SUCCESS") # SUCCESS, FAILED, DENIED
    timestamp = Column(DateTime, default=utcnow, index=True)

class Alert(Base):
    __tablename__ = "alerts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    rule_name = Column(String(100), nullable=False)
    severity = Column(String(20), default="WARNING", index=True) # INFO, WARNING, CRITICAL
    source_type = Column(String(50), nullable=False, index=True) # application, server, license, domain, ssl, backup
    source_id = Column(String(36), nullable=True)
    source_name = Column(String(150), nullable=True)
    message = Column(Text, nullable=False)
    is_acknowledged = Column(Boolean, default=False)
    is_resolved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=utcnow, index=True)
    resolved_at = Column(DateTime, nullable=True)

class AlertRule(Base):
    __tablename__ = "alert_rules"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=False)
    metric_name = Column(String(50), nullable=False) # cpu, ram, disk, uptime, ssl_days, license_days
    condition = Column(String(20), default="GREATER_THAN") # GREATER_THAN, LESS_THAN, EQUALS
    threshold = Column(Float, nullable=False)
    severity = Column(String(20), default="WARNING")
    channel = Column(String(50), default="WEBHOOK") # EMAIL, WEBHOOK, ALL
    is_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)

class Backup(Base):
    __tablename__ = "backups"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    application_id = Column(String(36), ForeignKey("applications.id"), nullable=True, index=True)
    server_id = Column(String(36), ForeignKey("servers.id"), nullable=True, index=True)
    database_type = Column(String(50), default="POSTGRESQL", index=True) # POSTGRESQL, MYSQL, SQLITE, MONGODB
    database_name = Column(String(100), nullable=True)
    filename = Column(String(255), nullable=False)
    file_size_mb = Column(Float, default=124.5)
    destination = Column(String(255), default="S3://infra-backups/daily/")
    status = Column(String(20), default="COMPLETED") # PENDING, IN_PROGRESS, COMPLETED, FAILED
    verified = Column(Boolean, default=True)
    retention_days = Column(Integer, default=30)
    created_at = Column(DateTime, default=utcnow, index=True)

class MaintenanceWindow(Base):
    __tablename__ = "maintenance_windows"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    application_id = Column(String(36), ForeignKey("applications.id"), nullable=False, index=True)
    reason = Column(Text, nullable=False)
    enabled_by = Column(String(100), default="admin")
    start_time = Column(DateTime, default=utcnow)
    expected_end_time = Column(DateTime, nullable=False)
    actual_end_time = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=utcnow)

class ApiKey(Base):
    __tablename__ = "api_keys"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(100), nullable=False)
    key_hash = Column(String(255), nullable=False)
    prefix = Column(String(12), nullable=False, index=True)
    role = Column(String(50), default="READ_ONLY")
    expires_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    last_used_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=utcnow)

class AppLog(Base):
    __tablename__ = "app_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    application_id = Column(String(36), ForeignKey("applications.id"), nullable=True, index=True)
    server_id = Column(String(36), ForeignKey("servers.id"), nullable=True, index=True)
    category = Column(String(50), default="application", index=True) 
    # application, nginx, apache, systemd, docker, deployment, auth, security, monitoring
    severity = Column(String(20), default="INFO", index=True) # DEBUG, INFO, WARN, ERROR, CRITICAL
    message = Column(Text, nullable=False)
    user = Column(String(100), nullable=True)
    timestamp = Column(DateTime, default=utcnow, index=True)

class ServerTerminalLog(Base):
    __tablename__ = "server_terminal_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    server_id = Column(String(36), ForeignKey("servers.id"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    username = Column(String(100), nullable=False)
    command = Column(Text, nullable=False)
    output = Column(Text, nullable=True)
    exit_code = Column(Integer, default=0)
    execution_duration_ms = Column(Integer, default=0)
    created_at = Column(DateTime, default=utcnow, index=True)
