from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

# ==========================================
# Auth & User Schemas
# ==========================================

class UserLogin(BaseModel):
    username_or_email: str
    password: str
    mfa_code: Optional[str] = None

class UserRegister(BaseModel):
    email: str = Field(..., description="User email address")
    username: str
    password: str
    full_name: Optional[str] = None
    role: str = "READ_ONLY"

class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    full_name: Optional[str] = None
    role: str
    is_active: bool
    mfa_enabled: bool
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class MfaSetupResponse(BaseModel):
    secret: str
    qr_uri: str

class MfaVerifyRequest(BaseModel):
    code: str

# ==========================================
# Server Schemas
# ==========================================

class ServerCreate(BaseModel):
    public_ip: str
    ssh_password: Optional[str] = None
    name: Optional[str] = None
    hostname: Optional[str] = None
    provider: str = "Custom VPS"
    private_ip: Optional[str] = None
    os: str = "Ubuntu Linux"
    os_version: str = "24.04 LTS"
    kernel: str = "6.8.0-generic"
    cpu_cores: int = 4
    ram_total_mb: int = 8192
    disk_total_gb: int = 160
    ssh_port: int = 22
    ssh_user: str = "root"
    ssh_auth_type: str = "PASSWORD"
    ssh_key: Optional[str] = None

class ServerUpdate(BaseModel):
    name: Optional[str] = None
    hostname: Optional[str] = None
    provider: Optional[str] = None
    public_ip: Optional[str] = None
    private_ip: Optional[str] = None
    status: Optional[str] = None
    cpu_cores: Optional[int] = None
    ram_total_mb: Optional[int] = None
    disk_total_gb: Optional[int] = None

class ServerMetricResponse(BaseModel):
    id: str
    server_id: str
    cpu_percent: float
    ram_percent: float
    disk_percent: float
    disk_io_read_mb: float
    disk_io_write_mb: float
    network_rx_kb: float
    network_tx_kb: float
    load_1m: float
    load_5m: float
    load_15m: float
    open_ports: List[int]
    running_processes_count: int
    timestamp: datetime

    class Config:
        from_attributes = True

class ServerResponse(BaseModel):
    id: str
    name: str
    hostname: str
    provider: str
    public_ip: str
    private_ip: Optional[str]
    os: str
    os_version: str
    kernel: str
    cpu_cores: int
    ram_total_mb: int
    disk_total_gb: int
    ssh_port: int
    ssh_user: Optional[str] = "root"
    ssh_auth_type: Optional[str] = "KEY"
    connection_type: Optional[str] = "SSH"
    agent_token: Optional[str] = None
    has_ssh_key: bool = False
    has_ssh_password: bool = False
    status: str
    last_heartbeat: datetime
    agent_version: str
    agent_status: str
    is_active: bool
    latest_metric: Optional[ServerMetricResponse] = None

    class Config:
        from_attributes = True

class ServerConnectionConfig(BaseModel):
    ssh_user: str = "root"
    ssh_port: int = 22
    ssh_auth_type: str = "KEY" # KEY, PASSWORD
    ssh_key: Optional[str] = None
    ssh_password: Optional[str] = None
    connection_type: str = "SSH" # SSH, AGENT

class ServerConnectionTestResponse(BaseModel):
    success: bool
    server_id: str
    connection_type: str
    latency_ms: float
    banner: Optional[str] = None
    message: str
    status: str

class TerminalExecRequest(BaseModel):
    command: str
    working_dir: Optional[str] = None
    timeout_seconds: int = 30

class TerminalExecResponse(BaseModel):
    success: bool
    command: str
    stdout: str
    stderr: str
    exit_code: int
    duration_ms: int
    timestamp: datetime

class ServerTerminalLogResponse(BaseModel):
    id: str
    server_id: str
    username: str
    command: str
    output: Optional[str] = None
    exit_code: int
    execution_duration_ms: int
    created_at: datetime

    class Config:
        from_attributes = True

class ServerCommandRequest(BaseModel):
    action: str # "restart", "reboot", "shutdown", "service_restart", "service_stop", "service_start", "service_status"
    service_name: Optional[str] = None
    confirmation: Optional[str] = None # e.g. "RESTART" for dangerous actions

# ==========================================
# Application Schemas
# ==========================================

class ApplicationCreate(BaseModel):
    name: str
    description: Optional[str] = None
    environment: str = "production"
    domain: str
    server_id: Optional[str] = None
    port: int = 80
    app_type: str = "Web Application"
    framework: str = "FastAPI / React"
    repo_url: Optional[str] = None
    git_branch: str = "main"
    current_version: str = "v1.0.0"
    process_manager: str = "Docker"
    service_name: str
    health_check_url: str = "/health"
    license_id: Optional[str] = None

class ApplicationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    environment: Optional[str] = None
    domain: Optional[str] = None
    port: Optional[int] = None
    app_type: Optional[str] = None
    framework: Optional[str] = None
    git_branch: Optional[str] = None
    current_version: Optional[str] = None
    process_manager: Optional[str] = None
    service_name: Optional[str] = None
    health_check_url: Optional[str] = None
    license_id: Optional[str] = None
    health_status: Optional[str] = None

class ApplicationActionRequest(BaseModel):
    action: str # "start", "stop", "restart", "reload", "health_check"

class MaintenanceModeRequest(BaseModel):
    enabled: bool
    reason: str
    expected_duration_minutes: int = 60

class ApplicationResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    environment: str
    domain: str
    server_id: str
    server_name: Optional[str] = None
    server_ip: Optional[str] = None
    port: int
    app_type: str
    framework: str
    repo_url: Optional[str]
    git_branch: str
    current_version: str
    current_commit: str
    latest_repo_commit: str
    deployment_status: str
    process_manager: str
    service_name: str
    uptime_percent: float
    http_status: int
    ssl_status: str
    license_id: Optional[str]
    license_key: Optional[str] = None
    license_status: Optional[str] = None
    license_expires_at: Optional[datetime] = None
    last_deployment_at: Optional[datetime]
    last_restart_at: Optional[datetime]
    health_check_url: str
    health_status: str
    is_maintenance: bool
    created_at: datetime

    class Config:
        from_attributes = True

# ==========================================
# Domain Schemas
# ==========================================

class DomainCreate(BaseModel):
    domain_name: str
    application_id: Optional[str] = None
    server_ip: str
    redirect_status: str = "HTTP_TO_HTTPS"
    auto_renew: bool = True

class DomainResponse(BaseModel):
    id: str
    domain_name: str
    application_id: Optional[str]
    application_name: Optional[str] = None
    server_ip: str
    dns_status: str
    ssl_status: str
    ssl_issuer: str
    ssl_expires_at: Optional[datetime]
    days_remaining: int
    redirect_status: str
    auto_renew: bool
    last_checked_at: datetime

    class Config:
        from_attributes = True

# ==========================================
# Monitoring & Incident Schemas
# ==========================================

class MonitoringCheckCreate(BaseModel):
    application_id: str
    target_url: str
    check_type: str = "HTTP_GET"
    interval_seconds: int = 60
    timeout_seconds: int = 10

class MonitoringResultResponse(BaseModel):
    id: str
    check_id: str
    application_id: str
    status_code: int
    response_time_ms: float
    is_up: bool
    ssl_valid: bool
    ssl_days_left: int
    error_message: Optional[str]
    timestamp: datetime

    class Config:
        from_attributes = True

class IncidentResponse(BaseModel):
    id: str
    application_id: Optional[str]
    application_name: Optional[str] = None
    server_id: Optional[str]
    title: str
    description: Optional[str]
    severity: str
    status: str
    started_at: datetime
    resolved_at: Optional[datetime]
    duration_seconds: int

    class Config:
        from_attributes = True

# ==========================================
# Git & Deployment Schemas
# ==========================================

class GitCommitInfo(BaseModel):
    commit_hash: str
    short_hash: str
    author: str
    message: str
    date: str

class GitRepoStatusResponse(BaseModel):
    repo_url: str
    branch: str
    current_server_commit: GitCommitInfo
    latest_remote_commit: GitCommitInfo
    update_available: bool
    commits_behind: int
    recent_commits: List[GitCommitInfo]

class DeploymentTriggerRequest(BaseModel):
    application_id: str
    environment: str = "production"
    branch: str = "main"
    commit_hash: Optional[str] = None
    run_tests: bool = True
    create_backup: bool = True

class DeploymentResponse(BaseModel):
    id: str
    application_id: str
    application_name: Optional[str] = None
    environment: str
    branch: str
    commit_hash: str
    previous_commit_hash: Optional[str]
    commit_message: str
    commit_author: str
    status: str
    deployed_by: str
    logs: Optional[str]
    duration_seconds: int
    backup_id: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True

class RollbackRequest(BaseModel):
    deployment_id: str
    reason: str
    confirmation: str # "ROLLBACK"

# ==========================================
# License Management Schemas
# ==========================================

class LicenseCreate(BaseModel):
    product_name: str
    customer_name: str
    customer_email: str = Field(..., description="Customer contact email")
    product_version: str = "v1.0.0"
    license_type: str = "Enterprise"
    allowed_installations: int = 5
    expires_in_days: int = 365
    features: Dict[str, Any] = Field(default_factory=dict)

class LicenseActivationInfo(BaseModel):
    id: str
    installation_fingerprint: str
    hostname: str
    ip_address: str
    activated_at: datetime
    last_validated_at: datetime
    is_active: bool

    class Config:
        from_attributes = True

class LicenseResponse(BaseModel):
    id: str
    license_key: str
    product_name: str
    customer_name: str
    customer_email: str
    product_version: str
    license_type: str
    allowed_installations: int
    active_installations: int
    available_installations: int = 0
    status: str
    features: Dict[str, Any]
    payload_b64: Optional[str] = None
    signature_b64: Optional[str] = None
    issued_at: datetime
    expires_at: datetime
    activations: List[LicenseActivationInfo] = Field(default_factory=list)

    class Config:
        from_attributes = True

class LicenseValidateRequest(BaseModel):
    license_key: str
    product_name: str
    product_version: str
    installation_fingerprint: str
    hostname: str

class LicenseValidateResponse(BaseModel):
    valid: bool
    status: str
    message: str
    expires_at: Optional[datetime] = None
    features: Dict[str, Any] = Field(default_factory=dict)
    validation_token: Optional[str] = None

class LicenseActivateRequest(BaseModel):
    license_key: str
    product_name: str
    product_version: str
    installation_fingerprint: str
    hostname: str
    ip_address: Optional[str] = None

class LicenseActivateResponse(BaseModel):
    success: bool
    message: str
    license_key: str
    status: str
    expires_at: datetime
    token: str
    features: Dict[str, Any]
    signature_b64: str

# ==========================================
# API Key Schemas
# ==========================================

class ApiKeyCreate(BaseModel):
    name: str
    role: str = "READ_ONLY"

class ApiKeyResponse(BaseModel):
    id: str
    name: str
    prefix: str
    role: str
    is_active: bool
    last_used_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True

# ==========================================
# Audit, Alert & System Schemas
# ==========================================

class AuditLogResponse(BaseModel):
    id: str
    user_id: Optional[str]
    username: str
    action: str
    entity_type: str
    entity_id: Optional[str]
    ip_address: str
    user_agent: Optional[str]
    details: Dict[str, Any]
    result: str
    timestamp: datetime

    class Config:
        from_attributes = True

class AlertResponse(BaseModel):
    id: str
    rule_name: str
    severity: str
    source_type: str
    source_id: Optional[str]
    source_name: Optional[str]
    message: str
    is_acknowledged: bool
    is_resolved: bool
    created_at: datetime
    resolved_at: Optional[datetime]

    class Config:
        from_attributes = True

class AlertRuleCreate(BaseModel):
    name: str
    metric_name: str
    condition: str = "GREATER_THAN"
    threshold: float
    severity: str = "WARNING"
    channel: str = "WEBHOOK"

class AlertRuleResponse(BaseModel):
    id: str
    name: str
    metric_name: str
    condition: str
    threshold: float
    severity: str
    channel: str
    is_enabled: bool
    created_at: datetime

    class Config:
        from_attributes = True

class BackupResponse(BaseModel):
    id: str
    application_id: Optional[str]
    application_name: Optional[str] = None
    server_id: Optional[str]
    server_name: Optional[str] = None
    database_type: Optional[str] = "POSTGRESQL"
    database_name: Optional[str] = None
    filename: str
    file_size_mb: float
    destination: str
    status: str
    verified: bool
    retention_days: int
    created_at: datetime

    class Config:
        from_attributes = True

class DatabaseBackupRequest(BaseModel):
    server_id: str
    database_type: str = "POSTGRESQL" # POSTGRESQL, MYSQL, SQLITE, MONGODB
    database_name: str
    application_id: Optional[str] = None
    retention_days: int = 30

class WebConfigBackupRequest(BaseModel):
    server_id: str
    config_type: str = "WEB_STACK" # APACHE, NGINX, WEB_ROOT, WEB_STACK
    retention_days: int = 30

class ScheduledRebootRequest(BaseModel):
    delay_minutes: Optional[int] = 15
    schedule_time: Optional[str] = None
    reason: str = "Scheduled maintenance reboot"
    recurring: Optional[str] = None # NONE, DAILY, WEEKLY_SUNDAY

class TroubleshootCommandRequest(BaseModel):
    command_key: str # TOP_CPU, TOP_MEM, DISK_HOGS, DOCKER_PRUNE, DROP_CACHES, LISTENING_PORTS, FAILED_UNITS, JOURNAL_ERRORS, TEST_NGINX, TEST_APACHE, ZOMBIE_PROCS, CUSTOM
    custom_command: Optional[str] = None

class SystemHealthItem(BaseModel):
    name: str
    category: str
    status: str # "Healthy", "Degraded", "Unavailable"
    latency_ms: Optional[float] = None
    details: str

class SystemHealthResponse(BaseModel):
    overall_status: str
    timestamp: datetime
    items: List[SystemHealthItem]

class GlobalSearchResult(BaseModel):
    type: str # application, server, domain, ip, commit, license, user, log
    id: str
    title: str
    subtitle: str
    status: Optional[str] = None
    url: str

class LogItemResponse(BaseModel):
    id: str
    application_id: Optional[str]
    server_id: Optional[str]
    category: str
    severity: str
    message: str
    user: Optional[str]
    timestamp: datetime

    class Config:
        from_attributes = True

class SystemSettingsResponse(BaseModel):
    monitor_interval: int = 60
    session_timeout: int = 1440
    webhook_url: str = "https://hooks.slack.com/services/T00/B00/X00"
    license_signing_enforced: bool = True
    whitelist_agent_execution: bool = True

class SystemSettingsUpdate(BaseModel):
    monitor_interval: Optional[int] = 60
    session_timeout: Optional[int] = 1440
    webhook_url: Optional[str] = "https://hooks.slack.com/services/T00/B00/X00"
    license_signing_enforced: Optional[bool] = True
    whitelist_agent_execution: Optional[bool] = True

