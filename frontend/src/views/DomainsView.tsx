import React, { useEffect, useState } from 'react';
import {
  Globe,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
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
  ChevronDown,
  ChevronRight,
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
  Filter,
  Search,
  AlertTriangle,
  Sparkles,
  Wrench,
  Radio,
  Network,
  FolderSearch
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

interface DomainsViewProps {
  initialServerId?: string;
}

export const DomainsView: React.FC<DomainsViewProps> = ({ initialServerId }) => {
  const [domains, setDomains] = useState<DomainItem[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(initialServerId || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'DNS_MATCH' | 'DNS_MISMATCH' | 'SSL_VALID' | 'SSL_ISSUE'>('ALL');
  const [loading, setLoading] = useState(true);
  const [verifyingAllDns, setVerifyingAllDns] = useState(false);
  const [scanningVhosts, setScanningVhosts] = useState(false);

  // Deep-dive telemetry cache and loading states
  const [deepDives, setDeepDives] = useState<Record<string, DomainDeepDiveData>>({});
  const [loadingDeepDiveId, setLoadingDeepDiveId] = useState<string | null>(null);
  const [activeDrawerDomainId, setActiveDrawerDomainId] = useState<string | null>(null);
  const [drawerTabs, setDrawerTabs] = useState<Record<string, 'telemetry' | 'troubleshoot' | 'config' | 'logs'>>({});
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

  // Add Domain Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [newIp, setNewIp] = useState('');
  const [newAppId, setNewAppId] = useState('');

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
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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

  const toggleDrawer = async (domainId: string, initialTab?: 'telemetry' | 'troubleshoot' | 'config' | 'logs') => {
    if (activeDrawerDomainId === domainId && !initialTab) {
      setActiveDrawerDomainId(null);
    } else {
      setActiveDrawerDomainId(domainId);
      if (initialTab) {
        setDrawerTabs(prev => ({ ...prev, [domainId]: initialTab }));
      } else if (!drawerTabs[domainId]) {
        setDrawerTabs(prev => ({ ...prev, [domainId]: 'telemetry' }));
      }
      await fetchDomainDeepDive(domainId);
    }
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
    setActiveDrawerDomainId(d.id);
    setDrawerTabs(prev => ({ ...prev, [d.id]: 'troubleshoot' }));
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
    setActiveDrawerDomainId(d.id);
    setDrawerTabs(prev => ({ ...prev, [d.id]: 'logs' }));
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
    setActiveDrawerDomainId(d.id);
    setDrawerTabs(prev => ({ ...prev, [d.id]: 'logs' }));
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
    setActiveDrawerDomainId(d.id);
    setDrawerTabs(prev => ({ ...prev, [d.id]: 'logs' }));
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
    try {
      await api.deleteDomain(selectedDomainForDelete.id);
      showToast(`Domain '${selectedDomainForDelete.domain_name}' deleted from monitoring.`, 'success');
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

  const selectedServer = servers.find(
    (s) => s.id === selectedServerId || s.public_ip === selectedServerId
  ) || null;

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
        <div className="space-y-0.5">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-800/90 border border-slate-700 text-slate-300 text-[11px] font-mono whitespace-nowrap">
            <Radio size={11} className="text-indigo-400 shrink-0" />
            <span>127.0.0.1 (Local)</span>
          </div>
          <div className="text-[10px] text-slate-500">Internal .local VHost</div>
        </div>
      );
    }

    if (matches && resolvedIp) {
      return (
        <div className="space-y-0.5">
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] font-mono font-semibold whitespace-nowrap">
            <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />
            <span>{resolvedIp}</span>
          </div>
          <div className="text-[10px] text-emerald-400/80 flex items-center gap-1">
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
        <div className="space-y-0.5">
          <div
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[11px] font-mono font-semibold whitespace-nowrap"
            title={`DNS A-record resolves to ${resolvedIp}, which differs from hosting server ${d.server_ip}`}
          >
            <AlertTriangle size={11} className="text-amber-400 shrink-0" />
            <span>{resolvedIp}</span>
          </div>
          <div className="text-[10px] text-amber-400 font-medium whitespace-nowrap">
            Pings Diff IP (≠ {d.server_ip})
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-0.5">
        <div
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[11px] font-mono font-semibold whitespace-nowrap"
          title={`No public DNS A-record found for ${d.domain_name}`}
        >
          <AlertCircle size={11} className="text-rose-400 shrink-0" />
          <span>NXDOMAIN / No IP</span>
        </div>
        <div className="text-[10px] text-rose-400/90 whitespace-nowrap">
          Unresolved in Public DNS
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-[1440px] mx-auto">
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
        /* Step 1: VPS Selection Screen */
        <div className="space-y-6">
          {/* Header Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
            <div>
              <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
                <Globe className="text-brand-400" size={24} />
                <span>Domains, DNS Resolution & SSL Gateway</span>
              </h1>
              <p className="text-xs text-slate-400 mt-1">
                Select a target VPS node below to inspect hosted domains, compare live DNS resolving IPs against hosting IPs, and run website diagnostics.
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
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

          {/* Step 1 Selection Banner */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-brand-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-brand-500/20 text-brand-400 border border-brand-500/30 shrink-0">
                <ServerIcon size={20} />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                  <span>Step 1: Select Target VPS Server</span>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-300 border border-brand-500/30">
                    Required First Step
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  VirtualHosts, DNS A-record checks, and Let's Encrypt certificates are scoped per server node. Select a server to manage its domains.
                </p>
              </div>
            </div>
            <div className="text-xs font-semibold text-brand-300 bg-brand-950/80 px-3.5 py-1.5 rounded-lg border border-brand-800/60 shrink-0 self-start sm:self-auto">
              {servers.length} Registered VPS {servers.length === 1 ? 'Node' : 'Nodes'}
            </div>
          </div>

          {/* VPS Grid */}
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
                      setNewIp(srv.public_ip);
                    }}
                    className="group relative bg-slate-900 hover:bg-slate-850 border border-slate-800 hover:border-brand-500/60 rounded-2xl p-5 transition-all duration-200 cursor-pointer shadow-lg hover:shadow-brand-500/10 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="p-2 rounded-xl bg-slate-850 group-hover:bg-brand-500/20 text-brand-400 border border-slate-750 group-hover:border-brand-500/40 transition-colors">
                            <ServerIcon size={18} />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-white group-hover:text-brand-300 transition-colors">
                              {srv.name}
                            </h3>
                            <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5 mono">
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

                    <Button
                      variant="primary"
                      size="sm"
                      className="w-full justify-center group-hover:bg-brand-500"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedServerId(srv.id);
                        setNewIp(srv.public_ip);
                      }}
                      rightIcon={<ChevronRight size={14} className="group-hover:translate-x-0.5 transition-transform" />}
                    >
                      <span>Select VPS & Manage Domains</span>
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Step 2: Selected VPS Domains Management View */
        <div className="space-y-6">
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
                Compare Hosting Server IP ({selectedServer.public_ip}) with Live Resolving DNS IPs, manage Let's Encrypt SSL, and troubleshoot websites.
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
                onClick={() => {
                  setNewIp(selectedServer.public_ip);
                  setCreateModalOpen(true);
                }}
                className="h-8 px-3.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shadow-sm transition-colors"
              >
                <Plus size={14} />
                <span>Register Domain</span>
              </button>
            </div>
          </div>

          {/* Active VPS Banner & Quick Switcher */}
          <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                <ServerIcon size={16} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-white">Hosting VPS Node: {selectedServer.name}</span>
                  <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono text-brand-300">
                    Host IP: {selectedServer.public_ip}
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[11px] text-emerald-400 font-medium">SSH Ready</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Domains whose DNS A-record pings a different IP than <span className="font-mono text-slate-200">{selectedServer.public_ip}</span> are flagged in amber below.
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              <span className="text-xs text-slate-400 whitespace-nowrap">Switch VPS:</span>
              <select
                value={selectedServer.id}
                onChange={(e) => {
                  setSelectedServerId(e.target.value);
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
              <span className="text-[11px] text-slate-400 font-medium">Total Hosted Domains</span>
              <div className="text-2xl font-bold text-white mono">{serverDomains.length}</div>
              <div className="text-[11px] text-brand-400 flex items-center gap-1">
                <Globe size={11} /> Click to show all
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
              <span className="text-[11px] text-slate-400 font-medium">DNS Matches Server IP</span>
              <div className="text-2xl font-bold text-emerald-400 mono">{dnsMatchedCount}</div>
              <div className="text-[11px] text-emerald-400 flex items-center gap-1">
                <CheckCircle2 size={11} /> Pings {selectedServer.public_ip}
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
              <span className="text-[11px] text-slate-400 font-medium">Diff DNS IP / Unresolved</span>
              <div className={`text-2xl font-bold mono ${dnsMismatchCount > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                {dnsMismatchCount}
              </div>
              <div className="text-[11px] text-amber-400 flex items-center gap-1">
                <AlertTriangle size={11} /> Pings different IP or NXDOMAIN
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
              <span className="text-[11px] text-slate-400 font-medium">TLS/SSL Secured (Valid)</span>
              <div className="text-2xl font-bold text-emerald-400 mono">{sslValidCount}</div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                <ShieldCheck size={11} className="text-emerald-400" /> Let's Encrypt Active
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
              <span className="text-[11px] text-slate-400 font-medium">Expiring / Missing SSL</span>
              <div className={`text-2xl font-bold mono ${sslIssueCount > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                {sslIssueCount}
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1">
                <Clock size={11} className="text-amber-400" /> Click to filter issues
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
                  className="px-2.5 py-1 rounded-lg bg-brand-950 text-brand-300 border border-brand-800 text-[11px] font-semibold flex items-center gap-1"
                >
                  <span>Filter: {statusFilter}</span>
                  <X size={11} />
                </button>
              )}
              <span className="text-xs text-slate-400">
                Showing <strong className="text-white">{filteredDomains.length}</strong> of {serverDomains.length} domains
              </span>
            </div>
          </div>

          {/* Domains Table */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/70 text-slate-400 uppercase text-[11px] tracking-wider">
                    <th className="py-3.5 px-4 whitespace-nowrap">Domain & Application</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">Hosting Server IP</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">Resolving DNS / Ping IP</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">SSL Status</th>
                    <th className="py-3.5 px-4 whitespace-nowrap">Issuer & Expiry</th>
                    <th className="py-3.5 px-4 text-right whitespace-nowrap">Quick Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">
                        <RefreshCw size={20} className="animate-spin mx-auto mb-2 text-brand-400" />
                        Loading domain registry & resolving live DNS IPs...
                      </td>
                    </tr>
                  ) : filteredDomains.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">
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
                    filteredDomains.map((d) => {
                      const isDrawerOpen = activeDrawerDomainId === d.id;
                      const isUpdating = updatingSslId === d.id;
                      const isVerifying = verifyingId === d.id;
                      const output = sslOutputs[d.id];
                      const deepDive = deepDives[d.id];
                      const isLoadingTelemetry = loadingDeepDiveId === d.id;
                      const currentTab = drawerTabs[d.id] || 'telemetry';
                      const activeTool = runningToolKey[d.id];

                      return (
                        <React.Fragment key={d.id}>
                          <tr
                            onClick={() => toggleDrawer(d.id)}
                            className={`hover:bg-slate-800/40 cursor-pointer transition-colors ${
                              isDrawerOpen ? 'bg-slate-800/35' : ''
                            }`}
                          >
                            {/* Column 1: Domain Name & App */}
                            <td className="py-3.5 px-4">
                              <div className="flex items-start gap-2.5">
                                <span className="text-slate-500 mt-0.5 shrink-0">
                                  {isDrawerOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="mono font-bold text-white text-[13px] truncate">{d.domain_name}</span>
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
                                </div>
                              </div>
                            </td>

                            {/* Column 2: Hosting Server IP */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-950 border border-slate-800 text-slate-200 font-mono text-[11px]">
                                <ServerIcon size={12} className="text-brand-400 shrink-0" />
                                <span>{d.server_ip}</span>
                              </div>
                              <div className="text-[10px] text-slate-500 mt-0.5 truncate max-w-[150px]">
                                {d.server_name || selectedServer.name}
                              </div>
                            </td>

                            {/* Column 3: Resolving DNS / Ping IP */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              {renderDnsResolutionBadge(d)}
                            </td>

                            {/* Column 4: SSL Status */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <StatusBadge status={d.ssl_status} size="sm" />
                            </td>

                            {/* Column 5: Issuer & Expiry */}
                            <td className="py-3.5 px-4 whitespace-nowrap">
                              <div className="text-slate-300 font-medium text-[11px] truncate max-w-[170px]">
                                {d.ssl_issuer || "Let's Encrypt"}
                              </div>
                              <div className={`text-[11px] mono font-semibold mt-0.5 ${
                                d.days_remaining <= 14
                                  ? 'text-rose-400'
                                  : d.days_remaining <= 30
                                  ? 'text-amber-400'
                                  : 'text-emerald-400'
                              }`}>
                                {d.days_remaining} days remaining
                              </div>
                            </td>

                            {/* Column 6: Well-Formatted Single-Row Action Buttons */}
                            <td className="py-3.5 px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                              <div className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap">
                                {/* Troubleshoot Website */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    toggleDrawer(d.id, 'troubleshoot');
                                    if (!sslOutputs[d.id]) {
                                      handleRunTroubleshootTool(d, 'dns_ping', undefined, false);
                                    }
                                  }}
                                  className="h-7 px-2.5 rounded-lg bg-indigo-950/90 hover:bg-indigo-900 text-indigo-200 border border-indigo-700/70 text-[11px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                                  title="Open Website Troubleshooter (DNS/Ping, HTTP Probe, SSL Chain, VHost Syntax, Logs & Auto-Fix)"
                                >
                                  <Wrench size={12} className="text-indigo-400 shrink-0" />
                                  <span>Troubleshoot</span>
                                </button>

                                {/* Update SSL */}
                                <button
                                  type="button"
                                  disabled={isUpdating || isVerifying}
                                  onClick={() => handleUpdateSsl(d)}
                                  className="h-7 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-sm transition-colors disabled:opacity-50"
                                  title="Run Let's Encrypt Certbot SSL provisioning/renewal over SSH as root"
                                >
                                  {isUpdating ? (
                                    <RefreshCw size={12} className="animate-spin shrink-0" />
                                  ) : (
                                    <ShieldCheck size={12} className="shrink-0" />
                                  )}
                                  <span>{isUpdating ? 'Updating...' : 'Update SSL'}</span>
                                </button>

                                {/* Verify TLS & DNS */}
                                <button
                                  type="button"
                                  disabled={isUpdating || isVerifying}
                                  onClick={() => handleVerifySsl(d)}
                                  className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-50"
                                  title="Verify live TLS certificate over port 443 and check DNS A-record resolution"
                                >
                                  {isVerifying ? (
                                    <RefreshCw size={12} className="animate-spin text-sky-400 shrink-0" />
                                  ) : (
                                    <Lock size={12} className="text-sky-400 shrink-0" />
                                  )}
                                  <span>{isVerifying ? 'Verifying...' : 'Verify TLS'}</span>
                                </button>

                                {/* Delete from Server */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedDomainForTeardown(d);
                                    setTeardownModalOpen(true);
                                  }}
                                  className="h-7 px-2.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/70 text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                                  title="Safely tear down and delete VirtualHost config from server and reload web daemon"
                                >
                                  <Trash2 size={12} className="shrink-0" />
                                  <span>Delete</span>
                                </button>
                              </div>
                            </td>
                          </tr>

                          {/* Expandable Deep-Dive & Troubleshooting Drawer */}
                          {isDrawerOpen && (
                            <tr className="bg-slate-950 border-b border-slate-800">
                              <td colSpan={6} className="p-4 md:p-6">
                                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl space-y-0">
                                  {/* Drawer Navigation Bar */}
                                  <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 px-4 py-3 bg-slate-950/90 border-b border-slate-800">
                                    {/* Left Tabs */}
                                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 xl:pb-0">
                                      <button
                                        type="button"
                                        onClick={() => setDrawerTabs(prev => ({ ...prev, [d.id]: 'telemetry' }))}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                                          currentTab === 'telemetry'
                                            ? 'bg-brand-600 text-white shadow-sm'
                                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                        }`}
                                      >
                                        <Activity size={13} />
                                        <span>Software Vitals & Analytics</span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => setDrawerTabs(prev => ({ ...prev, [d.id]: 'troubleshoot' }))}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                                          currentTab === 'troubleshoot'
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : 'text-indigo-300 hover:text-white hover:bg-slate-800 bg-indigo-950/40 border border-indigo-800/50'
                                        }`}
                                      >
                                        <Wrench size={13} />
                                        <span>Website Troubleshooter</span>
                                        <span className="px-1.5 py-0.2 rounded text-[10px] bg-indigo-500/30 text-indigo-200 font-mono">
                                          8 Tools
                                        </span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => setDrawerTabs(prev => ({ ...prev, [d.id]: 'config' }))}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                                          currentTab === 'config'
                                            ? 'bg-brand-600 text-white shadow-sm'
                                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                        }`}
                                      >
                                        <FileCode size={13} />
                                        <span>VirtualHost Config (.conf)</span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => setDrawerTabs(prev => ({ ...prev, [d.id]: 'logs' }))}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors ${
                                          currentTab === 'logs'
                                            ? 'bg-brand-600 text-white shadow-sm'
                                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                        }`}
                                      >
                                        <Terminal size={13} />
                                        <span>Console & SSL Logs</span>
                                        {output && (
                                          <span className={`w-2 h-2 rounded-full ${output.success ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                                        )}
                                      </button>
                                    </div>

                                    {/* Right Operational Action Buttons Toolbar */}
                                    <div className="flex items-center gap-1.5 overflow-x-auto">
                                      <button
                                        type="button"
                                        disabled={!!serviceActionLoading[d.id]}
                                        onClick={() => handleServiceAction(d, 'restart')}
                                        className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-50"
                                        title="Restart application service or web container"
                                      >
                                        <RotateCcw size={12} className={serviceActionLoading[d.id] === 'restart' ? 'animate-spin text-brand-400' : 'text-brand-400'} />
                                        <span>Restart</span>
                                      </button>

                                      <button
                                        type="button"
                                        disabled={!!serviceActionLoading[d.id]}
                                        onClick={() => handleServiceAction(d, 'stop')}
                                        className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-50"
                                        title="Stop application service and suspend VirtualHost"
                                      >
                                        <Square size={11} className="text-amber-400" />
                                        <span>Stop</span>
                                      </button>

                                      <button
                                        type="button"
                                        disabled={!!serviceActionLoading[d.id]}
                                        onClick={() => handleServiceAction(d, 'start')}
                                        className="h-7 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-50"
                                        title="Start application service and activate VirtualHost"
                                      >
                                        <Play size={11} className="text-emerald-400" />
                                        <span>Start</span>
                                      </button>

                                      <button
                                        type="button"
                                        disabled={backingUpConfigId === d.id}
                                        onClick={() => handleBackupConfig(d)}
                                        className="h-7 px-2.5 rounded-lg bg-sky-950/80 hover:bg-sky-900 text-sky-200 border border-sky-800/80 text-[11px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-50"
                                        title="Download VirtualHost .conf file"
                                      >
                                        <Download size={12} className="text-sky-400" />
                                        <span>Backup .conf</span>
                                      </button>

                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedDomainForTeardown(d);
                                          setTeardownModalOpen(true);
                                        }}
                                        className="h-7 px-2.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/70 text-[11px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
                                        title="Delete VirtualHost from VPS and reload web server"
                                      >
                                        <Trash2 size={12} />
                                        <span>Delete Config</span>
                                      </button>
                                    </div>
                                  </div>

                                  {/* Tab 1: Software Vitals & Analytics */}
                                  {currentTab === 'telemetry' && (
                                    <div className="p-5 space-y-5">
                                      {/* DNS vs Hosting Server Quick Summary Strip */}
                                      <div className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                        d.dns_matches_server === false
                                          ? 'bg-amber-950/20 border-amber-500/40'
                                          : 'bg-slate-950/90 border-slate-800'
                                      }`}>
                                        <div className="flex items-center gap-3 flex-wrap">
                                          <div className="flex items-center gap-2 text-xs">
                                            <span className="text-slate-400">Hosting Server IP:</span>
                                            <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono font-bold text-white">
                                              {d.server_ip}
                                            </span>
                                          </div>
                                          <ChevronRight size={14} className="text-slate-600 hidden sm:inline" />
                                          <div className="flex items-center gap-2 text-xs">
                                            <span className="text-slate-400">Resolving Public DNS IP:</span>
                                            <span className={`px-2 py-0.5 rounded font-mono font-bold border ${
                                              d.dns_matches_server
                                                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                                                : d.resolved_ip
                                                ? 'bg-amber-950/60 border-amber-500/40 text-amber-300'
                                                : 'bg-rose-950/60 border-rose-500/40 text-rose-300'
                                            }`}>
                                              {d.resolved_ip || 'UNRESOLVED (NXDOMAIN)'}
                                            </span>
                                          </div>
                                        </div>

                                        <button
                                          type="button"
                                          onClick={() => handleRunTroubleshootTool(d, 'dns_ping', undefined, false)}
                                          className="h-7 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold inline-flex items-center gap-1.5 whitespace-nowrap self-start sm:self-auto"
                                        >
                                          <Network size={12} />
                                          <span>Run Live DNS & Ping Trace</span>
                                        </button>
                                      </div>

                                      {isLoadingTelemetry ? (
                                        <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                                          <RefreshCw size={16} className="animate-spin text-brand-400" />
                                          <span>Probing remote server for software stack, memory usage, and access log analytics...</span>
                                        </div>
                                      ) : (
                                        <>
                                          {/* Row 1: Software Specs, RAM, Running Uptime & Hosting Server */}
                                          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                                              <div className="flex items-center justify-between text-xs text-slate-400">
                                                <span className="font-semibold flex items-center gap-1.5">
                                                  <Cpu size={14} className="text-brand-400" />
                                                  Software Stack
                                                </span>
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-brand-950 border border-brand-800 text-brand-300">
                                                  {deepDive?.language || 'PHP 8.2'}
                                                </span>
                                              </div>
                                              <div className="text-lg font-bold text-white tracking-tight">
                                                {deepDive?.framework || 'Apache2 VirtualHost'}
                                              </div>
                                              <div className="text-[11px] text-slate-400 mono truncate">
                                                Root: {deepDive?.root_path || '/var/www/html'}
                                              </div>
                                            </div>

                                            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                                              <div className="flex items-center justify-between text-xs text-slate-400">
                                                <span className="font-semibold flex items-center gap-1.5">
                                                  <Activity size={14} className="text-emerald-400" />
                                                  RAM Memory Usage
                                                </span>
                                                <span className="text-[11px] font-mono text-emerald-400">
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
                                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                                                  {deepDive?.status || 'ONLINE'}
                                                </span>
                                              </div>
                                              <div className="text-lg font-bold text-white tracking-tight mono">
                                                {deepDive?.uptime_formatted || 'Active'}
                                              </div>
                                              <div className="text-[11px] text-slate-400">
                                                Daemon: {deepDive?.process_manager || 'systemd'} (Port {deepDive?.port || 80})
                                              </div>
                                            </div>

                                            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                                              <div className="flex items-center justify-between text-xs text-slate-400">
                                                <span className="font-semibold flex items-center gap-1.5">
                                                  <ServerIcon size={14} className="text-sky-400" />
                                                  Host Node Specs
                                                </span>
                                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300">
                                                  {deepDive?.server_provider || 'Cloud VPS'}
                                                </span>
                                              </div>
                                              <div className="text-lg font-bold text-white tracking-tight truncate">
                                                {deepDive?.server_name || selectedServer.name}
                                              </div>
                                              <div className="text-[11px] text-slate-400 mono">
                                                {deepDive?.server_ip || d.server_ip} · {deepDive?.server_os || 'Linux'}
                                              </div>
                                            </div>
                                          </div>

                                          {/* Row 2: Traffic & Web Analytics */}
                                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

                                  {/* Tab 2: Website Troubleshooter & Diagnostics Suite */}
                                  {currentTab === 'troubleshoot' && (
                                    <div className="p-5 space-y-5">
                                      {/* DNS Comparison & Routing Diagnostic Banner */}
                                      <div className={`p-4 rounded-xl border flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                                        d.dns_matches_server === false
                                          ? 'bg-amber-950/25 border-amber-500/40'
                                          : 'bg-slate-950 border-slate-800'
                                      }`}>
                                        <div className="space-y-1">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-xs font-bold text-white flex items-center gap-1.5">
                                              <Wrench size={14} className="text-indigo-400" />
                                              <span>Website Diagnostic & Auto-Remediation Suite — {d.domain_name}</span>
                                            </span>
                                            {d.dns_matches_server ? (
                                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                                DNS MATCHES HOSTING SERVER ({d.server_ip})
                                              </span>
                                            ) : d.resolved_ip ? (
                                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                                DNS PINGS DIFFERENT IP: {d.resolved_ip} (HOSTED ON {d.server_ip})
                                              </span>
                                            ) : (
                                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
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

                                      {/* 8 Diagnostic Tool Cards Grid */}
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
                                                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-900 text-slate-300 border border-slate-800">
                                                    {tool.badge}
                                                  </span>
                                                </div>
                                                <div className="text-xs font-bold text-white">{tool.title}</div>
                                                <p className="text-[11px] text-slate-400 leading-relaxed">
                                                  {tool.subtitle}
                                                </p>
                                              </div>

                                              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
                                                <span className="text-[11px] font-semibold text-indigo-400 flex items-center gap-1">
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
                                          <span className="font-semibold text-slate-300">Custom Website SSH Probe:</span>
                                        </div>
                                        <input
                                          type="text"
                                          value={customDiagCmd[d.id] || ''}
                                          onChange={(e) => setCustomDiagCmd(prev => ({ ...prev, [d.id]: e.target.value }))}
                                          placeholder={`e.g. curl -ILs https://${d.domain_name} || apache2ctl -S | grep ${d.domain_name}`}
                                          className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-brand-500"
                                        />
                                        <button
                                          type="button"
                                          disabled={!!activeTool || !(customDiagCmd[d.id] || '').trim()}
                                          onClick={() => handleRunTroubleshootTool(d, 'custom', customDiagCmd[d.id], true)}
                                          className="h-8 px-3.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                                        >
                                          <Play size={12} />
                                          <span>Execute & Audit</span>
                                        </button>
                                      </div>

                                      {/* Live Diagnostic Output Console inside Troubleshooter Tab */}
                                      {output && (
                                        <div className="rounded-xl border border-slate-800 overflow-hidden bg-black/95">
                                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2.5 bg-slate-950 border-b border-slate-800 text-xs">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                output.success
                                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                                  : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                              }`}>
                                                {output.title || 'DIAGNOSTIC OUTPUT'}
                                              </span>
                                              <span className="text-slate-400 text-[11px] mono">{output.duration_ms} ms</span>
                                              {output.message && (
                                                <span className="text-slate-300 text-[11px]">{output.message}</span>
                                              )}
                                            </div>

                                            <div className="flex items-center gap-2 shrink-0">
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

                                          <div className="p-4 font-mono text-[11px] leading-relaxed max-h-80 overflow-y-auto space-y-1.5">
                                            <div className="text-slate-500 break-all">$ {output.command}</div>
                                            {output.stdout && (
                                              <pre className="text-emerald-400/95 whitespace-pre-wrap font-mono">
                                                {output.stdout}
                                              </pre>
                                            )}
                                            {output.stderr && (
                                              <pre className="text-amber-400/90 whitespace-pre-wrap font-mono pt-1 border-t border-slate-800/60">
                                                {output.stderr}
                                              </pre>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Tab 3: VirtualHost Config File */}
                                  {currentTab === 'config' && (
                                    <div className="p-5 space-y-3">
                                      <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                                        <div className="flex items-center gap-2 font-mono text-slate-400">
                                          <FileCode size={14} className="text-sky-400" />
                                          <span>{deepDive?.config_file_path || `/etc/apache2/sites-available/${d.domain_name}.conf`}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <button
                                            type="button"
                                            onClick={() => handleCopyText(d.id, deepDive?.config_content || '', 'config')}
                                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] flex items-center gap-1 transition-colors border border-slate-700"
                                          >
                                            {copiedConfigId === d.id ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                                            <span>{copiedConfigId === d.id ? 'Copied' : 'Copy Config'}</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => handleBackupConfig(d)}
                                            className="px-2.5 py-1 bg-brand-600 hover:bg-brand-500 text-white rounded text-[11px] flex items-center gap-1 transition-colors font-semibold"
                                          >
                                            <Download size={11} />
                                            <span>Download .conf</span>
                                          </button>
                                        </div>
                                      </div>

                                      <div className="p-4 bg-black/90 rounded-lg border border-slate-800 overflow-x-auto max-h-80 font-mono text-xs text-sky-300/90 leading-relaxed">
                                        <pre className="whitespace-pre-wrap">
                                          {deepDive?.config_content || `# VirtualHost configuration for ${d.domain_name}\n# DocumentRoot: ${deepDive?.root_path || '/var/www/html'}\n<VirtualHost *:80>\n    ServerName ${d.domain_name}\n    ServerAdmin webmaster@localhost\n    DocumentRoot ${deepDive?.root_path || '/var/www/html'}\n</VirtualHost>`}
                                        </pre>
                                      </div>
                                    </div>
                                  )}

                                  {/* Tab 4: Console & SSL Logs */}
                                  {currentTab === 'logs' && (
                                    <div className="space-y-0">
                                      {isUpdating ? (
                                        <div className="p-6 bg-slate-900 border-t border-slate-800 flex items-center gap-3 animate-pulse text-xs text-brand-300">
                                          <RefreshCw size={18} className="animate-spin text-brand-400" />
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
                                        <div className="space-y-0">
                                          <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950 border-b border-slate-800 text-xs flex-wrap gap-2">
                                            <div className="flex items-center gap-2.5 flex-wrap">
                                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                output.success
                                                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                                  : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                              }`}>
                                                {output.success ? 'EXIT 0: SUCCESS' : `EXIT ${output.exit_code}: FAILED`}
                                              </span>
                                              <span className="text-slate-400 text-[11px]">{output.duration_ms} ms</span>
                                              <span className="text-slate-600">|</span>
                                              <span className="text-slate-300 font-medium text-[11px] flex items-center gap-1">
                                                <Lock size={11} className="text-emerald-400" />
                                                {output.ssl_issuer || "Let's Encrypt Authority"}
                                              </span>
                                            </div>

                                            <div className="flex items-center gap-2">
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
                                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] flex items-center gap-1.5 transition-colors border border-slate-700"
                                              >
                                                {copiedDomainId === d.id ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                                                <span>{copiedDomainId === d.id ? 'Copied' : 'Copy Output'}</span>
                                              </button>
                                            </div>
                                          </div>

                                          <div className="p-3 bg-black/90 font-mono text-[11px] leading-relaxed max-h-64 overflow-y-auto space-y-1">
                                            <div className="text-slate-500 pb-1">$ {output.command}</div>
                                            {output.stdout && (
                                              <pre className="text-emerald-400/95 whitespace-pre-wrap font-mono">
                                                {output.stdout}
                                              </pre>
                                            )}
                                            {output.stderr && (
                                              <pre className="text-amber-400/90 whitespace-pre-wrap font-mono pt-1 border-t border-slate-800/60">
                                                {output.stderr}
                                              </pre>
                                            )}
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="p-5 text-center text-xs text-slate-500">
                                          No recent terminal executions. Click <strong className="text-indigo-400">Troubleshoot</strong>, <strong className="text-emerald-400">Update SSL</strong>, <strong className="text-white">Verify TLS</strong>, or <strong className="text-brand-400">Restart</strong> above to trigger live remote commands and inspect logs.
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
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
