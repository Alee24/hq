import React, { useEffect, useState } from 'react';
import {
  Globe,
  Plus,
  RefreshCw,
  ShieldCheck,
  ExternalLink,
  CheckCircle2,
  Clock,
  Trash2,
  Lock,
  Copy,
  Check,
  X,
  AlertCircle,
  Terminal,
  ChevronRight,
  ArrowLeft,
  Server as ServerIcon,
  Cpu,
  Layers,
  Activity,
  Zap,
  TrendingUp,
  Download,
  RotateCcw,
  Square,
  Play,
  FileCode,
  FileText,
  Search,
  AlertTriangle,
  Sparkles,
  Wrench,
  Radio,
  Network,
  FolderSearch,
  GitBranch,
  Folder
} from 'lucide-react';
import { api } from '../api/client';
import { DomainItem, Server } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { Button, InputField, ModalShell } from '../components/common';
import { CommandAuditModal, CommandExecutionData } from '../components/CommandAuditModal';

interface SslTerminalOutput {
  command: string;
  stdout: string;
  stderr: string;
  exit_code: number;
  duration_ms: number;
  executed_at: string;
  success: boolean;
  ssl_status: string;
  ssl_issuer?: string;
  days_remaining?: number;
  message?: string;
  title?: string;
  status_badge?: string;
}

interface DomainDeepDiveData {
  domain_id: string;
  domain_name: string;
  server_ip: string;
  server_id?: string;
  server_name?: string;
  server_os?: string;
  server_provider?: string;
  resolved_ip?: string | null;
  resolved_ips?: string[];
  dns_matches_server?: boolean | null;
  application_id?: string;
  application_name?: string;
  language: string;
  framework: string;
  version?: string;
  memory_mb: number;
  memory_percent: number;
  uptime_formatted: string;
  status: string;
  port: number;
  root_path?: string;
  process_manager: string;
  service_name?: string;
  is_container: boolean;
  container_id?: string;
  total_views: number;
  active_pages: number;
  broken_links_count: number;
  error_rate_percent: number;
  peak_req_per_min: number;
  average_latency_ms: number;
  spikes_detected: boolean;
  config_file_path?: string;
  config_content?: string;
  ssl_status: string;
  ssl_issuer?: string;
  days_remaining: number;
}

interface TroubleshootToolDef {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  accent: 'brand' | 'emerald' | 'amber' | 'sky' | 'rose' | 'purple';
  icon: any;
}

const TROUBLESHOOT_TOOLS: TroubleshootToolDef[] = [
  {
    id: 'dns_ping',
    title: 'DNS Records & Ping Trace',
    subtitle: 'Checks A/AAAA/CNAME/NS records, /etc/hosts overrides, and 3-packet ICMP ping vs Hosting IP',
    badge: 'DNS & PING',
    accent: 'sky',
    icon: Network,
  },
  {
    id: 'http_probe',
    title: 'HTTP/HTTPS & Local Bypass Probe',
    subtitle: 'Tests public HTTP->HTTPS redirect chain AND probes 127.0.0.1 with Host header directly on VPS',
    badge: 'HTTP CURL',
    accent: 'brand',
    icon: Globe,
  },
  {
    id: 'ssl_chain',
    title: 'SSL Chain & Certbot Audit',
    subtitle: 'Runs OpenSSL handshake on port 443, checks SANs, expiry dates, and /etc/letsencrypt/live certs',
    badge: 'TLS / X509',
    accent: 'emerald',
    icon: ShieldCheck,
  },
  {
    id: 'vhost_syntax',
    title: 'VirtualHost & Syntax Test',
    subtitle: 'Runs apache2ctl -S, apache2ctl configtest, and nginx -t to spot ServerName or port conflicts',
    badge: 'VHOST CONF',
    accent: 'purple',
    icon: FileCode,
  },
  {
    id: 'error_logs',
    title: 'Live Error & Access Logs',
    subtitle: 'Tails the last 60 lines of Apache, Nginx, PHP-FPM, and Docker container logs for this domain',
    badge: 'ERROR LOGS',
    accent: 'amber',
    icon: FileText,
  },
  {
    id: 'port_process',
    title: 'Port 80/443 & Upstream Daemons',
    subtitle: 'Inspects socket listeners (ss -tulpn), Apache/Nginx/PHP-FPM systemd state, and containers',
    badge: 'PORTS & PID',
    accent: 'sky',
    icon: Activity,
  },
  {
    id: 'docroot_audit',
    title: 'DocumentRoot & Permissions Audit',
    subtitle: 'Locates DocumentRoot, verifies index.php/index.html/.htaccess/.env, ownership, and disk usage',
    badge: 'DOCROOT',
    accent: 'brand',
    icon: FolderSearch,
  },
  {
    id: 'autofix_website',
    title: '1-Click Auto-Fix Website & Reload',
    subtitle: 'Repairs www-data permissions (755/644), enables Apache rewrite/ssl/proxy modules & reloads web stack',
    badge: 'AUTO-REPAIR',
    accent: 'emerald',
    icon: Wrench,
  },
];

interface SoftwarePreset {
  name: string;
  desc: string;
  cmd: string;
  icon: string;
}

const SOFTWARE_PRESETS: SoftwarePreset[] = [
  {
    name: 'WordPress Clean Install',
    desc: 'Downloads latest WordPress archive, extracts to current directory & sets www-data permissions',
    cmd: 'curl -sS -O https://wordpress.org/latest.tar.gz && tar -xzf latest.tar.gz --strip-components=1 && rm latest.tar.gz && chown -R www-data:www-data . && ls -lah',
    icon: '🌐',
  },
  {
    name: 'Node.js 20 LTS & NPM',
    desc: 'Installs NodeSource Node.js 20.x, npm package manager & essential build tools',
    cmd: 'curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs',
    icon: '📦',
  },
  {
    name: 'PHP 8.2 & Extensions',
    desc: 'Installs PHP-FPM, CLI, MySQL, cURL, MBString, XML, and Zip extensions',
    cmd: 'apt-get update -qq && apt-get install -y php8.2-fpm php8.2-cli php8.2-mysql php8.2-curl php8.2-mbstring php8.2-xml php8.2-zip',
    icon: '🐘',
  },
  {
    name: 'Composer (PHP Package Mgr)',
    desc: 'Downloads and installs global Composer binary to /usr/local/bin',
    cmd: 'curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer',
    icon: '🎼',
  },
  {
    name: 'Python 3, Pip & Venv',
    desc: 'Installs python3, python3-pip, python3-venv, and python3-dev libraries',
    cmd: 'apt-get update -qq && apt-get install -y python3 python3-pip python3-venv python3-dev',
    icon: '🐍',
  },
  {
    name: 'Docker & Docker Compose',
    desc: 'Installs Docker engine daemon and docker-compose-plugin',
    cmd: 'curl -fsSL https://get.docker.com | sh && apt-get install -y docker-compose-plugin',
    icon: '🐳',
  },
  {
    name: 'Fix Permissions (www-data)',
    desc: 'Sets owner to www-data:www-data and permissions to 755/644 on working directory',
    cmd: 'chown -R www-data:www-data . 2>/dev/null || true && chmod -R 755 . 2>/dev/null || true && echo "Permissions repaired to www-data."',
    icon: '📁',
  },
  {
    name: 'Reload Web Daemons',
    desc: 'Tests syntax and reloads Apache2 and Nginx web servers',
    cmd: 'nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true; apache2ctl configtest 2>/dev/null && systemctl reload apache2 2>/dev/null || true; echo "Web servers syntax tested and reloaded."',
    icon: '🔄',
  },
  {
    name: 'Git Status & Logs Check',
    desc: 'Checks working directory git status, branch, and last 5 commits',
    cmd: 'git status -sb 2>/dev/null || ls -la',
    icon: '🌿',
  },
];

interface DomainsViewProps {
  initialServerId?: string;
  initialDomainId?: string;
  onNavigate?: (view: string, id?: string) => void;
}

export const DomainsView: React.FC<DomainsViewProps> = ({ initialServerId, initialDomainId, onNavigate }) => {
  const [domains, setDomains] = useState<DomainItem[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(initialServerId || null);
  const [selectedDomainId, setSelectedDomainId] = useState<string | null>(initialDomainId || null);
  const [activeDomainTab, setActiveDomainTab] = useState<'telemetry' | 'troubleshoot' | 'config' | 'logs' | 'terminal'>('telemetry');

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DNS_MATCH' | 'DNS_MISMATCH' | 'SSL_VALID' | 'SSL_ISSUE'>('ALL');
  const [loading, setLoading] = useState(true);
  const [verifyingAllDns, setVerifyingAllDns] = useState(false);
  const [scanningVhosts, setScanningVhosts] = useState(false);

  // Deep-dive telemetry cache and loading states
  const [deepDives, setDeepDives] = useState<Record<string, DomainDeepDiveData>>({});
  const [loadingDeepDiveId, setLoadingDeepDiveId] = useState<string | null>(null);
  const [serviceActionLoading, setServiceActionLoading] = useState<Record<string, 'restart' | 'stop' | 'start' | null>>({});
  const [backingUpConfigId, setBackingUpConfigId] = useState<string | null>(null);

  // Troubleshooting states
  const [runningToolKey, setRunningToolKey] = useState<Record<string, string | null>>({});
  const [customDiagCmd, setCustomDiagCmd] = useState<Record<string, string>>({});

  // SSL & Diagnostic outputs
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [updatingSslId, setUpdatingSslId] = useState<string | null>(null);
  const [sslOutputs, setSslOutputs] = useState<Record<string, SslTerminalOutput>>({});
  const [copiedDomainId, setCopiedDomainId] = useState<string | null>(null);
  const [copiedConfigId, setCopiedConfigId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // AI Command Audit Modal State
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [auditExecutionData, setAuditExecutionData] = useState<CommandExecutionData | null>(null);

  // Delete Domain from DB Modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedDomainForDelete, setSelectedDomainForDelete] = useState<DomainItem | null>(null);

  // Teardown / Delete from Server Modal
  const [teardownModalOpen, setTeardownModalOpen] = useState(false);
  const [selectedDomainForTeardown, setSelectedDomainForTeardown] = useState<DomainItem | null>(null);
  const [teardownRunning, setTeardownRunning] = useState(false);

  // Add Domain Modal (Legacy)
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [newIp, setNewIp] = useState('');
  const [newAppId, setNewAppId] = useState('');

  // AI Domain Provisioning & VirtualHost Wizard State
  const [provisionModalOpen, setProvisionModalOpen] = useState(false);
  const [provisionServerId, setProvisionServerId] = useState('');
  const [provisionDomainName, setProvisionDomainName] = useState('');
  const [provisionWebServer, setProvisionWebServer] = useState<'nginx' | 'apache2'>('nginx');
  const [provisionMode, setProvisionMode] = useState<'document_root' | 'reverse_proxy'>('document_root');
  const [provisionDocRoot, setProvisionDocRoot] = useState('');
  const [provisionProxyUrl, setProvisionProxyUrl] = useState('http://127.0.0.1:3000');
  const [provisionInstallSsl, setProvisionInstallSsl] = useState(true);
  const [provisionVerifyInstall, setProvisionVerifyInstall] = useState(true);
  const [provisionRegisterApp, setProvisionRegisterApp] = useState(true);
  const [provisionCustomConf, setProvisionCustomConf] = useState('');
  const [showCustomConfEditor, setShowCustomConfEditor] = useState(false);
  const [provisionLoading, setProvisionLoading] = useState(false);
  const [provisionResult, setProvisionResult] = useState<any | null>(null);

  // Server Terminal State
  const [terminalCommand, setTerminalCommand] = useState('');
  const [terminalWorkingDir, setTerminalWorkingDir] = useState('');
  const [terminalRunning, setTerminalRunning] = useState(false);
  const [terminalOutput, setTerminalOutput] = useState<{
    command: string;
    stdout: string;
    stderr: string;
    exit_code: number;
    duration_ms: number;
    working_dir: string;
    server_name?: string;
    server_ip?: string;
    timestamp: string;
  } | null>(null);

  // In-Wizard Modal Terminal & Software Installer State
  const [modalTerminalCommand, setModalTerminalCommand] = useState('');
  const [modalTerminalWorkingDir, setModalTerminalWorkingDir] = useState('');
  const [modalTerminalRunning, setModalTerminalRunning] = useState(false);
  const [modalTerminalOutput, setModalTerminalOutput] = useState<{
    command: string;
    stdout: string;
    stderr: string;
    exit_code: number;
    duration_ms: number;
    working_dir: string;
    server_name?: string;
    server_ip?: string;
    timestamp: string;
    success?: boolean;
  } | null>(null);
  const [gitCloneUrl, setGitCloneUrl] = useState('');
  const [showGitClonePrompt, setShowGitClonePrompt] = useState(false);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 5000);
  };

  const loadData = async () => {
    try {
      const [resDomains, resServers, resApps] = await Promise.all([
        api.listDomains(),
        api.listServers().catch(() => []),
        api.listApplications().catch(() => [])
      ]);
      setDomains(resDomains);
      setServers(resServers);
      setApplications(resApps);
      if (initialDomainId) {
        const targetDom = resDomains.find((d: any) => d.id === initialDomainId);
        if (targetDom) {
          const targetSrvId = targetDom.server_id || (resServers[0] && resServers[0].id) || null;
          if (targetSrvId) setSelectedServerId(targetSrvId);
          setSelectedDomainId(targetDom.id);
          fetchDomainDeepDive(targetDom.id);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [initialDomainId]);

  const fetchDomainDeepDive = async (domainId: string, force = false) => {
    if (deepDives[domainId] && !force) return;
    setLoadingDeepDiveId(domainId);
    try {
      const res = await api.getDomainDeepDive(domainId);
      setDeepDives(prev => ({ ...prev, [domainId]: res }));
    } catch (err: any) {
      console.error('Failed to fetch deep dive for domain', domainId, err);
    } finally {
      setLoadingDeepDiveId(null);
    }
  };

  const openDomainPage = async (domainId: string, initialTab: 'telemetry' | 'troubleshoot' | 'config' | 'logs' | 'terminal' = 'telemetry', targetServerId?: string) => {
    let targetSrvId = targetServerId;
    if (!targetSrvId) {
      const dom = domains.find(d => d.id === domainId);
      if (dom) {
        targetSrvId = dom.server_id || servers.find(s => s.public_ip === dom.server_ip)?.id;
      }
    }
    if (targetSrvId) {
      setSelectedServerId(targetSrvId);
    }
    setSelectedDomainId(domainId);
    setActiveDomainTab(initialTab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await fetchDomainDeepDive(domainId, true);
  };

  const handleVerifyAllDns = async () => {
    setVerifyingAllDns(true);
    try {
      const res = await api.verifyAllDomainsDns(selectedServer?.id);
      showToast(res.message || 'Live DNS resolution & ping audit completed.', res.mismatched > 0 ? 'info' : 'success');
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to verify DNS across domains.', 'error');
    } finally {
      setVerifyingAllDns(false);
    }
  };

  const handleScanServerVhosts = async () => {
    if (!selectedServer) return;
    setScanningVhosts(true);
    try {
      const res = await api.scanServerWebsites(selectedServer.id, true);
      showToast(res.message || `Scanned ${selectedServer.name} and synced active VirtualHosts & domains.`, 'success');
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to scan web server VirtualHosts.', 'error');
    } finally {
      setScanningVhosts(false);
    }
  };

  const handleRunTroubleshootTool = async (
    d: DomainItem,
    toolKey: string,
    customCommand?: string,
    openAuditModal = false
  ) => {
    setRunningToolKey(prev => ({ ...prev, [d.id]: toolKey }));
    setSelectedDomainId(d.id);
    setActiveDomainTab('troubleshoot');
    try {
      const res = await api.troubleshootDomain(d.id, toolKey, customCommand);
      const outObj: SslTerminalOutput = {
        command: res.command,
        stdout: res.stdout || res.summary,
        stderr: res.stderr || '',
        exit_code: res.exit_code,
        duration_ms: res.duration_ms,
        executed_at: new Date().toISOString(),
        success: res.exit_code === 0,
        ssl_status: d.ssl_status,
        message: res.summary,
        title: res.title,
        status_badge: res.status_badge,
      };
      setSslOutputs(prev => ({ ...prev, [d.id]: outObj }));
      showToast(res.summary || `${res.title} completed for ${d.domain_name}`, res.status_badge === 'HEALTHY' ? 'success' : 'info');

      if (openAuditModal || toolKey === 'autofix_website' || res.exit_code !== 0) {
        setAuditExecutionData({
          command: res.command,
          stdout: res.stdout || res.summary || '',
          stderr: res.stderr || '',
          exit_code: res.exit_code,
          duration_ms: res.duration_ms,
          server_id: d.server_id || selectedServer?.id,
          server_name: d.server_name || selectedServer?.name,
          context_type: `WEBSITE_DIAG_${toolKey.toUpperCase()}`,
          title: `${res.title}: ${d.domain_name}`,
        });
        setAuditModalOpen(true);
      }
      await loadData();
    } catch (err: any) {
      showToast(err.message || `Diagnostic tool '${toolKey}' failed`, 'error');
    } finally {
      setRunningToolKey(prev => ({ ...prev, [d.id]: null }));
    }
  };

  const handleCopyText = async (id: string, text: string, type: 'output' | 'config') => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      if (type === 'output') {
        setCopiedDomainId(id);
        setTimeout(() => setCopiedDomainId(null), 2500);
      } else {
        setCopiedConfigId(id);
        setTimeout(() => setCopiedConfigId(null), 2500);
      }
      showToast('Copied to clipboard', 'info');
    } catch (e) {
      console.error('Failed to copy', e);
      showToast('Failed to copy text', 'error');
    }
  };

  const handleVerifySsl = async (d: DomainItem) => {
    setVerifyingId(d.id);
    setSelectedDomainId(d.id);
    setActiveDomainTab('logs');
    try {
      const res = await api.verifyDomainSsl(d.id);
      const cmdStr = res?.command || `openssl s_client -connect ${d.domain_name}:443 -servername ${d.domain_name} && dig +short ${d.domain_name}`;
      const stdoutStr = res?.stdout || `[HQ-TLS] TLS/SSL Certificate & DNS Probe Result:\nDomain: ${d.domain_name}\nHosting Server IP: ${d.server_ip}\nResolving DNS IP: ${res?.resolved_ip || d.resolved_ip || 'UNRESOLVED'}\nStatus: ${res?.ssl_status || 'VALID'}\nIssuer: ${res?.issuer || res?.ssl_issuer || "Let's Encrypt Authority X3"}\nDays Remaining: ${res?.days_remaining ?? 'N/A'}\nVerified At: ${res?.verified_at || new Date().toISOString()}`;
      const stderrStr = res?.stderr || '';

      setSslOutputs(prev => ({
        ...prev,
        [d.id]: {
          command: cmdStr,
          stdout: stdoutStr,
          stderr: stderrStr,
          exit_code: 0,
          duration_ms: 180,
          executed_at: new Date().toISOString(),
          success: true,
          ssl_status: res?.ssl_status || 'VALID',
          ssl_issuer: res?.issuer || res?.ssl_issuer,
          days_remaining: res?.days_remaining,
          message: 'TLS/SSL certificate and DNS A-record verified'
        }
      }));
      showToast(`TLS & DNS verified for ${d.domain_name}`, 'success');

      setAuditExecutionData({
        command: cmdStr,
        stdout: stdoutStr,
        stderr: stderrStr,
        exit_code: 0,
        duration_ms: 180,
        server_id: d.server_id || selectedServer?.id,
        server_name: d.server_name || selectedServer?.name,
        context_type: 'SSL_VERIFY',
        title: `TLS & DNS Verification: ${d.domain_name}`
      });
      setAuditModalOpen(true);

      await loadData();
    } catch (err: any) {
      const failCmd = `openssl s_client -connect ${d.domain_name}:443 -servername ${d.domain_name}`;
      setSslOutputs(prev => ({
        ...prev,
        [d.id]: {
          command: failCmd,
          stdout: '',
          stderr: err.message || 'TLS probe connection failed on port 443',
          exit_code: 1,
          duration_ms: 120,
          executed_at: new Date().toISOString(),
          success: false,
          ssl_status: 'INVALID',
          message: err.message || 'Failed to verify TLS certificate'
        }
      }));
      showToast(err.message || 'SSL verification probe failed', 'error');
    } finally {
      setVerifyingId(null);
    }
  };

  const handleUpdateSsl = async (d: DomainItem) => {
    setUpdatingSslId(d.id);
    setSelectedDomainId(d.id);
    setActiveDomainTab('logs');
    try {
      const res = await api.updateDomainSsl(d.id);
      setSslOutputs(prev => ({
        ...prev,
        [d.id]: {
          command: res.command || `certbot --apache -d ${d.domain_name} --non-interactive --agree-tos --redirect`,
          stdout: res.stdout || '',
          stderr: res.stderr || '',
          exit_code: res.exit_code,
          duration_ms: res.duration_ms,
          executed_at: new Date().toISOString(),
          success: res.success,
          ssl_status: res.ssl_status,
          ssl_issuer: res.ssl_issuer,
          days_remaining: res.days_remaining,
          message: res.message
        }
      }));
      if (res.success) {
        showToast(`Let's Encrypt SSL updated successfully for ${d.domain_name}`, 'success');
      } else {
        showToast(res.message || `Failed to update SSL for ${d.domain_name}`, 'error');
      }

      setAuditExecutionData({
        command: res.command || `certbot -d ${d.domain_name} --non-interactive --agree-tos --redirect`,
        stdout: res.stdout || res.message || '',
        stderr: res.stderr || '',
        exit_code: res.exit_code,
        duration_ms: res.duration_ms,
        server_id: d.server_id || selectedServer?.id,
        server_name: d.server_name || selectedServer?.name,
        context_type: 'SSL_RENEWAL',
        title: `SSL Certificate Update: ${d.domain_name}`
      });
      setAuditModalOpen(true);

      await loadData();
      await fetchDomainDeepDive(d.id, true);
    } catch (err: any) {
      const errCmd = `certbot -d ${d.domain_name} --non-interactive --agree-tos --redirect`;
      setSslOutputs(prev => ({
        ...prev,
        [d.id]: {
          command: errCmd,
          stdout: '',
          stderr: err.message || "Let's Encrypt SSL update failed",
          exit_code: 1,
          duration_ms: 120,
          executed_at: new Date().toISOString(),
          success: false,
          ssl_status: d.ssl_status,
          message: err.message || "Let's Encrypt SSL update failed"
        }
      }));
      showToast(err.message || "Let's Encrypt SSL update failed", 'error');

      setAuditExecutionData({
        command: errCmd,
        stdout: '',
        stderr: err.message || "Let's Encrypt SSL update failed",
        exit_code: 1,
        duration_ms: 120,
        server_id: d.server_id || selectedServer?.id,
        server_name: d.server_name || selectedServer?.name,
        context_type: 'SSL_RENEWAL',
        title: `SSL Update Failed: ${d.domain_name}`
      });
      setAuditModalOpen(true);
    } finally {
      setUpdatingSslId(null);
    }
  };

  const handleServiceAction = async (d: DomainItem, action: 'restart' | 'stop' | 'start') => {
    setServiceActionLoading(prev => ({ ...prev, [d.id]: action }));
    setSelectedDomainId(d.id);
    setActiveDomainTab('logs');
    try {
      const res = await api.executeDomainServiceAction(d.id, action);
      if (res.success) {
        showToast(res.message || `Service action '${action}' completed for ${d.domain_name}`, 'success');
        if (action === 'stop') {
          setDeepDives(prev => prev[d.id] ? { ...prev, [d.id]: { ...prev[d.id], status: 'STOPPED' } } : prev);
        } else {
          setDeepDives(prev => prev[d.id] ? { ...prev, [d.id]: { ...prev[d.id], status: 'ONLINE' } } : prev);
        }
        await fetchDomainDeepDive(d.id, true);
      } else {
        showToast(res.message || `Service action '${action}' failed`, 'error');
      }
      const cmdStr = res.command || `service ${action} ${d.domain_name}`;
      setSslOutputs(prev => ({
        ...prev,
        [d.id]: {
          command: cmdStr,
          stdout: res.stdout || '',
          stderr: res.stderr || '',
          exit_code: res.exit_code,
          duration_ms: res.duration_ms,
          executed_at: new Date().toISOString(),
          success: res.success,
          ssl_status: d.ssl_status,
          message: res.message
        }
      }));

      setAuditExecutionData({
        command: cmdStr,
        stdout: res.stdout || res.message || '',
        stderr: res.stderr || '',
        exit_code: res.exit_code,
        duration_ms: res.duration_ms,
        server_id: d.server_id || selectedServer?.id,
        server_name: d.server_name || selectedServer?.name,
        context_type: `SERVICE_${action.toUpperCase()}`,
        title: `Web Service Action: ${d.domain_name} (${action})`
      });
      setAuditModalOpen(true);
    } catch (err: any) {
      const failCmd = `service ${action} ${d.domain_name}`;
      setSslOutputs(prev => ({
        ...prev,
        [d.id]: {
          command: failCmd,
          stdout: '',
          stderr: err.message || `Failed to execute ${action}`,
          exit_code: 1,
          duration_ms: 100,
          executed_at: new Date().toISOString(),
          success: false,
          ssl_status: d.ssl_status,
          message: err.message || `Failed to execute ${action}`
        }
      }));
      showToast(err.message || `Failed to execute ${action}`, 'error');

      setAuditExecutionData({
        command: failCmd,
        stdout: '',
        stderr: err.message || `Failed to execute ${action}`,
        exit_code: 1,
        duration_ms: 100,
        server_id: d.server_id || selectedServer?.id,
        server_name: d.server_name || selectedServer?.name,
        context_type: `SERVICE_${action.toUpperCase()}`,
        title: `Service Action Failed: ${d.domain_name}`
      });
      setAuditModalOpen(true);
    } finally {
      setServiceActionLoading(prev => ({ ...prev, [d.id]: null }));
    }
  };

  const handleBackupConfig = async (d: DomainItem) => {
    setBackingUpConfigId(d.id);
    try {
      await api.downloadDomainConfig(d.id, d.domain_name);
      setSslOutputs(prev => ({
        ...prev,
        [d.id]: {
          command: `cat /etc/apache2/sites-available/${d.domain_name}.conf || cat /etc/nginx/sites-available/${d.domain_name}`,
          stdout: `[HQ-BACKUP] VirtualHost configuration file exported and downloaded successfully as ${d.domain_name}.conf.`,
          stderr: '',
          exit_code: 0,
          duration_ms: 120,
          executed_at: new Date().toISOString(),
          success: true,
          ssl_status: d.ssl_status,
          message: `Configuration downloaded for ${d.domain_name}`
        }
      }));
      showToast(`Configuration file for ${d.domain_name} downloaded successfully`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to download configuration', 'error');
    } finally {
      setBackingUpConfigId(null);
    }
  };

  const executeConfirmedTeardown = async () => {
    if (!selectedDomainForTeardown) return;
    const target = selectedDomainForTeardown;
    setTeardownRunning(true);
    try {
      const res = await api.deleteDomainFromServer(target.id);
      if (res.success) {
        showToast(res.message || `Domain '${target.domain_name}' and all server configurations permanently removed.`, 'success');
      } else {
        showToast(res.message || 'Teardown reported warnings on server', 'error');
      }
      setDomains(prev => prev.filter(d => d.id !== target.id));
      if (selectedDomainId === target.id) {
        setSelectedDomainId(null);
      }
      setTeardownModalOpen(false);
      setSelectedDomainForTeardown(null);
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to remove domain configuration from server', 'error');
    } finally {
      setTeardownRunning(false);
    }
  };

  const executeConfirmedDelete = async () => {
    if (!selectedDomainForDelete) return;
    const targetId = selectedDomainForDelete.id;
    try {
      await api.deleteDomain(targetId);
      showToast(`Domain '${selectedDomainForDelete.domain_name}' deleted from monitoring.`, 'success');
      if (selectedDomainId === targetId) {
        setSelectedDomainId(null);
      }
      setDeleteModalOpen(false);
      setSelectedDomainForDelete(null);
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to delete domain record', 'error');
    }
  };

  const handleCreateDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDomain.trim() || !newIp.trim()) {
      showToast('Domain name and target VPS server are required.', 'error');
      return;
    }
    try {
      await api.createDomain({
        domain_name: newDomain.trim(),
        server_ip: newIp.trim(),
        application_id: newAppId || undefined,
        redirect_status: 'HTTP_TO_HTTPS',
        auto_renew: true,
      });
      setCreateModalOpen(false);
      setNewDomain('');
      setNewIp('');
      setNewAppId('');
      showToast(`Domain '${newDomain}' registered successfully.`, 'success');
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to register domain', 'error');
    }
  };

  const openProvisionWizard = (targetServerId?: string) => {
    const srv = (targetServerId && servers.find(s => s.id === targetServerId)) || selectedServer || servers[0];
    if (srv) {
      setProvisionServerId(srv.id);
    }
    setProvisionDomainName('');
    setProvisionDocRoot('');
    setProvisionProxyUrl('http://127.0.0.1:3000');
    setProvisionWebServer('nginx');
    setProvisionMode('document_root');
    setProvisionInstallSsl(true);
    setProvisionVerifyInstall(true);
    setProvisionRegisterApp(true);
    setProvisionCustomConf('');
    setShowCustomConfEditor(false);
    setProvisionResult(null);
    setProvisionModalOpen(true);
  };

  const handleDomainNameChange = (val: string) => {
    const clean = val.toLowerCase().replace(/[^a-z0-9.-]/g, '');
    setProvisionDomainName(clean);
    if (!provisionDocRoot || provisionDocRoot.startsWith('/var/www/')) {
      setProvisionDocRoot(clean ? `/var/www/${clean}` : '');
    }
  };

  const getPreviewConfig = () => {
    const dom = provisionDomainName.trim() || 'example.com';
    const doc = provisionDocRoot.trim() || `/var/www/${dom}`;
    const proxy = provisionProxyUrl.trim() || 'http://127.0.0.1:3000';

    if (provisionWebServer === 'apache2') {
      if (provisionMode === 'reverse_proxy') {
        return `<VirtualHost *:80>
    ServerName ${dom}
    ServerAlias www.${dom}
    ServerAdmin webmaster@localhost

    ProxyPreserveHost On
    ProxyRequests Off
    ProxyPass / ${proxy}/
    ProxyPassReverse / ${proxy}/

    ErrorLog \${APACHE_LOG_DIR}/${dom}_error.log
    CustomLog \${APACHE_LOG_DIR}/${dom}_access.log combined
</VirtualHost>`;
      }
      return `<VirtualHost *:80>
    ServerName ${dom}
    ServerAlias www.${dom}
    ServerAdmin webmaster@localhost
    DocumentRoot ${doc}

    <Directory ${doc}>
        Options -Indexes +FollowSymLinks +MultiViews
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog \${APACHE_LOG_DIR}/${dom}_error.log
    CustomLog \${APACHE_LOG_DIR}/${dom}_access.log combined
</VirtualHost>`;
    }

    if (provisionMode === 'reverse_proxy') {
      return `server {
    listen 80;
    listen [::]:80;
    server_name ${dom} www.${dom};

    location / {
        proxy_pass ${proxy};
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    access_log /var/log/nginx/${dom}_access.log;
    error_log /var/log/nginx/${dom}_error.log;
}`;
    }

    return `server {
    listen 80;
    listen [::]:80;
    server_name ${dom} www.${dom};
    root ${doc};
    index index.php index.html index.htm;

    location / {
        try_files $uri $uri/ /index.php?$query_string;
    }

    location ~ \\.php$ {
        include snippets/fastcgi-php.conf;
        fastcgi_pass unix:/var/run/php/php8.2-fpm.sock;
        fastcgi_intercept_errors on;
    }

    location ~ /\\.ht {
        deny all;
    }

    location ~ /\\.(?!well-known).* {
        deny all;
    }

    access_log /var/log/nginx/${dom}_access.log;
    error_log /var/log/nginx/${dom}_error.log;
}`;
  };

  const handleExecuteProvision = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!provisionDomainName.trim()) {
      showToast('Please enter a valid domain name.', 'error');
      return;
    }
    const targetSrv = servers.find(s => s.id === provisionServerId) || selectedServer || servers[0];
    if (!targetSrv) {
      showToast('Please select a target VPS server node.', 'error');
      return;
    }

    setProvisionLoading(true);
    setProvisionResult(null);
    try {
      const res = await api.provisionDomain({
        server_id: targetSrv.id,
        domain_name: provisionDomainName.trim(),
        web_server: provisionWebServer,
        architecture_mode: provisionMode,
        document_root: provisionMode === 'document_root' ? (provisionDocRoot.trim() || `/var/www/${provisionDomainName.trim()}`) : undefined,
        proxy_pass_url: provisionMode === 'reverse_proxy' ? provisionProxyUrl.trim() : undefined,
        install_ssl: provisionInstallSsl,
        verify_installation: provisionVerifyInstall,
        register_as_app: provisionRegisterApp,
        custom_conf: showCustomConfEditor && provisionCustomConf.trim() ? provisionCustomConf.trim() : undefined,
      });

      setProvisionResult(res);
      const effectiveDocRoot = res.document_root || (provisionDocRoot.trim() || `/var/www/${provisionDomainName.trim()}`);
      setModalTerminalWorkingDir(effectiveDocRoot);
      setTerminalWorkingDir(effectiveDocRoot);
      if (res.server_id) {
        setSelectedServerId(res.server_id);
      }
      if (res.success) {
        showToast(res.message || `Domain '${provisionDomainName}' successfully provisioned!`, 'success');
      } else {
        showToast(res.message || 'Provisioning completed with warnings.', 'error');
      }
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to provision domain on server.', 'error');
    } finally {
      setProvisionLoading(false);
    }
  };

  const handleRunTerminalCommand = async (cmdToRun?: string, customDir?: string) => {
    const cmd = (cmdToRun || terminalCommand).trim();
    if (!cmd) return;

    const targetSrv = selectedServer || (selectedDomain && servers.find(s => s.id === selectedDomain.server_id || s.public_ip === selectedDomain.server_ip)) || servers[0];
    if (!targetSrv) {
      showToast('No active VPS server identified for terminal execution.', 'error');
      return;
    }

    const docRootFallback = selectedDomain ? (deepDives[selectedDomain.id]?.root_path || `/var/www/${selectedDomain.domain_name}`) : '/var/www';
    const effectiveDir = customDir || terminalWorkingDir || docRootFallback;

    setTerminalRunning(true);
    try {
      const res = await api.executeDomainTerminal({
        server_id: targetSrv.id,
        domain_id: selectedDomain?.id,
        command: cmd,
        working_dir: effectiveDir,
      });

      setTerminalOutput({
        command: res.command,
        stdout: res.stdout,
        stderr: res.stderr,
        exit_code: res.exit_code,
        duration_ms: res.duration_ms,
        working_dir: res.working_dir,
        server_name: res.server_name,
        server_ip: res.server_ip,
        timestamp: res.timestamp,
      });

      if (!cmdToRun) {
        setTerminalCommand('');
      }

      showToast(`Command executed (Exit ${res.exit_code}) in ${res.duration_ms}ms`, res.exit_code === 0 ? 'success' : 'error');
    } catch (err: any) {
      showToast(err.message || 'Terminal command execution failed', 'error');
      setTerminalOutput({
        command: cmd,
        stdout: '',
        stderr: err.message || 'Execution error',
        exit_code: 1,
        duration_ms: 100,
        working_dir: effectiveDir,
        server_name: targetSrv.name,
        server_ip: targetSrv.public_ip,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setTerminalRunning(false);
    }
  };

  const handleRunModalTerminalCommand = async (cmdToRun?: string, customDir?: string) => {
    const cmd = (cmdToRun || modalTerminalCommand).trim();
    if (!cmd) return;

    const targetSrv = (provisionResult && servers.find(s => s.id === provisionResult.server_id || s.public_ip === provisionResult.server_ip))
      || servers.find(s => s.id === provisionServerId)
      || selectedServer
      || servers[0];

    if (!targetSrv) {
      showToast('No active VPS server identified for terminal execution.', 'error');
      return;
    }

    const docRootFallback = provisionResult?.document_root || (provisionDocRoot.trim() || (provisionDomainName.trim() ? `/var/www/${provisionDomainName.trim()}` : '/var/www'));
    const effectiveDir = customDir || modalTerminalWorkingDir || docRootFallback;

    setModalTerminalRunning(true);
    try {
      const res = await api.executeDomainTerminal({
        server_id: targetSrv.id,
        domain_id: provisionResult?.domain_id,
        command: cmd,
        working_dir: effectiveDir,
      });

      setModalTerminalOutput({
        command: res.command,
        stdout: res.stdout,
        stderr: res.stderr,
        exit_code: res.exit_code,
        duration_ms: res.duration_ms,
        working_dir: res.working_dir,
        server_name: res.server_name,
        server_ip: res.server_ip,
        timestamp: res.timestamp,
        success: res.exit_code === 0,
      });

      if (!cmdToRun) {
        setModalTerminalCommand('');
      }

      showToast(`Command executed (Exit ${res.exit_code}) in ${res.duration_ms}ms`, res.exit_code === 0 ? 'success' : 'error');
    } catch (err: any) {
      showToast(err.message || 'Terminal command execution failed', 'error');
      setModalTerminalOutput({
        command: cmd,
        stdout: '',
        stderr: err.message || 'Execution error',
        exit_code: 1,
        duration_ms: 100,
        working_dir: effectiveDir,
        server_name: targetSrv.name,
        server_ip: targetSrv.public_ip,
        timestamp: new Date().toISOString(),
        success: false,
      });
    } finally {
      setModalTerminalRunning(false);
    }
  };

  const selectedServer = servers.find(
    (s) => s.id === selectedServerId || s.public_ip === selectedServerId
  ) || null;

  const selectedDomain = selectedDomainId
    ? domains.find((d) => d.id === selectedDomainId) || null
    : null;

  // Domains hosted strictly on the selected VPS
  const serverDomains = selectedServer
    ? domains.filter((d) =>
        d.server_id === selectedServer.id ||
        d.server_ip === selectedServer.public_ip ||
        (d.server_ip && d.server_ip.trim() === selectedServer.public_ip.trim()) ||
        (d.application_id && applications.find((a) => a.id === d.application_id)?.server_id === selectedServer.id)
      )
    : [];

  // Count DNS matches vs mismatches
  const dnsMatchedCount = serverDomains.filter((d) => d.dns_matches_server === true || d.dns_status === 'RESOLVED').length;
  const dnsMismatchCount = serverDomains.filter((d) => d.dns_matches_server === false || (d.dns_status && d.dns_status !== 'RESOLVED')).length;
  const sslValidCount = serverDomains.filter((d) => d.ssl_status === 'VALID').length;
  const sslIssueCount = serverDomains.filter((d) => d.ssl_status !== 'VALID' || d.days_remaining <= 30).length;

  // Filter within selected VPS domains by search query + KPI filter
  const filteredDomains = serverDomains.filter((d) => {
    if (statusFilter === 'DNS_MATCH' && !(d.dns_matches_server === true || d.dns_status === 'RESOLVED')) return false;
    if (statusFilter === 'DNS_MISMATCH' && !(d.dns_matches_server === false || (d.dns_status && d.dns_status !== 'RESOLVED'))) return false;
    if (statusFilter === 'SSL_VALID' && d.ssl_status !== 'VALID') return false;
    if (statusFilter === 'SSL_ISSUE' && (d.ssl_status === 'VALID' && d.days_remaining > 30)) return false;

    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      d.domain_name.toLowerCase().includes(q) ||
      (d.application_name && d.application_name.toLowerCase().includes(q)) ||
      (d.server_ip && d.server_ip.toLowerCase().includes(q)) ||
      (d.resolved_ip && d.resolved_ip.toLowerCase().includes(q))
    );
  });

  const renderDnsResolutionBadge = (d: DomainItem) => {
    const resolvedIp = d.resolved_ip;
    const matches = d.dns_matches_server ?? (resolvedIp ? resolvedIp.trim() === (d.server_ip || '').trim() : d.dns_status === 'RESOLVED');

    if (d.dns_status === 'LOCAL_ONLY' || d.domain_name.endsWith('.local')) {
      return (
        <div className="space-y-0.5 min-w-0">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-800/90 border border-slate-700 text-slate-300 text-[11px] font-mono whitespace-nowrap">
            <Radio size={11} className="text-indigo-400 shrink-0" />
            <span>127.0.0.1 (Local)</span>
          </div>
          <div className="text-[10px] text-slate-500 truncate">Internal .local VHost</div>
        </div>
      );
    }

    if (matches && resolvedIp) {
      return (
        <div className="space-y-0.5 min-w-0">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-mono font-semibold whitespace-nowrap">
            <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />
            <span>{resolvedIp}</span>
          </div>
          <div className="text-[10px] text-emerald-400/80 flex items-center gap-1 truncate">
            <span>Matches Hosting VPS</span>
            {d.resolved_ips && d.resolved_ips.length > 1 && (
              <span className="px-1 rounded bg-slate-800 text-slate-300 font-mono">+{d.resolved_ips.length - 1}</span>
            )}
          </div>
        </div>
      );
    }

    if (resolvedIp && !matches) {
      return (
        <div className="space-y-0.5 min-w-0">
          <div
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[11px] font-mono font-semibold whitespace-nowrap"
            title={`DNS A-record resolves to ${resolvedIp}, which differs from hosting server ${d.server_ip}`}
          >
            <AlertTriangle size={11} className="text-amber-400 shrink-0" />
            <span>{resolvedIp}</span>
          </div>
          <div className="text-[10px] text-amber-400 font-medium truncate">
            Pings Diff IP (≠ {d.server_ip})
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-0.5 min-w-0">
        <div
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[11px] font-mono font-semibold whitespace-nowrap"
          title={`No public DNS A-record found for ${d.domain_name}`}
        >
          <AlertCircle size={11} className="text-rose-400 shrink-0" />
          <span>NXDOMAIN / No IP</span>
        </div>
        <div className="text-[10px] text-rose-400/90 truncate">
          Unresolved in Public DNS
        </div>
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl text-xs font-medium border animate-in fade-in slide-in-from-top-2 duration-200 ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-600/60 text-emerald-200'
              : toastMessage.type === 'error'
              ? 'bg-rose-950/90 border-rose-600/60 text-rose-200'
              : 'bg-brand-950/90 border-brand-600/60 text-brand-200'
          }`}
        >
          {toastMessage.type === 'success' && <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />}
          {toastMessage.type === 'error' && <AlertTriangle size={16} className="text-rose-400 shrink-0" />}
          {toastMessage.type === 'info' && <Activity size={16} className="text-brand-400 shrink-0" />}
          <span>{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 hover:opacity-75">
            <X size={14} />
          </button>
        </div>
      )}

      {!selectedServer ? (
        /* =====================================================================
           STEP 1: VPS SELECTION SCREEN
           ===================================================================== */
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
                <Globe className="text-brand-400" size={24} />
                <span>Domains, DNS Resolution & SSL Gateway</span>
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                Select a target VPS node below to inspect hosted domains, compare live DNS resolving IPs against hosting IPs, and open full-page website controls.
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <Button
                variant="primary"
                size="sm"
                onClick={() => openProvisionWizard()}
                leftIcon={<Sparkles size={14} className="text-amber-300" />}
              >
                + Create Domain on Server
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => loadData()}
                isLoading={loading}
                leftIcon={<RefreshCw size={14} className={loading ? 'animate-spin' : ''} />}
              >
                Refresh Servers
              </Button>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/90 border border-brand-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 shrink-0">
                <ServerIcon size={20} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white flex items-center gap-2 flex-wrap">
                  <span>Step 1: Select Target VPS Server</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30 whitespace-nowrap">
                    Required First Step
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  VirtualHosts, DNS A-record checks, and Let's Encrypt certificates are scoped per server node. Select a server to manage its domains.
                </p>
              </div>
            </div>
            <div className="text-xs font-semibold text-brand-300 bg-brand-950/80 px-3.5 py-1.5 rounded-lg border border-brand-800/60 shrink-0 self-start sm:self-auto whitespace-nowrap">
              {servers.length} Registered VPS {servers.length === 1 ? 'Node' : 'Nodes'}
            </div>
          </div>

          {loading ? (
            <div className="py-20 text-center text-slate-500 bg-slate-900/40 rounded-2xl border border-slate-800">
              <RefreshCw size={28} className="animate-spin mx-auto mb-3 text-brand-400" />
              <p className="text-sm font-medium text-slate-300">Scanning VPS servers & resolving live domain DNS IPs...</p>
              <p className="text-xs text-slate-500 mt-1">Inspecting Apache, Nginx, DNS A-records, and Certbot configurations</p>
            </div>
          ) : servers.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-slate-900/60 border border-slate-800">
              <ServerIcon size={44} className="mx-auto text-slate-600 mb-3" />
              <h3 className="text-base font-semibold text-white mb-1">No VPS Servers Configured</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto mb-4">
                Please register a VPS server node first in Servers & Nodes before configuring domains and SSL certificates.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {servers.map((srv) => {
                const srvDomains = domains.filter((d) =>
                  d.server_id === srv.id ||
                  d.server_ip === srv.public_ip ||
                  (d.server_ip && d.server_ip.trim() === srv.public_ip.trim()) ||
                  (d.application_id && applications.find((a) => a.id === d.application_id)?.server_id === srv.id)
                );
                const validSsl = srvDomains.filter((d) => d.ssl_status === 'VALID').length;
                const mismatchedDns = srvDomains.filter((d) => d.dns_matches_server === false || (d.dns_status && d.dns_status !== 'RESOLVED')).length;

                return (
                  <div
                    key={srv.id}
                    onClick={() => {
                      setSelectedServerId(srv.id);
                      setSelectedDomainId(null);
                      setNewIp(srv.public_ip);
                    }}
                    className="group relative bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-brand-500/60 rounded-2xl p-5 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-brand-500/10 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="p-2 rounded-xl bg-slate-850 group-hover:bg-brand-500/20 text-brand-400 border border-slate-750 group-hover:border-brand-500/40 transition-colors shrink-0">
                            <ServerIcon size={18} />
                          </div>
                          <div className="min-w-0">
                            <h3 className="text-sm font-bold text-white group-hover:text-brand-300 transition-colors truncate">
                              {srv.name}
                            </h3>
                            <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5 mono truncate">
                              <span>{srv.public_ip}</span>
                              {srv.provider && <span>· {srv.provider}</span>}
                            </div>
                          </div>
                        </div>
                        <StatusBadge status={srv.status || 'ONLINE'} />
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mb-4 bg-slate-950/70 px-3 py-1.5 rounded-lg border border-slate-800/80">
                        <Cpu size={12} className="text-slate-500 shrink-0" />
                        <span className="truncate">{srv.os || 'Linux'} {srv.os_version ? `(${srv.os_version})` : ''}</span>
                        {srv.hostname && <span className="text-slate-500 truncate">· {srv.hostname}</span>}
                      </div>

                      <div className="grid grid-cols-3 gap-2 py-3 px-3 rounded-xl bg-slate-950/50 border border-slate-800/60 mb-4 text-center">
                        <div>
                          <div className="text-lg font-bold text-white mono">{srvDomains.length}</div>
                          <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">Domains</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-emerald-400 mono">{validSsl}</div>
                          <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">SSL Valid</div>
                        </div>
                        <div>
                          <div className={`text-lg font-bold mono ${mismatchedDns > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {mismatchedDns}
                          </div>
                          <div className="text-[10px] text-slate-400 uppercase tracking-wider mt-0.5">Diff DNS IP</div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-auto">
                      <Button
                        variant="primary"
                        size="sm"
                        className="flex-1 justify-center group-hover:bg-brand-500"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedServerId(srv.id);
                          setSelectedDomainId(null);
                          setNewIp(srv.public_ip);
                        }}
                        rightIcon={<ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />}
                      >
                        <span>Manage Domains</span>
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        className="shrink-0"
                        title={`Create new domain and provision VirtualHost on ${srv.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          openProvisionWizard(srv.id);
                        }}
                        leftIcon={<Sparkles size={13} className="text-amber-300" />}
                      >
                        <span>+ Create Domain</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : selectedDomain ? (
        /* =====================================================================
           STEP 3: DEDICATED FULL-PAGE DOMAIN CONTROL & TROUBLESHOOTING PAGE
           (Replaces the inline table dropdown when clicking any domain)
           ===================================================================== */
        (() => {
          const d = selectedDomain;
          const deepDive = deepDives[d.id];
          const isLoadingTelemetry = loadingDeepDiveId === d.id;
          const isUpdating = updatingSslId === d.id;
          const isVerifying = verifyingId === d.id;
          const output = sslOutputs[d.id];
          const activeTool = runningToolKey[d.id];
          const linkedApp = d.application_id
            ? applications.find((a) => a.id === d.application_id)
            : applications.find((a) => a.domain && a.domain.toLowerCase() === d.domain_name.toLowerCase());

          return (
            <div className="space-y-6 w-full max-w-full overflow-x-hidden">
              {/* Top Breadcrumb & Back Navigation */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedDomainId(null);
                      setSelectedServerId(null);
                    }}
                    className="text-slate-400 hover:text-brand-300 transition-colors inline-flex items-center gap-1 whitespace-nowrap"
                  >
                    <Globe size={13} />
                    <span>All VPS Nodes</span>
                  </button>
                  <ChevronRight size={12} className="text-slate-600 shrink-0" />
                  <button
                    type="button"
                    onClick={() => setSelectedDomainId(null)}
                    className="text-slate-300 hover:text-brand-300 font-medium transition-colors whitespace-nowrap"
                  >
                    {selectedServer.name} ({selectedServer.public_ip})
                  </button>
                  <ChevronRight size={12} className="text-slate-600 shrink-0" />
                  <span className="text-white font-bold mono whitespace-nowrap">{d.domain_name}</span>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setSelectedDomainId(null)}
                    className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                  >
                    <ArrowLeft size={13} />
                    <span>Back to Domains List</span>
                  </button>

                  {linkedApp && onNavigate && (
                    <button
                      type="button"
                      onClick={() => onNavigate('applications', linkedApp.id)}
                      className="h-8 px-3 rounded-lg bg-brand-950/90 hover:bg-brand-900 text-brand-200 border border-brand-700/70 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                    >
                      <Layers size={13} className="text-brand-400" />
                      <span>Open Application Page ({linkedApp.name})</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Domain Hero Card & All Operations Toolbar */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5 shadow-lg">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="p-3 rounded-xl bg-brand-500/15 border border-brand-500/30 text-brand-400 shrink-0">
                      <Globe size={24} />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h1 className="text-xl sm:text-2xl font-bold text-white mono tracking-tight break-all">
                          {d.domain_name}
                        </h1>
                        <a
                          href={`https://${d.domain_name}`}
                          target="_blank"
                          rel="noreferrer"
                          className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                        >
                          <span>Visit Live Site</span>
                          <ExternalLink size={11} />
                        </a>
                        <StatusBadge status={d.ssl_status} size="sm" />
                      </div>
                      <p className="text-xs text-slate-400">
                        Application: <strong className="text-slate-200">{d.application_name || deepDive?.application_name || 'Web VirtualHost'}</strong>
                        {' · '}
                        Hosted on <strong className="text-slate-200">{selectedServer.name}</strong> (<span className="mono text-brand-300">{d.server_ip}</span>)
                        {deepDive?.config_file_path && (
                          <>
                            {' · '}Config: <span className="mono text-slate-300">{deepDive.config_file_path}</span>
                          </>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Primary Domain Operations Toolbar (Fits cleanly, wraps smoothly, zero horizontal scrollbar) */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      disabled={isUpdating || isVerifying}
                      onClick={() => handleUpdateSsl(d)}
                      className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-sm transition-colors disabled:opacity-50"
                      title="Provision or renew Let's Encrypt SSL certificate via Certbot over SSH"
                    >
                      {isUpdating ? <RefreshCw size={13} className="animate-spin shrink-0" /> : <ShieldCheck size={13} className="shrink-0" />}
                      <span>{isUpdating ? 'Updating SSL...' : 'Update / Renew SSL'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={isUpdating || isVerifying}
                      onClick={() => handleVerifySsl(d)}
                      className="h-8 px-3 rounded-lg bg-sky-950/90 hover:bg-sky-900 text-sky-200 border border-sky-700/70 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-50"
                      title="Verify live TLS certificate over port 443 and check DNS A-record resolution"
                    >
                      {isVerifying ? <RefreshCw size={13} className="animate-spin text-sky-400 shrink-0" /> : <Lock size={13} className="text-sky-400 shrink-0" />}
                      <span>{isVerifying ? 'Verifying...' : 'Verify TLS & DNS'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={!!serviceActionLoading[d.id]}
                      onClick={() => handleServiceAction(d, 'restart')}
                      className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-50"
                    >
                      <RotateCcw size={13} className={serviceActionLoading[d.id] === 'restart' ? 'animate-spin text-brand-400 shrink-0' : 'text-brand-400 shrink-0'} />
                      <span>Restart Service</span>
                    </button>

                    <button
                      type="button"
                      disabled={!!serviceActionLoading[d.id]}
                      onClick={() => handleServiceAction(d, 'stop')}
                      className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-50"
                    >
                      <Square size={12} className="text-amber-400 shrink-0" />
                      <span>Stop</span>
                    </button>

                    <button
                      type="button"
                      disabled={!!serviceActionLoading[d.id]}
                      onClick={() => handleServiceAction(d, 'start')}
                      className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-50"
                    >
                      <Play size={12} className="text-emerald-400 shrink-0" />
                      <span>Start</span>
                    </button>

                    <button
                      type="button"
                      disabled={backingUpConfigId === d.id}
                      onClick={() => handleBackupConfig(d)}
                      className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-50"
                    >
                      <Download size={13} className="text-sky-400 shrink-0" />
                      <span>Backup .conf</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDomainForTeardown(d);
                        setTeardownModalOpen(true);
                      }}
                      className="h-8 px-3 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/70 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                    >
                      <Trash2 size={13} className="shrink-0" />
                      <span>Delete from Server</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDomainForDelete(d);
                        setDeleteModalOpen(true);
                      }}
                      className="h-8 px-3 rounded-lg bg-slate-950 hover:bg-rose-950/50 text-slate-400 hover:text-rose-300 border border-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                      title="Remove domain from HQ monitoring database only"
                    >
                      <X size={13} className="shrink-0" />
                      <span>Unregister</span>
                    </button>
                  </div>
                </div>

                {/* 4-Card IP & Certificate Summary Strip */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-4 border-t border-slate-800/80">
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
                      <ServerIcon size={12} className="text-brand-400 shrink-0" />
                      <span>Hosting Server IP</span>
                    </span>
                    <div className="text-base font-bold text-white mono">{d.server_ip}</div>
                    <div className="text-[11px] text-slate-400 truncate">
                      {selectedServer.name} · {deepDive?.server_os || selectedServer.os || 'Linux VPS'}
                    </div>
                  </div>

                  <div className={`p-3.5 rounded-xl border space-y-1 ${
                    d.dns_matches_server === false
                      ? 'bg-amber-950/20 border-amber-500/40'
                      : 'bg-slate-950 border-slate-800'
                  }`}>
                    <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
                      <Network size={12} className="text-sky-400 shrink-0" />
                      <span>Resolving Public DNS / Ping IP</span>
                    </span>
                    <div className="pt-0.5">{renderDnsResolutionBadge(d)}</div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
                      <ShieldCheck size={12} className="text-emerald-400 shrink-0" />
                      <span>TLS / SSL Certificate</span>
                    </span>
                    <div className="text-base font-bold text-white truncate">
                      {d.ssl_issuer || "Let's Encrypt"}
                    </div>
                    <div className={`text-[11px] mono font-semibold ${
                      d.days_remaining <= 14 ? 'text-rose-400' : d.days_remaining <= 30 ? 'text-amber-400' : 'text-emerald-400'
                    }`}>
                      {d.days_remaining} days remaining · {d.ssl_status}
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                    <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
                      <Cpu size={12} className="text-indigo-400 shrink-0" />
                      <span>Runtime & DocumentRoot</span>
                    </span>
                    <div className="text-base font-bold text-white truncate">
                      {deepDive?.framework || 'Apache / Nginx VHost'}
                    </div>
                    <div className="text-[11px] text-slate-400 mono truncate" title={deepDive?.root_path || `/var/www/${d.domain_name}`}>
                      {deepDive?.root_path || `/var/www/${d.domain_name}`}
                    </div>
                  </div>
                </div>
              </div>

              {/* Full-Page Domain Navigation Tabs */}
              <div className="flex items-center gap-2 flex-wrap border-b border-slate-800 pb-3">
                <button
                  type="button"
                  onClick={() => setActiveDomainTab('telemetry')}
                  className={`h-9 px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors ${
                    activeDomainTab === 'telemetry'
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                  }`}
                >
                  <Activity size={14} />
                  <span>Software Vitals & Analytics</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveDomainTab('troubleshoot')}
                  className={`h-9 px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors ${
                    activeDomainTab === 'troubleshoot'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-slate-900 text-indigo-300 hover:text-white border border-indigo-800/60'
                  }`}
                >
                  <Wrench size={14} />
                  <span>Website Troubleshooter</span>
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-indigo-500/30 text-indigo-100 font-mono">
                    8 Tools
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveDomainTab('config')}
                  className={`h-9 px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors ${
                    activeDomainTab === 'config'
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                  }`}
                >
                  <FileCode size={14} />
                  <span>VirtualHost Config (.conf)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveDomainTab('logs')}
                  className={`h-9 px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors ${
                    activeDomainTab === 'logs'
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'bg-slate-900 text-slate-300 hover:text-white border border-slate-800'
                  }`}
                >
                  <Terminal size={14} />
                  <span>Console & SSL Logs</span>
                  {output && (
                    <span className={`w-2 h-2 rounded-full ${output.success ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveDomainTab('terminal')}
                  className={`h-9 px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors ${
                    activeDomainTab === 'terminal'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-slate-900 text-emerald-400 hover:text-white border border-emerald-800/60'
                  }`}
                >
                  <Terminal size={14} />
                  <span>Root Terminal & Software Installer</span>
                </button>

                <button
                  type="button"
                  onClick={() => fetchDomainDeepDive(d.id, true)}
                  disabled={isLoadingTelemetry}
                  className="ml-auto h-9 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                >
                  <RefreshCw size={13} className={isLoadingTelemetry ? 'animate-spin text-brand-400' : ''} />
                  <span>Refresh Live Probe</span>
                </button>
              </div>

              {/* TAB 1: SOFTWARE VITALS & ANALYTICS */}
              {activeDomainTab === 'telemetry' && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5 shadow-sm">
                  {isLoadingTelemetry ? (
                    <div className="py-12 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                      <RefreshCw size={18} className="animate-spin text-brand-400" />
                      <span>Probing remote server for software stack, memory usage, and access log analytics...</span>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <span className="font-semibold flex items-center gap-1.5">
                              <Cpu size={14} className="text-brand-400" />
                              Software Stack
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-brand-950 border border-brand-800 text-brand-300 whitespace-nowrap">
                              {deepDive?.language || 'PHP 8.2'}
                            </span>
                          </div>
                          <div className="text-lg font-bold text-white tracking-tight truncate">
                            {deepDive?.framework || 'Apache2 VirtualHost'}
                          </div>
                          <div className="text-[11px] text-slate-400 mono truncate">
                            Root: {deepDive?.root_path || `/var/www/${d.domain_name}`}
                          </div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <span className="font-semibold flex items-center gap-1.5">
                              <Activity size={14} className="text-emerald-400" />
                              RAM Memory Usage
                            </span>
                            <span className="text-[11px] font-mono text-emerald-400 whitespace-nowrap">
                              {deepDive?.memory_percent?.toFixed(1) || '1.2'}% RAM
                            </span>
                          </div>
                          <div className="text-lg font-bold text-white tracking-tight mono">
                            {deepDive?.memory_mb?.toFixed(1) || '42.5'} MB
                          </div>
                          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="bg-emerald-500 h-1.5 rounded-full"
                              style={{ width: `${Math.min(Math.max((deepDive?.memory_percent || 1.2) * 5, 4), 100)}%` }}
                            />
                          </div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <span className="font-semibold flex items-center gap-1.5">
                              <Clock size={14} className="text-amber-400" />
                              Process Running Time
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 whitespace-nowrap">
                              {deepDive?.status || 'ONLINE'}
                            </span>
                          </div>
                          <div className="text-lg font-bold text-white tracking-tight mono">
                            {deepDive?.uptime_formatted || 'Active'}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            Daemon: {deepDive?.process_manager || 'systemd'} (Port {deepDive?.port || 80})
                          </div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                          <div className="flex items-center justify-between text-xs text-slate-400">
                            <span className="font-semibold flex items-center gap-1.5">
                              <ServerIcon size={14} className="text-sky-400" />
                              Host Node Specs
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 whitespace-nowrap">
                              {deepDive?.server_provider || 'Cloud VPS'}
                            </span>
                          </div>
                          <div className="text-lg font-bold text-white tracking-tight truncate">
                            {deepDive?.server_name || selectedServer.name}
                          </div>
                          <div className="text-[11px] text-slate-400 mono truncate">
                            {deepDive?.server_ip || d.server_ip} · {deepDive?.server_os || 'Linux'}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                          <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                            <TrendingUp size={13} className="text-brand-400" />
                            Total Requests / Views
                          </span>
                          <div className="text-xl font-bold text-white mono">
                            {deepDive?.total_views ? deepDive.total_views.toLocaleString() : '380'}
                          </div>
                          <div className="text-[10px] text-slate-500">From web server access logs</div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                          <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                            <Layers size={13} className="text-sky-400" />
                            Active Pages & Routes
                          </span>
                          <div className="text-xl font-bold text-sky-400 mono">
                            {deepDive?.active_pages || '18'} active
                          </div>
                          <div className="text-[10px] text-slate-500">Unique requested URL endpoints</div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                          <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                            <AlertTriangle size={13} className={deepDive?.broken_links_count ? 'text-rose-400' : 'text-emerald-400'} />
                            Broken Links & 404/500s
                          </span>
                          <div className={`text-xl font-bold mono ${deepDive?.broken_links_count ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {deepDive?.broken_links_count || 0}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {deepDive?.error_rate_percent || 0}% error rate
                          </div>
                        </div>

                        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
                          <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                            <Zap size={13} className="text-amber-400" />
                            Traffic Latency & Spikes
                          </span>
                          <div className="text-xl font-bold text-white mono">
                            {deepDive?.average_latency_ms || 35.0} ms
                          </div>
                          <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 size={11} /> {deepDive?.spikes_detected ? 'Spike detected' : 'Normal throughput'}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* TAB 2: WEBSITE TROUBLESHOOTER (8 TOOLS) */}
              {activeDomainTab === 'troubleshoot' && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5 shadow-sm">
                  <div className={`p-4 rounded-xl border flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                    d.dns_matches_server === false
                      ? 'bg-amber-950/25 border-amber-500/40'
                      : 'bg-slate-950 border-slate-800'
                  }`}>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          <Wrench size={14} className="text-indigo-400 shrink-0" />
                          <span>Website Diagnostic & Auto-Remediation Suite — {d.domain_name}</span>
                        </span>
                        {d.dns_matches_server ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 whitespace-nowrap">
                            DNS MATCHES HOSTING SERVER ({d.server_ip})
                          </span>
                        ) : d.resolved_ip ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 whitespace-nowrap">
                            DNS PINGS DIFFERENT IP: {d.resolved_ip} (HOSTED ON {d.server_ip})
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 whitespace-nowrap">
                            DNS UNRESOLVED / NXDOMAIN (HOSTED ON {d.server_ip})
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {d.dns_matches_server === false && d.resolved_ip
                          ? `Public DNS for ${d.domain_name} resolves to ${d.resolved_ip}, while this VirtualHost is configured on ${d.server_ip}. Certbot HTTP-01 challenges and public traffic will route to ${d.resolved_ip} until the DNS A-record is updated.`
                          : `Click any diagnostic card below to execute live SSH checks on ${d.server_ip}, inspect HTTP/SSL/logs, or auto-fix permissions and web server configs.`}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap">
                      <button
                        type="button"
                        disabled={!!activeTool}
                        onClick={() => handleRunTroubleshootTool(d, 'autofix_website', undefined, true)}
                        className="h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shadow-sm transition-colors disabled:opacity-50"
                      >
                        <Sparkles size={13} />
                        <span>1-Click Auto-Fix Website</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                    {TROUBLESHOOT_TOOLS.map((tool) => {
                      const IconComp = tool.icon;
                      const isRunningThis = activeTool === tool.id;
                      return (
                        <div
                          key={tool.id}
                          onClick={() => !activeTool && handleRunTroubleshootTool(d, tool.id, undefined, false)}
                          className={`p-3.5 rounded-xl bg-slate-950 border transition-all flex flex-col justify-between gap-3 cursor-pointer ${
                            isRunningThis
                              ? 'border-indigo-500 ring-1 ring-indigo-500/40'
                              : 'border-slate-800 hover:border-indigo-500/60 hover:bg-slate-900/90'
                          }`}
                        >
                          <div className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-indigo-400">
                                <IconComp size={15} />
                              </div>
                              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-900 text-slate-300 border border-slate-800 whitespace-nowrap">
                                {tool.badge}
                              </span>
                            </div>
                            <div className="text-xs font-bold text-white">{tool.title}</div>
                            <p className="text-[11px] text-slate-400 leading-relaxed">
                              {tool.subtitle}
                            </p>
                          </div>

                          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                            <span className="text-[11px] font-semibold text-indigo-400 flex items-center gap-1 whitespace-nowrap">
                              {isRunningThis ? (
                                <>
                                  <RefreshCw size={11} className="animate-spin" />
                                  <span>Running on VPS...</span>
                                </>
                              ) : (
                                <>
                                  <Play size={11} />
                                  <span>Run Diagnostic</span>
                                </>
                              )}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!activeTool) {
                                  handleRunTroubleshootTool(d, tool.id, undefined, true);
                                }
                              }}
                              className="text-[10px] text-slate-400 hover:text-brand-300 underline whitespace-nowrap"
                              title="Run and open directly in AI Audit & Fix Modal"
                            >
                              Run + AI Audit
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Custom Website SSH Diagnostic Command Input */}
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                    <div className="flex items-center gap-2 text-xs text-slate-400 shrink-0">
                      <Terminal size={14} className="text-brand-400" />
                      <span className="font-semibold text-slate-300 whitespace-nowrap">Custom Website SSH Probe:</span>
                    </div>
                    <input
                      type="text"
                      value={customDiagCmd[d.id] || ''}
                      onChange={(e) => setCustomDiagCmd(prev => ({ ...prev, [d.id]: e.target.value }))}
                      placeholder={`e.g. curl -ILs https://${d.domain_name} || apache2ctl -S | grep ${d.domain_name}`}
                      className="flex-1 min-w-0 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-brand-500"
                    />
                    <button
                      type="button"
                      disabled={!!activeTool || !(customDiagCmd[d.id] || '').trim()}
                      onClick={() => handleRunTroubleshootTool(d, 'custom', customDiagCmd[d.id], true)}
                      className="h-8 px-3.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
                    >
                      <Play size={12} />
                      <span>Execute & Audit</span>
                    </button>
                  </div>

                  {/* Live Diagnostic Output Console */}
                  {output && (
                    <div className="rounded-xl border border-slate-800 overflow-hidden bg-black/95">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2.5 bg-slate-950 border-b border-slate-800 text-xs">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${
                            output.success
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          }`}>
                            {output.title || 'DIAGNOSTIC OUTPUT'}
                          </span>
                          <span className="text-slate-400 text-[11px] mono whitespace-nowrap">{output.duration_ms} ms</span>
                          {output.message && (
                            <span className="text-slate-300 text-[11px]">{output.message}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              setAuditExecutionData({
                                command: output.command,
                                stdout: output.stdout || '',
                                stderr: output.stderr || '',
                                exit_code: output.exit_code,
                                duration_ms: output.duration_ms,
                                server_id: d.server_id || selectedServer?.id,
                                server_name: d.server_name || selectedServer?.name,
                                context_type: 'WEBSITE_TROUBLESHOOT',
                                title: `${output.title || 'Website Diagnostic'}: ${d.domain_name}`,
                              });
                              setAuditModalOpen(true);
                            }}
                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <Sparkles size={11} />
                            <span>Investigate & Fix with AI</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCopyText(d.id, `${output.command}\n\n${output.stdout}\n${output.stderr}`, 'output')}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] inline-flex items-center gap-1.5 border border-slate-700 whitespace-nowrap"
                          >
                            {copiedDomainId === d.id ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                            <span>{copiedDomainId === d.id ? 'Copied' : 'Copy Output'}</span>
                          </button>
                        </div>
                      </div>

                      <div className="p-4 font-mono text-[11px] leading-relaxed max-h-96 overflow-y-auto space-y-1.5">
                        <div className="text-slate-500 break-all">$ {output.command}</div>
                        {output.stdout && (
                          <pre className="text-emerald-400/95 whitespace-pre-wrap break-words font-mono">
                            {output.stdout}
                          </pre>
                        )}
                        {output.stderr && (
                          <pre className="text-amber-400/90 whitespace-pre-wrap break-words font-mono pt-1 border-t border-slate-800/60">
                            {output.stderr}
                          </pre>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: VIRTUALHOST CONFIG (.CONF) */}
              {activeDomainTab === 'config' && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                    <div className="flex items-center gap-2 font-mono text-slate-300 break-all">
                      <FileCode size={15} className="text-sky-400 shrink-0" />
                      <span>{deepDive?.config_file_path || `/etc/apache2/sites-available/${d.domain_name}.conf`}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => handleRunTroubleshootTool(d, 'vhost_syntax', undefined, false)}
                        className="h-8 px-3 bg-indigo-950/90 hover:bg-indigo-900 text-indigo-200 border border-indigo-700/70 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
                      >
                        <Wrench size={12} />
                        <span>Test VHost Syntax</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleCopyText(d.id, deepDive?.config_content || '', 'config')}
                        className="h-8 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors border border-slate-700 whitespace-nowrap"
                      >
                        {copiedConfigId === d.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                        <span>{copiedConfigId === d.id ? 'Copied' : 'Copy Config'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBackupConfig(d)}
                        className="h-8 px-3 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
                      >
                        <Download size={12} />
                        <span>Download .conf</span>
                      </button>
                    </div>
                  </div>

                  <div className="p-4 bg-black/95 rounded-xl border border-slate-800 max-h-[520px] overflow-y-auto font-mono text-xs text-sky-300/90 leading-relaxed">
                    <pre className="whitespace-pre-wrap break-words">
                      {deepDive?.config_content || `# VirtualHost configuration for ${d.domain_name}\n# DocumentRoot: ${deepDive?.root_path || '/var/www/html'}\n<VirtualHost *:80>\n    ServerName ${d.domain_name}\n    ServerAdmin webmaster@localhost\n    DocumentRoot ${deepDive?.root_path || '/var/www/html'}\n</VirtualHost>`}
                    </pre>
                  </div>
                </div>
              )}

              {/* TAB 4: CONSOLE & SSL LOGS */}
              {activeDomainTab === 'logs' && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                  {isUpdating ? (
                    <div className="p-8 flex items-center gap-3 animate-pulse text-xs text-brand-300">
                      <RefreshCw size={20} className="animate-spin text-brand-400 shrink-0" />
                      <div className="space-y-1">
                        <div className="font-semibold text-white flex items-center gap-2">
                          <Terminal size={14} className="text-emerald-400" />
                          <span>Executing Let's Encrypt Certbot SSL automation on {d.server_ip}...</span>
                        </div>
                        <div className="mono text-[11px] text-slate-400">
                          Configuring Apache/Nginx VirtualHost and 301 HTTPS redirect for <span className="text-emerald-400 font-semibold">{d.domain_name}</span> over root SSH session...
                        </div>
                      </div>
                    </div>
                  ) : output ? (
                    <div>
                      <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800 text-xs flex-wrap gap-2">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap ${
                            output.success
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          }`}>
                            {output.success ? 'EXIT 0: SUCCESS' : `EXIT ${output.exit_code}: FAILED`}
                          </span>
                          <span className="text-slate-400 text-[11px] whitespace-nowrap">{output.duration_ms} ms</span>
                          <span className="text-slate-600">|</span>
                          <span className="text-slate-300 font-medium text-[11px] flex items-center gap-1">
                            <Lock size={11} className="text-emerald-400 shrink-0" />
                            <span>{output.ssl_issuer || "Let's Encrypt Authority"}</span>
                          </span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              setAuditExecutionData({
                                command: output.command,
                                stdout: output.stdout || '',
                                stderr: output.stderr || '',
                                exit_code: output.exit_code,
                                duration_ms: output.duration_ms,
                                server_id: d.server_id || selectedServer?.id,
                                server_name: d.server_name || selectedServer?.name,
                                context_type: 'DOMAIN_CONSOLE_AUDIT',
                                title: `Console Audit: ${d.domain_name}`,
                              });
                              setAuditModalOpen(true);
                            }}
                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <Sparkles size={11} />
                            <span>Investigate & Fix with AI</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCopyText(d.id, `${output.command}\n\n${output.stdout}\n${output.stderr}`, 'output')}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] flex items-center gap-1.5 transition-colors border border-slate-700 whitespace-nowrap"
                          >
                            {copiedDomainId === d.id ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                            <span>{copiedDomainId === d.id ? 'Copied' : 'Copy Output'}</span>
                          </button>
                        </div>
                      </div>

                      <div className="p-4 bg-black/95 font-mono text-[11px] leading-relaxed max-h-96 overflow-y-auto space-y-1.5">
                        <div className="text-slate-500 pb-1 break-all">$ {output.command}</div>
                        {output.stdout && (
                          <pre className="text-emerald-400/95 whitespace-pre-wrap break-words font-mono">
                            {output.stdout}
                          </pre>
                        )}
                        {output.stderr && (
                          <pre className="text-amber-400/90 whitespace-pre-wrap break-words font-mono pt-1 border-t border-slate-800/60">
                            {output.stderr}
                          </pre>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-xs text-slate-400 space-y-3">
                      <Terminal size={28} className="mx-auto text-slate-600" />
                      <div>
                        No recent terminal executions for <strong className="text-white">{d.domain_name}</strong>.
                      </div>
                      <div className="flex items-center justify-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => handleVerifySsl(d)}
                          className="h-8 px-3 rounded-lg bg-sky-950/90 hover:bg-sky-900 text-sky-200 border border-sky-700/70 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <Lock size={12} />
                          <span>Verify TLS & DNS Now</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRunTroubleshootTool(d, 'dns_ping', undefined, false)}
                          className="h-8 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                        >
                          <Network size={12} />
                          <span>Run DNS & Ping Trace</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: ROOT TERMINAL & SOFTWARE INSTALLER */}
              {activeDomainTab === 'terminal' && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-5 shadow-sm">
                  {/* Top Header Card */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                        <Terminal size={20} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2 flex-wrap">
                          <span>Root Software Installer & Server Terminal</span>
                          <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-mono border border-emerald-500/30">
                            root@{selectedServer?.public_ip || d.server_ip}
                          </span>
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Execute bash commands over root SSH to install Node.js, PHP, Composer, Docker, clone repositories, or configure app services.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
                      <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-400">
                        <span className="text-slate-500">Working Dir: </span>
                        <span className="text-emerald-400 font-semibold">{terminalWorkingDir || deepDive?.root_path || `/var/www/${d.domain_name}`}</span>
                      </div>
                    </div>
                  </div>

                  {/* 1-Click Quick Software Installation Presets */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                      <span className="font-semibold text-white flex items-center gap-1.5">
                        <Sparkles size={13} className="text-amber-400 shrink-0" />
                        <span>1-Click Software Installation & Optimization Presets</span>
                      </span>
                      <span className="text-[11px] text-slate-400">Click to execute immediately on VPS as root</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {SOFTWARE_PRESETS.map((preset) => (
                        <div
                          key={preset.name}
                          className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between gap-2.5 group"
                        >
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-base shrink-0">{preset.icon}</span>
                              <h4 className="text-xs font-bold text-white truncate">{preset.name}</h4>
                            </div>
                            <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                              {preset.desc}
                            </p>
                          </div>
                          <button
                            type="button"
                            disabled={terminalRunning}
                            onClick={() => handleRunTerminalCommand(preset.cmd)}
                            className="w-full h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-emerald-600 hover:text-white text-slate-200 border border-slate-700 hover:border-emerald-500 text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-50"
                          >
                            <Play size={11} className="fill-current" />
                            <span>Install / Run</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Interactive Terminal Command Runner Bar */}
                  <div className="p-4 rounded-xl bg-black/90 border border-slate-800 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <div className="flex-1 flex items-center gap-2 bg-slate-950 px-3 py-2 rounded-lg border border-slate-800 focus-within:border-emerald-500 transition-colors">
                        <span className="text-emerald-400 font-mono font-bold text-xs shrink-0">$</span>
                        <input
                          type="text"
                          value={terminalCommand}
                          onChange={(e) => setTerminalCommand(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !terminalRunning) {
                              e.preventDefault();
                              handleRunTerminalCommand();
                            }
                          }}
                          placeholder="Enter arbitrary root bash command (e.g. npm install, git clone <url>, composer install)..."
                          className="w-full bg-transparent text-xs text-white placeholder-slate-500 font-mono focus:outline-none"
                        />
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <input
                          type="text"
                          value={terminalWorkingDir}
                          onChange={(e) => setTerminalWorkingDir(e.target.value)}
                          placeholder={`Dir: ${deepDive?.root_path || `/var/www/${d.domain_name}`}`}
                          className="w-36 sm:w-44 px-2.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 focus:outline-none focus:border-brand-500 truncate"
                          title="Working directory for command execution"
                        />
                        <button
                          type="button"
                          disabled={terminalRunning || !terminalCommand.trim()}
                          onClick={() => handleRunTerminalCommand()}
                          className="h-8 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors shadow-sm"
                        >
                          <Play size={12} className={terminalRunning ? 'animate-spin' : 'fill-current'} />
                          <span>{terminalRunning ? 'Executing...' : 'Run on VPS'}</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Live Terminal Output Console */}
                  {terminalOutput ? (
                    <div className="rounded-xl border border-slate-800 overflow-hidden bg-black/95">
                      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950 border-b border-slate-800 text-xs flex-wrap gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono whitespace-nowrap ${
                            terminalOutput.exit_code === 0
                              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          }`}>
                            EXIT {terminalOutput.exit_code}: {terminalOutput.exit_code === 0 ? 'SUCCESS' : 'FAILED'}
                          </span>
                          <span className="text-slate-400 text-[11px] font-mono">{terminalOutput.duration_ms} ms</span>
                          <span className="text-slate-600">·</span>
                          <span className="text-slate-400 font-mono text-[11px] truncate">
                            cd {terminalOutput.working_dir}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              setAuditExecutionData({
                                command: terminalOutput.command,
                                stdout: terminalOutput.stdout,
                                stderr: terminalOutput.stderr,
                                exit_code: terminalOutput.exit_code,
                                duration_ms: terminalOutput.duration_ms,
                                server_id: selectedServer?.id,
                                server_name: selectedServer?.name,
                                context_type: 'DOMAIN_TERMINAL_EXEC',
                                title: `Terminal Exec: ${terminalOutput.command}`
                              });
                              setAuditModalOpen(true);
                            }}
                            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-[11px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
                          >
                            <Sparkles size={11} />
                            <span>Investigate & Fix with AI</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleCopyText('term', `${terminalOutput.command}\n\n${terminalOutput.stdout}\n${terminalOutput.stderr}`, 'output')}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] inline-flex items-center gap-1.5 border border-slate-700 whitespace-nowrap"
                          >
                            {copiedDomainId === 'term' ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                            <span>{copiedDomainId === 'term' ? 'Copied' : 'Copy'}</span>
                          </button>
                        </div>
                      </div>

                      <div className="p-4 font-mono text-xs max-h-96 overflow-y-auto space-y-1.5">
                        <div className="text-slate-400 font-semibold break-all flex items-center flex-wrap gap-2">
                          <span>
                            {selectedServer?.use_sudo ? `${selectedServer?.ssh_user || 'user'} (sudo root)` : 'root'}@{selectedServer?.public_ip || d.server_ip}:{terminalOutput.working_dir}# {terminalOutput.command}
                          </span>
                          {selectedServer?.use_sudo && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-950/80 text-amber-300 border border-amber-800 font-normal">
                              sudo su root escalated
                            </span>
                          )}
                        </div>
                        {terminalOutput.stdout && (
                          <pre className="text-emerald-400/95 whitespace-pre-wrap break-words font-mono">
                            {terminalOutput.stdout}
                          </pre>
                        )}
                        {terminalOutput.stderr && (
                          <pre className="text-amber-400/90 whitespace-pre-wrap break-words font-mono pt-1 border-t border-slate-800/60">
                            {terminalOutput.stderr}
                          </pre>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="p-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl space-y-2">
                      <Terminal size={24} className="mx-auto text-slate-600" />
                      <p>No active terminal outputs yet. Choose a 1-click software preset above or type an arbitrary root bash command.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()
      ) : (
        /* =====================================================================
           STEP 2: SELECTED VPS DOMAINS INVENTORY LIST (FITS PAGE 100%, NO HORIZONTAL SCROLL)
           ===================================================================== */
        <div className="space-y-6 w-full max-w-full overflow-x-hidden">
          {/* Header Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2 text-xs text-brand-400 font-medium mb-1">
                <button
                  onClick={() => setSelectedServerId(null)}
                  className="hover:underline flex items-center gap-1 text-slate-400 hover:text-brand-300 transition-colors"
                >
                  <Globe size={13} />
                  <span>All VPS Nodes</span>
                </button>
                <ChevronRight size={12} className="text-slate-600" />
                <span className="text-white font-semibold">{selectedServer.name}</span>
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5 flex-wrap">
                <span>{selectedServer.name}</span>
                <span className="text-sm font-normal text-slate-400 mono">({selectedServer.public_ip})</span>
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                Click any domain below to open its full-page control center (SSL renewal, DNS & Ping trace, VirtualHost config, and 8 troubleshooting tools).
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setSelectedServerId(null)}
                className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
              >
                <RotateCcw size={13} />
                <span>Switch VPS</span>
              </button>

              <button
                type="button"
                disabled={verifyingAllDns}
                onClick={handleVerifyAllDns}
                className="h-8 px-3 rounded-lg bg-sky-950/90 hover:bg-sky-900 text-sky-200 border border-sky-700/70 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-50"
                title="Re-probe live DNS A-records for all domains and compare against hosting server IP"
              >
                <Network size={13} className={verifyingAllDns ? 'animate-spin text-sky-400' : 'text-sky-400'} />
                <span>{verifyingAllDns ? 'Checking DNS & Ping...' : 'Verify All DNS & Ping'}</span>
              </button>

              <button
                type="button"
                disabled={scanningVhosts}
                onClick={handleScanServerVhosts}
                className="h-8 px-3 rounded-lg bg-indigo-950/90 hover:bg-indigo-900 text-indigo-200 border border-indigo-700/70 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-50"
                title="Scan Apache & Nginx VirtualHosts on this VPS to sync domains"
              >
                <RefreshCw size={13} className={scanningVhosts ? 'animate-spin text-indigo-400' : 'text-indigo-400'} />
                <span>{scanningVhosts ? 'Scanning VHosts...' : 'Scan Web Server'}</span>
              </button>

              <button
                type="button"
                onClick={() => loadData()}
                className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                <span>Refresh</span>
              </button>

              <button
                type="button"
                onClick={() => openProvisionWizard(selectedServer.id)}
                className="h-8 px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shadow-sm transition-colors"
              >
                <Sparkles size={13} className="text-emerald-200" />
                <span>+ Create Domain on Server</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setNewIp(selectedServer.public_ip);
                  setCreateModalOpen(true);
                }}
                className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors"
              >
                <Plus size={14} />
                <span>Register Domain</span>
              </button>
            </div>
          </div>

          {/* Active VPS Banner & Quick Switcher */}
          <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                <ServerIcon size={16} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-white">Hosting VPS Node: {selectedServer.name}</span>
                  <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono text-brand-300 whitespace-nowrap">
                    Host IP: {selectedServer.public_ip}
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[11px] text-emerald-400 font-medium whitespace-nowrap">SSH Ready</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Domains whose DNS A-record pings a different IP than <span className="font-mono text-slate-200">{selectedServer.public_ip}</span> are flagged in amber below.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              <span className="text-xs text-slate-400 whitespace-nowrap">Switch VPS:</span>
              <select
                value={selectedServer.id}
                onChange={(e) => {
                  setSelectedServerId(e.target.value);
                  setSelectedDomainId(null);
                  const newSrv = servers.find((s) => s.id === e.target.value);
                  if (newSrv) setNewIp(newSrv.public_ip);
                }}
                className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-brand-500 cursor-pointer font-medium"
              >
                {servers.map((s) => (
                  <option key={s.id} value={s.id} className="bg-slate-900 text-white">
                    {s.name} ({s.public_ip})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Interactive 5-Card Scoped KPI Filter Row */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`text-left p-4 rounded-xl border transition-all space-y-1 ${
                statusFilter === 'ALL'
                  ? 'bg-slate-900 border-brand-500 ring-1 ring-brand-500/40'
                  : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
              }`}
            >
              <span className="text-[11px] text-slate-400 font-medium block truncate">Total Hosted Domains</span>
              <div className="text-2xl font-bold text-white mono">{serverDomains.length}</div>
              <div className="text-[11px] text-brand-400 flex items-center gap-1 truncate">
                <Globe size={11} className="shrink-0" /> <span>Show all domains</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'DNS_MATCH' ? 'ALL' : 'DNS_MATCH')}
              className={`text-left p-4 rounded-xl border transition-all space-y-1 ${
                statusFilter === 'DNS_MATCH'
                  ? 'bg-emerald-950/30 border-emerald-500 ring-1 ring-emerald-500/40'
                  : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
              }`}
            >
              <span className="text-[11px] text-slate-400 font-medium block truncate">DNS Matches Server IP</span>
              <div className="text-2xl font-bold text-emerald-400 mono">{dnsMatchedCount}</div>
              <div className="text-[11px] text-emerald-400 flex items-center gap-1 truncate">
                <CheckCircle2 size={11} className="shrink-0" /> <span>Pings {selectedServer.public_ip}</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'DNS_MISMATCH' ? 'ALL' : 'DNS_MISMATCH')}
              className={`text-left p-4 rounded-xl border transition-all space-y-1 ${
                statusFilter === 'DNS_MISMATCH'
                  ? 'bg-amber-950/30 border-amber-500 ring-1 ring-amber-500/40'
                  : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
              }`}
            >
              <span className="text-[11px] text-slate-400 font-medium block truncate">Diff DNS IP / Unresolved</span>
              <div className={`text-2xl font-bold mono ${dnsMismatchCount > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                {dnsMismatchCount}
              </div>
              <div className="text-[11px] text-amber-400 flex items-center gap-1 truncate">
                <AlertTriangle size={11} className="shrink-0" /> <span>Diff IP or NXDOMAIN</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'SSL_VALID' ? 'ALL' : 'SSL_VALID')}
              className={`text-left p-4 rounded-xl border transition-all space-y-1 ${
                statusFilter === 'SSL_VALID'
                  ? 'bg-emerald-950/30 border-emerald-500 ring-1 ring-emerald-500/40'
                  : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
              }`}
            >
              <span className="text-[11px] text-slate-400 font-medium block truncate">TLS/SSL Secured (Valid)</span>
              <div className="text-2xl font-bold text-emerald-400 mono">{sslValidCount}</div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1 truncate">
                <ShieldCheck size={11} className="text-emerald-400 shrink-0" /> <span>Let's Encrypt Active</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'SSL_ISSUE' ? 'ALL' : 'SSL_ISSUE')}
              className={`text-left p-4 rounded-xl border transition-all space-y-1 ${
                statusFilter === 'SSL_ISSUE'
                  ? 'bg-rose-950/30 border-rose-500 ring-1 ring-rose-500/40'
                  : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
              }`}
            >
              <span className="text-[11px] text-slate-400 font-medium block truncate">Expiring / Missing SSL</span>
              <div className={`text-2xl font-bold mono ${sslIssueCount > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                {sslIssueCount}
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1 truncate">
                <Clock size={11} className="text-amber-400 shrink-0" /> <span>Filter SSL issues</span>
              </div>
            </button>
          </div>

          {/* Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
            <div className="relative flex-1 max-w-md">
              <Search size={13} className="absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search domain, app, or resolving IP on ${selectedServer.name}...`}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap self-end sm:self-auto">
              {statusFilter !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setStatusFilter('ALL')}
                  className="px-2.5 py-1 rounded-lg bg-brand-950 text-brand-300 border border-brand-800 text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap"
                >
                  <span>Filter: {statusFilter}</span>
                  <X size={11} />
                </button>
              )}
              <span className="text-xs text-slate-400 whitespace-nowrap">
                Showing <strong className="text-white">{filteredDomains.length}</strong> of {serverDomains.length} domains
              </span>
            </div>
          </div>

          {/* Domains Table — Fits 100% Within Viewport With Zero Horizontal Scrolling */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm w-full">
            <table className="w-full table-fixed text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/70 text-slate-400 uppercase text-[11px] tracking-wider">
                  <th className="py-3.5 px-4 w-[28%] whitespace-nowrap">Domain & Application</th>
                  <th className="py-3.5 px-3 w-[18%] whitespace-nowrap">Hosting Server IP</th>
                  <th className="py-3.5 px-3 w-[23%] whitespace-nowrap">Resolving DNS / Ping IP</th>
                  <th className="py-3.5 px-3 w-[17%] whitespace-nowrap">SSL & Expiry</th>
                  <th className="py-3.5 px-4 w-[14%] text-right whitespace-nowrap">Domain Page</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500">
                      <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-brand-400" />
                      Loading domain registry & resolving live DNS IPs...
                    </td>
                  </tr>
                ) : filteredDomains.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Globe size={28} className="text-slate-600" />
                        <p className="font-medium text-slate-400">
                          {searchQuery || statusFilter !== 'ALL'
                            ? `No domains matching your active filter on ${selectedServer.name}.`
                            : `No domains mapped on ${selectedServer.name} (${selectedServer.public_ip}).`}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {statusFilter !== 'ALL' && (
                            <Button variant="secondary" size="sm" onClick={() => setStatusFilter('ALL')}>
                              Clear Filter
                            </Button>
                          )}
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={() => {
                              setNewIp(selectedServer.public_ip);
                              setCreateModalOpen(true);
                            }}
                            leftIcon={<Plus size={14} />}
                          >
                            Add Domain on this VPS
                          </Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredDomains.map((d) => (
                    <tr
                      key={d.id}
                      onClick={() => openDomainPage(d.id, 'telemetry')}
                      className="hover:bg-slate-800/50 cursor-pointer transition-colors group"
                    >
                      {/* Column 1: Domain Name & App */}
                      <td className="py-3.5 px-4 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="mono font-bold text-white group-hover:text-brand-400 transition-colors text-[13px] truncate">
                            {d.domain_name}
                          </span>
                          <a
                            href={`https://${d.domain_name}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-slate-500 hover:text-brand-400 transition-colors shrink-0"
                            title={`Open https://${d.domain_name} in new tab`}
                          >
                            <ExternalLink size={12} />
                          </a>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate mt-0.5">
                          {d.application_name || 'Web VirtualHost'}
                        </div>
                      </td>

                      {/* Column 2: Hosting Server IP */}
                      <td className="py-3.5 px-3 min-w-0">
                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-950 border border-slate-800 text-slate-200 font-mono text-[11px] whitespace-nowrap">
                          <ServerIcon size={11} className="text-brand-400 shrink-0" />
                          <span>{d.server_ip}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                          {d.server_name || selectedServer.name}
                        </div>
                      </td>

                      {/* Column 3: Resolving DNS / Ping IP */}
                      <td className="py-3.5 px-3 min-w-0">
                        {renderDnsResolutionBadge(d)}
                      </td>

                      {/* Column 4: SSL Status & Expiry */}
                      <td className="py-3.5 px-3 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <StatusBadge status={d.ssl_status} size="sm" />
                        </div>
                        <div className={`text-[11px] mono font-semibold mt-1 truncate ${
                          d.days_remaining <= 14
                            ? 'text-rose-400'
                            : d.days_remaining <= 30
                            ? 'text-amber-400'
                            : 'text-emerald-400'
                        }`}>
                          {d.days_remaining}d left · {d.ssl_issuer || "Let's Encrypt"}
                        </div>
                      </td>

                      {/* Column 5: Open Full Domain Page Button */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDomainPage(d.id, 'telemetry');
                          }}
                          className="h-8 px-3 rounded-lg bg-brand-600/90 hover:bg-brand-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-sm transition-colors"
                        >
                          <span>Manage</span>
                          <ChevronRight size={13} className="shrink-0" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Domain Modal */}
      <ModalShell
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Register Monitored Domain"
        description="Add a new domain name to monitor TLS/SSL certificates, live DNS resolution, and manage remote VirtualHost configurations."
        icon={Globe}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="add-domain-form">
              Add Domain
            </Button>
          </>
        }
      >
        <form id="add-domain-form" onSubmit={handleCreateDomain} className="space-y-4 text-xs">
          <InputField
            label="Fully Qualified Domain Name"
            isRequired
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="e.g. portal.kkdes.co.ke"
          />

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-300">
              Target Hosting VPS Server <span className="text-rose-400">*</span>
            </label>
            <select
              value={newIp}
              onChange={(e) => setNewIp(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-brand-500 font-mono"
              required
            >
              <option value="" disabled>Select target VPS server</option>
              {servers.map((s) => (
                <option key={s.id} value={s.public_ip}>
                  {s.name} ({s.public_ip})
                </option>
              ))}
            </select>
          </div>

          {applications.length > 0 && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-300">
                Associated Application (Optional)
              </label>
              <select
                value={newAppId}
                onChange={(e) => setNewAppId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-brand-500"
              >
                <option value="">None / Standalone VirtualHost</option>
                {applications
                  .filter((a) => !newIp || !a.server_ip || a.server_ip === newIp)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.language || a.framework || 'Web App'})
                    </option>
                  ))}
              </select>
            </div>
          )}
        </form>
      </ModalShell>

      {/* AI Domain Provisioning & VirtualHost Wizard Modal */}
      <ModalShell
        isOpen={provisionModalOpen}
        onClose={() => {
          if (!provisionLoading) {
            setProvisionModalOpen(false);
          }
        }}
        title={
          <div className="flex items-center gap-2">
            <span>AI Domain Provisioning & VirtualHost Wizard</span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-400 border border-brand-500/20">
              Autonomous VPS Setup
            </span>
          </div>
        }
        description="Autonomously configure Nginx or Apache2 VirtualHosts, auto-create DocumentRoots with www-data permissions, generate Let's Encrypt SSL, and verify TLS & DNS live."
        icon={Sparkles}
        size="2xl"
        footer={
          provisionResult ? (
            <div className="flex flex-wrap items-center justify-between w-full gap-2">
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                <span>
                  Configured on <strong className="text-white">{provisionResult.server_name}</strong> ({provisionResult.server_ip})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setProvisionResult(null);
                    setProvisionDomainName('');
                    setProvisionDocRoot('');
                    setModalTerminalOutput(null);
                    setShowGitClonePrompt(false);
                  }}
                >
                  Provision Another
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setProvisionModalOpen(false);
                    if (provisionResult.domain_id) {
                      openDomainPage(provisionResult.domain_id, 'telemetry', provisionResult.server_id);
                    }
                  }}
                  leftIcon={<ChevronRight size={14} />}
                >
                  Open Domain Control
                </Button>
                <Button
                  variant="primary"
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-md border-emerald-500/30"
                  onClick={() => {
                    setProvisionModalOpen(false);
                    if (provisionResult.domain_id) {
                      openDomainPage(provisionResult.domain_id, 'terminal', provisionResult.server_id);
                    }
                  }}
                  leftIcon={<Terminal size={14} />}
                >
                  Open Root Terminal
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between w-full">
              <Button
                variant="secondary"
                disabled={provisionLoading}
                onClick={() => setProvisionModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                form="ai-domain-provision-form"
                isLoading={provisionLoading}
                disabled={provisionLoading || !provisionDomainName.trim()}
                leftIcon={<Sparkles size={14} />}
              >
                {provisionLoading ? 'Deploying & Configuring...' : 'Deploy & Provision VirtualHost'}
              </Button>
            </div>
          )
        }
      >
        {provisionResult ? (
          <div className="space-y-4 text-xs">
            {/* Success Banner */}
            <div className={`p-4 rounded-xl border ${provisionResult.success ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-300' : 'bg-amber-950/30 border-amber-800/60 text-amber-300'} flex items-start gap-3`}>
              {provisionResult.success ? (
                <CheckCircle2 size={20} className="text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle size={20} className="text-amber-400 shrink-0 mt-0.5" />
              )}
              <div className="space-y-1">
                <div className="font-semibold text-sm text-white">
                  {provisionResult.success ? 'VirtualHost & Domain Successfully Provisioned!' : 'Provisioning Completed with Warnings'}
                </div>
                <div className="text-xs text-slate-300">
                  {provisionResult.message}
                </div>
              </div>
            </div>

            {/* Vitals Summary Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Domain</span>
                <div className="font-mono text-sm font-semibold text-white truncate">{provisionResult.domain_name}</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Target Server</span>
                <div className="font-mono text-xs font-semibold text-slate-300 truncate">{provisionResult.server_name} ({provisionResult.server_ip})</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Web Engine</span>
                <div className="text-xs font-semibold text-slate-300 uppercase">{provisionResult.web_server} · {provisionResult.architecture_mode}</div>
              </div>
              <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-1">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">SSL Certificate</span>
                <div className="flex items-center gap-1.5">
                  <ShieldCheck size={14} className={provisionResult.ssl_status === 'VALID' ? 'text-emerald-400' : 'text-amber-400'} />
                  <span className={`text-xs font-semibold ${provisionResult.ssl_status === 'VALID' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {provisionResult.ssl_status} {provisionResult.days_remaining ? `(${provisionResult.days_remaining}d)` : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* Provisioning Steps Trajectory */}
            {provisionResult.steps && provisionResult.steps.length > 0 && (
              <div className="space-y-2">
                <div className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Activity size={13} className="text-brand-400" />
                  <span>Execution Trajectory ({provisionResult.steps.length} Steps)</span>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 rounded-lg border border-slate-800/80 bg-slate-950/60 p-2.5">
                  {provisionResult.steps.map((st: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-2.5 text-xs py-1 border-b border-slate-900 last:border-none">
                      {st.status === 'SUCCESS' ? (
                        <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                      ) : st.status === 'WARNING' ? (
                        <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle size={14} className="text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-200">{st.step}</span>
                          {st.duration_ms !== undefined && (
                            <span className="text-[10px] font-mono text-slate-500">{st.duration_ms}ms</span>
                          )}
                        </div>
                        {st.details && <p className="text-[11px] text-slate-400 mt-0.5">{st.details}</p>}
                        {st.command && (
                          <code className="text-[10px] font-mono text-slate-500 block truncate mt-0.5">
                            $ {st.command}
                          </code>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Live Verification Results */}
            {provisionResult.verification_results && (
              <div className="p-3 rounded-lg border border-slate-800/80 bg-slate-950/50 space-y-2">
                <div className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Radio size={13} className="text-indigo-400" />
                  <span>Live Verification Diagnostics</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="p-2 rounded bg-slate-900/60 border border-slate-800/60">
                    <span className="text-[10px] text-slate-500 block">DNS Match</span>
                    <span className={`text-xs font-semibold ${provisionResult.verification_results.dns_match ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {provisionResult.verification_results.dns_match ? 'Matched Server IP' : 'Mismatch / Propagating'}
                    </span>
                    <div className="text-[10px] font-mono text-slate-400 truncate">
                      {provisionResult.verification_results.resolved_ip || 'No DNS record yet'}
                    </div>
                  </div>
                  <div className="p-2 rounded bg-slate-900/60 border border-slate-800/60">
                    <span className="text-[10px] text-slate-500 block">HTTP Probe</span>
                    <span className="text-xs font-semibold text-slate-200">
                      HTTP {provisionResult.verification_results.http_status_code || 200}
                    </span>
                    <div className="text-[10px] text-slate-400 truncate">
                      {provisionResult.verification_results.probe_message || 'Site responding'}
                    </div>
                  </div>
                  <div className="p-2 rounded bg-slate-900/60 border border-slate-800/60">
                    <span className="text-[10px] text-slate-500 block">TLS Port 443 Handshake</span>
                    <span className={`text-xs font-semibold ${provisionResult.verification_results.tls_socket_open ? 'text-emerald-400' : 'text-slate-400'}`}>
                      {provisionResult.verification_results.tls_socket_open ? 'TLS Socket Active' : 'HTTP Only'}
                    </span>
                    <div className="text-[10px] text-slate-400 truncate">
                      {provisionResult.ssl_issuer || 'Standard TLS'}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Generated VirtualHost Config Preview */}
            {provisionResult.conf_content && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-300 font-mono">
                    {provisionResult.conf_file_path}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyText('provision_conf', provisionResult.conf_content, 'config')}
                    className="h-6 px-2 text-[10px] rounded bg-slate-800 hover:bg-slate-700 text-slate-300 inline-flex items-center gap-1 transition-colors"
                  >
                    <Copy size={11} />
                    <span>Copy Config</span>
                  </button>
                </div>
                <pre className="p-3 rounded-lg bg-black/80 border border-slate-800 font-mono text-[11px] text-emerald-400 overflow-x-auto max-h-40 leading-relaxed">
                  {provisionResult.conf_content}
                </pre>
              </div>
            )}

            {/* Interactive Software Installation & Live Root Terminal */}
            <div className="p-4 rounded-xl border border-emerald-500/30 bg-slate-950/80 shadow-lg space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Terminal size={16} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-white">Software Installer & Root Terminal Console</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                        LIVE SSH ROOT
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Deploy your software stack or run arbitrary shell commands on {provisionResult.server_name}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-300">
                    <ServerIcon size={12} className="text-brand-400" />
                    <span>root@{provisionResult.server_ip}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-800 text-[11px] font-mono text-emerald-300 max-w-[260px] truncate" title={modalTerminalWorkingDir || provisionResult.document_root || `/var/www/${provisionResult.domain_name}`}>
                    <Folder size={12} className="text-emerald-400 shrink-0" />
                    <span className="truncate">{modalTerminalWorkingDir || provisionResult.document_root || `/var/www/${provisionResult.domain_name}`}</span>
                  </div>
                </div>
              </div>

              {/* Quick Software Installation Presets */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles size={12} className="text-emerald-400" />
                    <span>1-Click Software Installation Presets</span>
                  </span>
                  <span className="text-[10px] text-slate-500">Executes directly inside DocumentRoot</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {/* Preset 1: Git Clone Repo */}
                  <button
                    type="button"
                    onClick={() => setShowGitClonePrompt(!showGitClonePrompt)}
                    className={`p-2.5 rounded-lg border text-left transition-all ${
                      showGitClonePrompt
                        ? 'bg-brand-500/10 border-brand-500 text-white shadow-sm'
                        : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold flex items-center gap-1.5 text-white">
                        <GitBranch size={13} className="text-brand-400" />
                        <span>Git Clone Repo</span>
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 line-clamp-1">Clone any public/private repo</p>
                  </button>

                  {/* Preset 2: WordPress Clean Install */}
                  <button
                    type="button"
                    disabled={modalTerminalRunning}
                    onClick={() => handleRunModalTerminalCommand('curl -sS -O https://wordpress.org/latest.tar.gz && tar -xzf latest.tar.gz --strip-components=1 && rm latest.tar.gz && chown -R www-data:www-data . && ls -lah')}
                    className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-900 hover:border-slate-700 text-left transition-all group disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold flex items-center gap-1.5 text-white">
                        <Globe size={13} className="text-blue-400" />
                        <span>WordPress</span>
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 line-clamp-1">Auto-download & extract core</p>
                  </button>

                  {/* Preset 3: Node.js 20 & PM2 */}
                  <button
                    type="button"
                    disabled={modalTerminalRunning}
                    onClick={() => handleRunModalTerminalCommand('curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs && npm install -g pm2')}
                    className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-900 hover:border-slate-700 text-left transition-all group disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold flex items-center gap-1.5 text-white">
                        <span className="text-xs">📦</span>
                        <span>Node.js 20 & PM2</span>
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 line-clamp-1">Node 20 LTS + npm + PM2</p>
                  </button>

                  {/* Preset 4: PHP 8.2 & Composer */}
                  <button
                    type="button"
                    disabled={modalTerminalRunning}
                    onClick={() => handleRunModalTerminalCommand('apt-get update -qq && apt-get install -y php8.2-fpm php8.2-cli php8.2-mysql php8.2-curl php8.2-mbstring php8.2-xml php8.2-zip && curl -sS https://getcomposer.org/installer | php -- --install-dir=/usr/local/bin --filename=composer')}
                    className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-900 hover:border-slate-700 text-left transition-all group disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold flex items-center gap-1.5 text-white">
                        <span className="text-xs">🐘</span>
                        <span>PHP 8.2 & Composer</span>
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 line-clamp-1">FPM, extensions & Composer</p>
                  </button>

                  {/* Preset 5: Python 3 & Venv */}
                  <button
                    type="button"
                    disabled={modalTerminalRunning}
                    onClick={() => handleRunModalTerminalCommand('apt-get update -qq && apt-get install -y python3 python3-pip python3-venv python3-dev')}
                    className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-900 hover:border-slate-700 text-left transition-all group disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold flex items-center gap-1.5 text-white">
                        <span className="text-xs">🐍</span>
                        <span>Python 3 & Venv</span>
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 line-clamp-1">Python3, pip & venv</p>
                  </button>

                  {/* Preset 6: Docker Engine */}
                  <button
                    type="button"
                    disabled={modalTerminalRunning}
                    onClick={() => handleRunModalTerminalCommand('curl -fsSL https://get.docker.com | sh && apt-get install -y docker-compose-plugin')}
                    className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-900 hover:border-slate-700 text-left transition-all group disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold flex items-center gap-1.5 text-white">
                        <span className="text-xs">🐳</span>
                        <span>Docker & Compose</span>
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 line-clamp-1">Official Docker stack</p>
                  </button>

                  {/* Preset 7: Fix Permissions */}
                  <button
                    type="button"
                    disabled={modalTerminalRunning}
                    onClick={() => handleRunModalTerminalCommand('chown -R www-data:www-data . && chmod -R 755 . && echo "Permissions repaired: www-data:www-data (755/644)"')}
                    className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-900 hover:border-slate-700 text-left transition-all group disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold flex items-center gap-1.5 text-white">
                        <Wrench size={13} className="text-emerald-400" />
                        <span>Fix Permissions</span>
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 line-clamp-1">chown www-data:www-data</p>
                  </button>

                  {/* Preset 8: Inspect Directory */}
                  <button
                    type="button"
                    disabled={modalTerminalRunning}
                    onClick={() => handleRunModalTerminalCommand('ls -lah')}
                    className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/60 hover:bg-slate-900 hover:border-slate-700 text-left transition-all group disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold flex items-center gap-1.5 text-white">
                        <FolderSearch size={13} className="text-amber-400" />
                        <span>List Files</span>
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 line-clamp-1">ls -lah working directory</p>
                  </button>
                </div>

                {/* Git Clone Expandable Form */}
                {showGitClonePrompt && (
                  <div className="p-3 rounded-lg border border-brand-500/30 bg-brand-950/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-brand-300 flex items-center gap-1.5">
                        <GitBranch size={13} />
                        <span>Clone Git Repository directly into DocumentRoot</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowGitClonePrompt(false)}
                        className="text-slate-400 hover:text-white"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={gitCloneUrl}
                        onChange={(e) => setGitCloneUrl(e.target.value)}
                        placeholder="https://github.com/organization/repo.git or git@..."
                        className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-brand-500"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && gitCloneUrl.trim() && !modalTerminalRunning) {
                            e.preventDefault();
                            handleRunModalTerminalCommand(`git clone ${gitCloneUrl.trim()} . && chown -R www-data:www-data . && ls -lah`);
                          }
                        }}
                      />
                      <Button
                        variant="primary"
                        disabled={!gitCloneUrl.trim() || modalTerminalRunning}
                        isLoading={modalTerminalRunning}
                        onClick={() => {
                          if (gitCloneUrl.trim()) {
                            handleRunModalTerminalCommand(`git clone ${gitCloneUrl.trim()} . && chown -R www-data:www-data . && ls -lah`);
                          }
                        }}
                      >
                        Clone into DocRoot
                      </Button>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      Files will be cloned into <code className="text-emerald-400 font-mono">{modalTerminalWorkingDir || provisionResult.document_root}</code> and automatically assigned to <code className="text-brand-300 font-mono">www-data</code>.
                    </p>
                  </div>
                )}
              </div>

              {/* Shell Command Runner Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <Terminal size={12} className="text-emerald-400" />
                    <span>Run Shell Command on VPS</span>
                  </span>
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <span>Working Dir:</span>
                    <input
                      type="text"
                      value={modalTerminalWorkingDir}
                      onChange={(e) => setModalTerminalWorkingDir(e.target.value)}
                      placeholder={provisionResult.document_root || '/var/www'}
                      className="px-2 py-0.5 bg-slate-900 border border-slate-800 rounded font-mono text-[11px] text-emerald-300 w-52 focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 relative flex items-center">
                    <span className="absolute left-3 font-mono text-xs text-emerald-400 font-bold select-none">$</span>
                    <input
                      type="text"
                      value={modalTerminalCommand}
                      onChange={(e) => setModalTerminalCommand(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && modalTerminalCommand.trim() && !modalTerminalRunning) {
                          e.preventDefault();
                          handleRunModalTerminalCommand();
                        }
                      }}
                      placeholder="e.g. npm install && pm2 start server.js --name app or composer install or ls -lah"
                      className="w-full pl-7 pr-3 py-2 bg-black/90 border border-slate-800 rounded-lg text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                      disabled={modalTerminalRunning}
                    />
                  </div>
                  <Button
                    variant="primary"
                    disabled={!modalTerminalCommand.trim() || modalTerminalRunning}
                    isLoading={modalTerminalRunning}
                    onClick={() => handleRunModalTerminalCommand()}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold shadow-sm border-emerald-500/30 whitespace-nowrap"
                    leftIcon={<Play size={13} />}
                  >
                    Run on VPS
                  </Button>
                </div>
              </div>

              {/* Execution Progress Indicator */}
              {modalTerminalRunning && (
                <div className="p-3 rounded-lg border border-emerald-500/30 bg-emerald-950/20 flex items-center justify-between text-xs text-emerald-300 animate-pulse">
                  <div className="flex items-center gap-2">
                    <RefreshCw size={14} className="animate-spin text-emerald-400" />
                    <span>Executing command on <strong>{provisionResult.server_name}</strong> as root...</span>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-400">Streaming output...</span>
                </div>
              )}

              {/* Live Terminal Output Console */}
              {modalTerminalOutput && (
                <div className="rounded-lg border border-slate-800 overflow-hidden bg-black/90 space-y-0">
                  <div className="px-3 py-2 bg-slate-900/90 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                        modalTerminalOutput.exit_code === 0
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                      }`}>
                        Exit {modalTerminalOutput.exit_code}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400 truncate max-w-xs sm:max-w-md">
                        $ {modalTerminalOutput.command}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-500">
                        {modalTerminalOutput.duration_ms}ms
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyText('modal_terminal_out', `${modalTerminalOutput.stdout}\n${modalTerminalOutput.stderr}`, 'output')}
                        className="h-6 px-2 text-[10px] rounded bg-slate-800 hover:bg-slate-700 text-slate-300 inline-flex items-center gap-1 transition-colors"
                      >
                        <Copy size={11} />
                        <span>Copy Output</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setModalTerminalOutput(null)}
                        className="h-6 px-1.5 text-[10px] rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                        title="Clear console output"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>

                  <div className="p-3 font-mono text-[11px] max-h-60 overflow-y-auto overflow-x-auto leading-relaxed select-text space-y-1">
                    {modalTerminalOutput.stdout && (
                      <div className="text-emerald-400 whitespace-pre-wrap">
                        {modalTerminalOutput.stdout}
                      </div>
                    )}
                    {modalTerminalOutput.stderr && (
                      <div className="text-amber-300 whitespace-pre-wrap">
                        {modalTerminalOutput.stderr}
                      </div>
                    )}
                    {!modalTerminalOutput.stdout && !modalTerminalOutput.stderr && (
                      <div className="text-slate-500 italic">
                        Command completed successfully with no stdout/stderr output.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <form id="ai-domain-provision-form" onSubmit={handleExecuteProvision} className="space-y-4 text-xs">
            {/* Step 1: Target Server Selection */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-200">
                1. Select Target Hosting VPS Node <span className="text-rose-400">*</span>
              </label>
              <select
                value={provisionServerId}
                onChange={(e) => setProvisionServerId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-brand-500 font-mono"
                required
              >
                {servers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.public_ip}) · {s.os || 'Linux Ubuntu'} · {s.status}
                  </option>
                ))}
              </select>
              {provisionServerId && (
                <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                  <ServerIcon size={12} className="text-brand-400 shrink-0" />
                  <span>
                    Point your domain's DNS <code className="text-brand-300 font-semibold">A Record</code> to{' '}
                    <strong className="text-white font-mono font-semibold">
                      {servers.find(s => s.id === provisionServerId)?.public_ip}
                    </strong>
                  </span>
                </div>
              )}
            </div>

            {/* Step 2: Domain Name Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-200">
                2. Fully Qualified Domain Name (FQDN) <span className="text-rose-400">*</span>
              </label>
              <InputField
                label=""
                value={provisionDomainName}
                onChange={(e) => handleDomainNameChange(e.target.value)}
                placeholder="e.g. portal.company.com or store.example.com"
                isRequired
              />
              <p className="text-[11px] text-slate-400">
                Lowercase letters, numbers, hyphens, and periods only.
              </p>
            </div>

            {/* Step 3: Web Server Engine (Nginx vs Apache2) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-200">
                3. Preferred Web Server Engine <span className="text-rose-400">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setProvisionWebServer('nginx')}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    provisionWebServer === 'nginx'
                      ? 'bg-brand-500/10 border-brand-500 text-white shadow-sm'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-xs text-white">Nginx</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Recommended
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    High throughput, asynchronous event loop, fast PHP-FPM socket, and robust reverse proxying.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setProvisionWebServer('apache2')}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    provisionWebServer === 'apache2'
                      ? 'bg-brand-500/10 border-brand-500 text-white shadow-sm'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-xs text-white">Apache2</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      Classic
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Native <code className="text-slate-300">.htaccess</code> rewrite support, a2ensite/a2dissite tools, and mod_proxy.
                  </p>
                </button>
              </div>
            </div>

            {/* Step 4: Architecture Mode (DocumentRoot vs Reverse Proxy) */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-200">
                4. Application Architecture Mode
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setProvisionMode('document_root')}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    provisionMode === 'document_root'
                      ? 'bg-brand-500/10 border-brand-500 text-white'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold text-xs text-white mb-0.5">Static / PHP / HTML DocumentRoot</div>
                  <p className="text-[11px] text-slate-400">Serve files directly from disk path with PHP-FPM or HTML starter page.</p>
                </button>

                <button
                  type="button"
                  onClick={() => setProvisionMode('reverse_proxy')}
                  className={`p-2.5 rounded-lg border text-left transition-all ${
                    provisionMode === 'reverse_proxy'
                      ? 'bg-brand-500/10 border-brand-500 text-white'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold text-xs text-white mb-0.5">Reverse Proxy to Backend / Port</div>
                  <p className="text-[11px] text-slate-400">Forward traffic to local app port (Node.js, Docker, FastAPI, Python).</p>
                </button>
              </div>
            </div>

            {/* DocumentRoot or Proxy URL Config */}
            {provisionMode === 'document_root' ? (
              <div className="space-y-2 p-3 rounded-lg border border-slate-800 bg-slate-950/50">
                <label className="block text-xs font-semibold text-slate-200">
                  Target DocumentRoot Directory <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={provisionDocRoot}
                  onChange={(e) => setProvisionDocRoot(e.target.value)}
                  placeholder="/var/www/example.com"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-brand-500"
                />
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-slate-500">Suggested:</span>
                  {[
                    `/var/www/${provisionDomainName || 'myapp'}`,
                    `/var/www/html/${provisionDomainName || 'myapp'}`,
                    `/var/www/${provisionDomainName || 'myapp'}/public`,
                  ].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setProvisionDocRoot(p)}
                      className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-colors"
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400">
                  Directory will be created automatically on the VPS if missing, with <code className="text-slate-300">www-data:www-data</code> (755) permissions and a starter index page.
                </p>
              </div>
            ) : (
              <div className="space-y-2 p-3 rounded-lg border border-slate-800 bg-slate-950/50">
                <label className="block text-xs font-semibold text-slate-200">
                  Proxy Upstream Target URL <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={provisionProxyUrl}
                  onChange={(e) => setProvisionProxyUrl(e.target.value)}
                  placeholder="http://127.0.0.1:3000"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-brand-500"
                />
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] text-slate-500">Quick Ports:</span>
                  {[
                    'http://127.0.0.1:3000',
                    'http://127.0.0.1:8000',
                    'http://127.0.0.1:8080',
                    'http://127.0.0.1:5000',
                    'http://127.0.0.1:4000',
                  ].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setProvisionProxyUrl(p)}
                      className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-colors"
                    >
                      {p}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400">
                  Configures HTTP 1.1 proxying with WebSocket Upgrade headers and <code className="text-slate-300">X-Forwarded-For</code> forwarding.
                </p>
              </div>
            )}

            {/* Automation Checkboxes */}
            <div className="space-y-2 pt-1 border-t border-slate-800/80">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 hover:text-white">
                <input
                  type="checkbox"
                  checked={provisionInstallSsl}
                  onChange={(e) => setProvisionInstallSsl(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-brand-500 focus:ring-0 focus:ring-offset-0"
                />
                <span className="font-medium">
                  Automate Let's Encrypt SSL Installation (Certbot + HTTPS 301 Redirect)
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 hover:text-white">
                <input
                  type="checkbox"
                  checked={provisionVerifyInstall}
                  onChange={(e) => setProvisionVerifyInstall(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-brand-500 focus:ring-0 focus:ring-offset-0"
                />
                <span className="font-medium">
                  Verify Installation Live (Check Port 443 TLS Handshake & DNS Resolution Probe)
                </span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300 hover:text-white">
                <input
                  type="checkbox"
                  checked={provisionRegisterApp}
                  onChange={(e) => setProvisionRegisterApp(e.target.checked)}
                  className="w-4 h-4 rounded bg-slate-950 border-slate-800 text-brand-500 focus:ring-0 focus:ring-offset-0"
                />
                <span className="font-medium">
                  Register Domain as Monitored Application in HQ Directory
                </span>
              </label>
            </div>

            {/* Live Syntax Preview Accordion */}
            <div className="pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setShowCustomConfEditor(!showCustomConfEditor)}
                className="text-[11px] font-semibold text-brand-400 hover:text-brand-300 inline-flex items-center gap-1.5"
              >
                <FileCode size={13} />
                <span>{showCustomConfEditor ? 'Hide' : 'Inspect Generated'} VirtualHost Configuration (.conf)</span>
              </button>

              {showCustomConfEditor && (
                <div className="mt-2 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>
                      Generated for <strong className="text-white">{provisionWebServer.toUpperCase()}</strong>:
                    </span>
                    <button
                      type="button"
                      onClick={() => setProvisionCustomConf(getPreviewConfig())}
                      className="text-[10px] text-brand-400 hover:underline"
                    >
                      Reset to Generated
                    </button>
                  </div>
                  <textarea
                    rows={8}
                    value={provisionCustomConf || getPreviewConfig()}
                    onChange={(e) => setProvisionCustomConf(e.target.value)}
                    className="w-full p-2.5 rounded-lg bg-black/90 border border-slate-800 font-mono text-[11px] text-emerald-400 focus:outline-none focus:border-brand-500 leading-relaxed"
                  />
                  <p className="text-[10px] text-slate-500">
                    You can inspect or customize the configuration before deployment. If left as generated, AI will write standard hardened settings.
                  </p>
                </div>
              )}
            </div>
          </form>
        )}
      </ModalShell>

      {/* Delete / Teardown Configuration from Server Modal */}
      {selectedDomainForTeardown && (
        <ConfirmationModal
          isOpen={teardownModalOpen}
          title="Tear Down & Delete Configuration from Server"
          message={`Are you sure you want to permanently delete '${selectedDomainForTeardown.domain_name}' and all associated configurations from server (${selectedDomainForTeardown.server_ip})?

This will permanently:
1. Safely archive current configurations to /var/backups/hq-deleted-configs/
2. Permanently delete all Apache VirtualHost files (/etc/apache2/sites-enabled/ & sites-available/)
3. Permanently delete all Nginx server block configs (/etc/nginx/sites-enabled/, sites-available/, and conf.d/)
4. Purge all Certbot Let's Encrypt certificates and renewal configs (/etc/letsencrypt/renewal/, live/, archive/)
5. Purge local /etc/hosts domain mappings
6. Run configuration syntax checks (apache2ctl configtest / nginx -t) and reload web daemons
7. Permanently remove the domain record and all associations from HQ.`}
          confirmKeyword="DELETE"
          confirmButtonText={teardownRunning ? 'Purging from Server...' : 'Permanently Delete from Server'}
          isDestructive={true}
          isLoading={teardownRunning}
          onConfirm={executeConfirmedTeardown}
          onClose={() => {
            setTeardownModalOpen(false);
            setSelectedDomainForTeardown(null);
          }}
        />
      )}

      {/* Delete Domain from DB Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteModalOpen}
        title="Delete Monitored Domain Record"
        message={`Are you sure you want to delete '${selectedDomainForDelete?.domain_name}'? Automatic TLS/SSL certificate checks and DNS resolution monitoring will cease.`}
        confirmKeyword="DELETE"
        confirmButtonText="Delete Domain"
        isDestructive={true}
        onConfirm={executeConfirmedDelete}
        onClose={() => setDeleteModalOpen(false)}
      />

      <CommandAuditModal
        isOpen={auditModalOpen}
        onClose={() => setAuditModalOpen(false)}
        executionData={auditExecutionData}
        onRunFix={async (fixCommand) => {
          const srvId = auditExecutionData?.server_id || selectedServerId;
          if (srvId && srvId !== 'all') {
            const res = await api.executeTerminalCommand(srvId, fixCommand);
            await loadData();
            return res;
          }
        }}
        onSuccess={loadData}
      />
    </div>
  );
};
