export type UserRole = 
  | 'SUPER_ADMIN'
  | 'INFRASTRUCTURE_ADMIN'
  | 'DEPLOYMENT_ADMIN'
  | 'APPLICATION_ADMIN'
  | 'LICENSE_ADMIN'
  | 'MONITORING_ADMIN'
  | 'READ_ONLY';

export interface User {
  id: string;
  email: string;
  username: string;
  full_name?: string;
  role: UserRole;
  is_active: boolean;
  mfa_enabled: boolean;
  created_at: string;
}

export interface ServerMetric {
  id: string;
  server_id: string;
  cpu_percent: number;
  ram_percent: number;
  disk_percent: number;
  disk_io_read_mb: number;
  disk_io_write_mb: number;
  network_rx_kb: number;
  network_tx_kb: number;
  load_1m: number;
  load_5m: number;
  load_15m: number;
  open_ports: number[];
  running_processes_count: number;
  timestamp: string;
}

export interface Server {
  id: string;
  name: string;
  hostname: string;
  provider: string;
  public_ip: string;
  private_ip?: string;
  os: string;
  os_version: string;
  kernel: string;
  cpu_cores: number;
  ram_total_mb: number;
  disk_total_gb: number;
  ssh_port: number;
  ssh_user?: string;
  ssh_auth_type?: 'KEY' | 'PASSWORD';
  connection_type?: 'SSH' | 'AGENT' | 'LOCAL_LOOPBACK';
  agent_token?: string;
  has_ssh_key?: boolean;
  has_ssh_password?: boolean;
  status: 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'MAINTENANCE';
  last_heartbeat: string;
  agent_version: string;
  agent_status: string;
  is_active: boolean;
  latest_metric?: ServerMetric;
}

export interface Application {
  id: string;
  name: string;
  description?: string;
  environment: 'production' | 'staging' | 'development';
  domain: string;
  server_id: string;
  server_name?: string;
  server_ip?: string;
  port: number;
  app_type: string;
  framework: string;
  repo_url?: string;
  git_branch: string;
  current_version: string;
  current_commit: string;
  latest_repo_commit: string;
  deployment_status: string;
  process_manager: string;
  service_name: string;
  uptime_percent: number;
  http_status: number;
  ssl_status: string;
  license_id?: string;
  license_key?: string;
  license_status?: string;
  license_expires_at?: string;
  last_deployment_at?: string;
  last_restart_at?: string;
  health_check_url: string;
  health_status: 'ONLINE' | 'DEGRADED' | 'OFFLINE' | 'MAINTENANCE' | 'UNKNOWN';
  is_maintenance: boolean;
  created_at: string;
}

export interface DomainItem {
  id: string;
  domain_name: string;
  application_id?: string;
  application_name?: string;
  server_ip: string;
  dns_status: string;
  ssl_status: string;
  ssl_issuer: string;
  ssl_expires_at?: string;
  days_remaining: number;
  redirect_status: string;
  auto_renew: boolean;
  last_checked_at: string;
}

export interface DeploymentItem {
  id: string;
  application_id: string;
  application_name?: string;
  environment: string;
  branch: string;
  commit_hash: string;
  previous_commit_hash?: string;
  commit_message: string;
  commit_author: string;
  status: 'PENDING' | 'BUILDING' | 'TESTING' | 'DEPLOYING' | 'SUCCESS' | 'FAILED' | 'ROLLED_BACK';
  deployed_by: string;
  logs?: string;
  duration_seconds: number;
  backup_id?: string;
  created_at: string;
}

export interface LicenseActivation {
  id: string;
  installation_fingerprint: string;
  hostname: string;
  ip_address: string;
  activated_at: string;
  last_validated_at: string;
  is_active: boolean;
}

export interface LicenseItem {
  id: string;
  license_key: string;
  product_name: string;
  customer_name: string;
  customer_email: string;
  product_version: string;
  license_type: string;
  allowed_installations: number;
  active_installations: number;
  available_installations: number;
  status: 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'SUSPENDED' | 'REVOKED' | 'INVALID';
  features: Record<string, any>;
  payload_b64?: string;
  signature_b64?: string;
  issued_at: string;
  expires_at: string;
  activations?: LicenseActivation[];
}

export interface AlertItem {
  id: string;
  rule_name: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  source_type: string;
  source_id?: string;
  source_name?: string;
  message: string;
  is_acknowledged: boolean;
  is_resolved: boolean;
  created_at: string;
  resolved_at?: string;
}

export interface AlertRuleItem {
  id: string;
  name: string;
  metric_name: string;
  condition: string;
  threshold: number;
  severity: string;
  channel: string;
  is_enabled: boolean;
  created_at: string;
}

export interface BackupItem {
  id: string;
  application_id?: string;
  application_name?: string;
  server_id?: string;
  server_name?: string;
  database_type?: 'POSTGRESQL' | 'MYSQL' | 'SQLITE' | 'MONGODB';
  database_name?: string;
  filename: string;
  file_size_mb: number;
  destination: string;
  status: string;
  verified: boolean;
  retention_days: number;
  created_at: string;
}

export interface TerminalLog {
  id: string;
  server_id: string;
  username: string;
  command: string;
  output?: string;
  exit_code: number;
  execution_duration_ms: number;
  created_at: string;
}

export interface AuditLogItem {
  id: string;
  user_id?: string;
  username: string;
  action: string;
  entity_type: string;
  entity_id?: string;
  ip_address: string;
  user_agent?: string;
  details: Record<string, any>;
  result: string;
  timestamp: string;
}

export interface LogItem {
  id: string;
  application_id?: string;
  server_id?: string;
  category: string;
  severity: string;
  message: string;
  user?: string;
  timestamp: string;
}

export interface SystemHealthItem {
  name: string;
  category: string;
  status: 'Healthy' | 'Degraded' | 'Unavailable';
  latency_ms?: number;
  details: string;
}

export interface SystemHealthResponse {
  overall_status: string;
  timestamp: string;
  items: SystemHealthItem[];
}

export interface GlobalSearchResult {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  status?: string;
  url: string;
}
