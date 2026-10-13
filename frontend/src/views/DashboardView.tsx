import React, { useEffect, useState, useMemo } from 'react';
import {
  Layers,
  Server,
  Activity,
  Rocket,
  ShieldAlert,
  Clock,
  RefreshCw,
  GitBranch,
  AlertTriangle,
  XCircle,
  ShieldCheck,
  ChevronRight,
  Globe,
  Cpu,
  Box,
  Network,
  Sparkles,
  Search,
  ExternalLink,
  CheckCircle2,
  Database,
  Download,
  Wrench
} from 'lucide-react';
import { api } from '../api/client';
import { StatusBadge } from '../components/StatusBadge';
import { SkeletonLoader } from '../components/common/SkeletonLoader';
import { useWebSocket } from '../context/WebSocketContext';
import { CommandAuditModal, CommandExecutionData } from '../components/CommandAuditModal';

interface DashboardViewProps {
  onNavigate: (view: string, id?: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onNavigate }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingGit, setSyncingGit] = useState(false);
  const [verifyingDns, setVerifyingDns] = useState(false);
  const [exportingBackup, setExportingBackup] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Interactive Filters for Comprehensive Overview Insights
  const [selectedServerId, setSelectedServerId] = useState<string>('all');
  const [insightFilter, setInsightFilter] = useState<
    'ALL' | 'ATTENTION' | 'SUITES' | 'WEB_VHOSTS' | 'GIT_TRACKED' | 'GIT_UPDATES' | 'DNS_MISMATCH' | 'SSL_WARNING'
  >('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // AI Command Audit Modal State
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [auditExecutionData, setAuditExecutionData] = useState<CommandExecutionData | null>(null);

  const { subscribe } = useWebSocket();

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 5000);
  };

  const loadMetrics = async () => {
    try {
      const res = await api.getDashboardMetrics();
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadMetrics();

    const unsubscribe = subscribe('metrics_tick', () => {
      loadMetrics();
    });

    const unsubscribeDep = subscribe('deployment_completed', () => {
      loadMetrics();
    });

    return () => {
      unsubscribe();
      unsubscribeDep();
    };
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadMetrics();
  };

  const handleSyncAllGit = async () => {
    setSyncingGit(true);
    try {
      await api.scanAllGitRepos();
      await loadMetrics();
      showToast('Scanned all VPS servers and matched applications to their exact Git repositories.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to sync Git repositories.', 'error');
    } finally {
      setSyncingGit(false);
    }
  };

  const handleVerifyAllDns = async () => {
    setVerifyingDns(true);
    try {
      const res = await api.verifyAllDomainsDns();
      await loadMetrics();
      showToast(
        res.message || `Verified live DNS IPs for ${res.total || 0} domains (${res.matched || 0} match server IP).`,
        'success'
      );
    } catch (err: any) {
      showToast(err.message || 'Failed to verify live DNS resolution.', 'error');
    } finally {
      setVerifyingDns(false);
    }
  };

  const handleExportSystemBackup = async () => {
    setExportingBackup(true);
    try {
      const snap = await api.exportSystemBackup();
      const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `hq-system-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Downloaded complete HQ System Database snapshot.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to export system backup.', 'error');
    } finally {
      setExportingBackup(false);
    }
  };

  const handleInvestigateAppOutage = async (app: any) => {
    const rawTarget = (app.service_name || app.name || '').replace(/["']/g, '');
    const cleanDocker = rawTarget.replace(/\s+/g, '-').toLowerCase();
    const pm = (app.process_manager || '').toLowerCase();

    let probeCmd = '';
    if (app.is_suite || pm.includes('docker') || pm.includes('container') || app.app_type === 'Docker Container') {
      probeCmd = `(docker ps -a --filter "name=${cleanDocker}" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>&1 && docker logs --tail 40 "${cleanDocker}" 2>&1) || (docker ps -a --no-trunc | head -n 30)`;
    } else if (pm.includes('apache')) {
      probeCmd = `apache2ctl configtest 2>&1; systemctl status apache2 --no-pager -l 2>&1 | tail -n 25; tail -n 25 /var/log/apache2/error.log 2>/dev/null`;
    } else if (pm.includes('nginx')) {
      probeCmd = `nginx -t 2>&1; systemctl status nginx --no-pager -l 2>&1 | tail -n 25; tail -n 25 /var/log/nginx/error.log 2>/dev/null`;
    } else {
      probeCmd = `systemctl status "${rawTarget}" --no-pager -l 2>&1 | tail -n 25; ss -tulpn | grep ":${app.port || 80}" || true`;
    }

    if (app.server_id) {
      try {
        const probeRes = await api.executeTerminalCommand(app.server_id, probeCmd);
        const exitCode = probeRes.exit_code !== undefined ? probeRes.exit_code : (probeRes.stderr ? 1 : 0);
        setAuditExecutionData({
          command: probeCmd,
          stdout: probeRes.stdout || '',
          stderr: probeRes.stderr || (exitCode !== 0 ? `Probe process exited with code ${exitCode}` : ''),
          exit_code: exitCode,
          duration_ms: probeRes.duration_ms || 120,
          server_id: app.server_id,
          server_name: app.server_name,
          server_ip: app.server_ip,
          context_type: 'APP_HEALTH_FAILURE',
          title: `Investigate Outage: ${app.name}`
        });
        setAuditModalOpen(true);
        return;
      } catch (err: any) {
        console.error('Probe execution failed:', err);
      }
    }

    setAuditExecutionData({
      command: probeCmd,
      stdout: '',
      stderr: `[SERVICE_OUTAGE_DETECTED]\nApplication: ${app.name}\nStatus: ${app.health_status}\nServer: ${app.server_name || 'VPS'} (${app.server_ip || 'Node'})\nProcess/Port: ${app.port || 'N/A'}\nVirtualHost/Domain: ${app.domain || 'N/A'}\nError: Host process or container listener failed healthcheck probe.`,
      exit_code: 1,
      duration_ms: 120,
      server_id: app.server_id,
      server_name: app.server_name,
      server_ip: app.server_ip,
      context_type: 'APP_HEALTH_FAILURE',
      title: `Investigate Outage: ${app.name}`
    });
    setAuditModalOpen(true);
  };

  const serverNodes: any[] = data?.servers?.nodes || [];
  const allAppInsights: any[] = data?.app_insights || [];
  const allDomainInsights: any[] = data?.domain_insights || [];

  // Scope insights by selected VPS server node
  const scopedApps = useMemo(() => {
    if (selectedServerId === 'all') return allAppInsights;
    return allAppInsights.filter((a) => a.server_id === selectedServerId);
  }, [allAppInsights, selectedServerId]);

  const scopedDomains = useMemo(() => {
    if (selectedServerId === 'all') return allDomainInsights;
    return allDomainInsights.filter((d) => d.server_id === selectedServerId);
  }, [allDomainInsights, selectedServerId]);

  // Dynamic Scoped Metrics
  const scopedMetrics = useMemo(() => {
    const totalApps = scopedApps.length;
    const totalContainers = scopedApps.reduce((acc, a) => acc + (a.component_count || 1), 0);
    const suitesCount = scopedApps.filter((a) => a.is_suite).length;
    const onlineApps = scopedApps.filter((a) => a.health_status === 'ONLINE').length;
    const degradedApps = scopedApps.filter((a) => a.health_status === 'DEGRADED').length;
    const offlineApps = scopedApps.filter((a) => a.health_status === 'OFFLINE').length;
    const avgUptime =
      totalApps > 0
        ? (scopedApps.reduce((acc, a) => acc + (a.uptime_percent || 99.98), 0) / totalApps).toFixed(2)
        : '100.00';

    const dockerCount = scopedApps.filter(
      (a) => a.is_suite || (a.process_manager && a.process_manager.toLowerCase().includes('docker'))
    ).length;
    const apacheCount = scopedApps.filter(
      (a) => !a.is_suite && a.process_manager && a.process_manager.toLowerCase().includes('apache')
    ).length;
    const nginxCount = scopedApps.filter(
      (a) => !a.is_suite && a.process_manager && a.process_manager.toLowerCase().includes('nginx')
    ).length;

    const gitTracked = scopedApps.filter((a) => Boolean(a.current_commit)).length;
    const gitUntracked = totalApps - gitTracked;
    const gitUpdates = scopedApps.filter((a) => Boolean(a.has_git_update)).length;

    const totalDomains = scopedDomains.length;
    const dnsMatching = scopedDomains.filter((d) => d.dns_matches_server === true).length;
    const dnsMismatch = scopedDomains.filter((d) => d.dns_matches_server === false).length;
    const dnsUnresolved = scopedDomains.filter((d) => !d.resolved_ip).length;

    const sslValid = scopedDomains.filter(
      (d) => d.ssl_status === 'VALID' && (d.days_remaining ?? 60) > 30
    ).length;
    const sslExpiring = scopedDomains.filter(
      (d) => (d.days_remaining ?? 60) > 0 && (d.days_remaining ?? 60) <= 30
    ).length;
    const sslExpiredOrNone = scopedDomains.filter(
      (d) => d.ssl_status === 'NONE' || d.ssl_status === 'EXPIRED' || (d.days_remaining ?? 0) <= 0
    ).length;

    const uniquePorts = Array.from(new Set(scopedApps.map((a) => a.port).filter(Boolean))).sort(
      (a: any, b: any) => a - b
    );

    return {
      totalApps,
      totalContainers,
      suitesCount,
      onlineApps,
      degradedApps,
      offlineApps,
      avgUptime,
      dockerCount,
      apacheCount,
      nginxCount,
      gitTracked,
      gitUntracked,
      gitUpdates,
      totalDomains,
      dnsMatching,
      dnsMismatch,
      dnsUnresolved,
      sslValid,
      sslExpiring,
      sslExpiredOrNone,
      uniquePorts,
    };
  }, [scopedApps, scopedDomains]);

  // Filtered Applications for the Comprehensive Insights Matrix
  const filteredMatrixApps = useMemo(() => {
    return scopedApps.filter((app) => {
      if (insightFilter === 'ATTENTION') {
        const hasIssue =
          app.health_status === 'OFFLINE' ||
          app.health_status === 'DEGRADED' ||
          app.dns_matches_server === false ||
          (app.ssl_days_remaining !== undefined && app.ssl_days_remaining <= 30) ||
          app.ssl_status === 'NONE' ||
          app.ssl_status === 'EXPIRED';
        if (!hasIssue) return false;
      } else if (insightFilter === 'SUITES') {
        if (!app.is_suite) return false;
      } else if (insightFilter === 'WEB_VHOSTS') {
        if (app.is_suite) return false;
      } else if (insightFilter === 'GIT_TRACKED') {
        if (!app.current_commit) return false;
      } else if (insightFilter === 'GIT_UPDATES') {
        if (!app.has_git_update) return false;
      } else if (insightFilter === 'DNS_MISMATCH') {
        if (app.dns_matches_server !== false) return false;
      } else if (insightFilter === 'SSL_WARNING') {
        const sslWarn =
          (app.ssl_days_remaining !== undefined && app.ssl_days_remaining <= 30) ||
          app.ssl_status === 'NONE' ||
          app.ssl_status === 'EXPIRED';
        if (!sslWarn) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const match =
          (app.name || '').toLowerCase().includes(q) ||
          (app.domain || '').toLowerCase().includes(q) ||
          (app.server_name || '').toLowerCase().includes(q) ||
          (app.server_ip || '').toLowerCase().includes(q) ||
          (app.resolved_ip || '').toLowerCase().includes(q) ||
          (app.process_manager || '').toLowerCase().includes(q) ||
          (app.current_commit || '').toLowerCase().includes(q) ||
          String(app.port || '').includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [scopedApps, insightFilter, searchQuery]);

  // Attention lists for Radar cards
  const unhealthyApps = useMemo(
    () => scopedApps.filter((a) => a.health_status === 'OFFLINE' || a.health_status === 'DEGRADED'),
    [scopedApps]
  );

  const attentionDomains = useMemo(
    () =>
      scopedDomains.filter(
        (d) =>
          d.dns_matches_server === false ||
          !d.resolved_ip ||
          (d.days_remaining !== undefined && d.days_remaining <= 30) ||
          d.ssl_status === 'NONE' ||
          d.ssl_status === 'EXPIRED'
      ),
    [scopedDomains]
  );

  const appsWithGitUpdates = useMemo(
    () => scopedApps.filter((a) => Boolean(a.has_git_update)),
    [scopedApps]
  );

  if (loading && !data) {
    return (
      <div className="p-4 sm:p-6 md:p-8 space-y-6 w-full max-w-full overflow-x-hidden">
        <div className="h-8 w-48 bg-slate-800 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <SkeletonLoader key={i} variant="card" />
          ))}
        </div>
      </div>
    );
  }

  const srvs = data?.servers || { total: 0, online: 0, offline: 0 };
  const deps = data?.deployments || { today: 0, failed: 0, recent: [] };
  const alerts = data?.active_alerts || [];
  const incidents = data?.incidents || [];
  const portCollisions: any[] = data?.applications?.ports?.collisions || [];

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 text-xs font-medium shadow-lg ${
            toastMessage.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-700/80 text-emerald-200'
              : toastMessage.type === 'error'
              ? 'bg-rose-950/90 border-rose-700/80 text-rose-200'
              : 'bg-sky-950/90 border-sky-700/80 text-sky-200'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 size={15} className="shrink-0" />
            <span className="truncate">{toastMessage.text}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white text-xs px-2 shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top Banner & Global Operations Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-slate-800">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2 flex-wrap">
            <span>Central Infrastructure Command Center</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-wider bg-brand-950 text-brand-300 border border-brand-800 whitespace-nowrap shrink-0">
              LIVE INSIGHTS HUB
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Unified real-time intelligence across multi-VPS nodes, consolidated Docker suites, live DNS IP resolution vs hosting server IP, SSL certificates, Git repositories, and AI remediation.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="h-8 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={`shrink-0 ${refreshing ? 'animate-spin text-brand-400' : ''}`} />
            <span className="whitespace-nowrap">Refresh Telemetry</span>
          </button>

          <button
            onClick={handleSyncAllGit}
            disabled={syncingGit}
            className="h-8 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-50"
            title="Scan all VPS nodes and match each site to its exact Git repository"
          >
            <GitBranch size={13} className={`shrink-0 text-brand-400 ${syncingGit ? 'animate-spin' : ''}`} />
            <span className="whitespace-nowrap">{syncingGit ? 'Syncing Git...' : 'Sync Git Repos'}</span>
          </button>

          <button
            onClick={handleVerifyAllDns}
            disabled={verifyingDns}
            className="h-8 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-50"
            title="Resolve live DNS A/CNAME records for all domains and compare against Hosting Server IP"
          >
            <Network size={13} className={`shrink-0 text-sky-400 ${verifyingDns ? 'animate-spin' : ''}`} />
            <span className="whitespace-nowrap">{verifyingDns ? 'Verifying DNS...' : 'Verify All DNS & SSL'}</span>
          </button>

          <button
            onClick={handleExportSystemBackup}
            disabled={exportingBackup}
            className="h-8 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-white text-xs font-medium inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors disabled:opacity-50"
            title="Download a complete JSON snapshot of all HQ servers, apps, domains, and settings"
          >
            <Download size={13} className="shrink-0 text-emerald-400" />
            <span className="whitespace-nowrap">{exportingBackup ? 'Exporting...' : 'Export HQ Snapshot'}</span>
          </button>

          <button
            onClick={() => onNavigate('deployments')}
            className="h-8 px-3.5 rounded-lg bg-brand-600 hover:bg-brand-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-sm transition-colors"
          >
            <Rocket size={13} className="shrink-0" />
            <span className="whitespace-nowrap">Deploy Pipeline</span>
          </button>
        </div>
      </div>

      {/* VPS Cluster Fleet & Scope Filter Cards */}
      {serverNodes.length > 0 && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
            <div className="flex items-center gap-2 flex-wrap">
              <Server size={15} className="text-brand-400 shrink-0" />
              <span className="text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap">
                VPS Infrastructure Nodes & Cluster Scope
              </span>
              <span className="text-[11px] text-slate-400">
                Click any server card to filter all Overview KPIs, DNS/SSL radars, and Application Insights to that node
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {selectedServerId !== 'all' && (
                <button
                  onClick={() => setSelectedServerId('all')}
                  className="h-7 px-2.5 rounded-lg bg-brand-950/90 hover:bg-brand-900 text-brand-300 border border-brand-800 text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                >
                  <span>Show All Nodes ({serverNodes.length})</span>
                  <span>&times;</span>
                </button>
              )}
              <button
                onClick={() => onNavigate('servers')}
                className="text-xs text-brand-400 hover:text-brand-300 font-medium inline-flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <span>Manage Servers</span>
                <ChevronRight size={13} />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {serverNodes.map((node) => {
              const isSelected = selectedServerId === node.id;
              const isOnline = node.status === 'ONLINE';
              return (
                <div
                  key={node.id}
                  onClick={() => setSelectedServerId(isSelected ? 'all' : node.id)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-3 ${
                    isSelected
                      ? 'bg-brand-950/30 border-brand-500 ring-1 ring-brand-500/50 shadow-md'
                      : 'bg-slate-950/90 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-white text-xs truncate">{node.name}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase whitespace-nowrap shrink-0 ${
                            isOnline
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-rose-950 text-rose-400 border border-rose-800'
                          }`}
                        >
                          {node.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-brand-300 font-mono mt-0.5 flex items-center gap-2">
                        <span>{node.public_ip}</span>
                        <span className="text-slate-600">•</span>
                        <span className="text-slate-400 truncate">{node.os_name}</span>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigate('servers', node.id);
                      }}
                      className="h-7 px-2 rounded-md bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-[10px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                      title="Open Server Detail & SSH Terminal"
                    >
                      <span>Server Page</span>
                      <ChevronRight size={11} />
                    </button>
                  </div>

                  {/* CPU / RAM / Disk Telemetry Bars */}
                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <div className="p-1.5 rounded bg-slate-900 border border-slate-800/80">
                      <div className="flex items-center justify-between text-slate-400">
                        <span>CPU</span>
                        <span className="font-mono font-bold text-slate-200">{node.cpu_usage}%</span>
                      </div>
                      <div className="w-full bg-slate-950 h-1 rounded-full mt-1 overflow-hidden">
                        <div
                          className={`h-full ${node.cpu_usage > 85 ? 'bg-rose-500' : 'bg-brand-500'}`}
                          style={{ width: `${Math.min(100, node.cpu_usage || 8)}%` }}
                        />
                      </div>
                    </div>
                    <div className="p-1.5 rounded bg-slate-900 border border-slate-800/80">
                      <div className="flex items-center justify-between text-slate-400">
                        <span>RAM</span>
                        <span className="font-mono font-bold text-slate-200">{node.ram_usage}%</span>
                      </div>
                      <div className="w-full bg-slate-950 h-1 rounded-full mt-1 overflow-hidden">
                        <div
                          className={`h-full ${node.ram_usage > 85 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(100, node.ram_usage || 24)}%` }}
                        />
                      </div>
                    </div>
                    <div className="p-1.5 rounded bg-slate-900 border border-slate-800/80">
                      <div className="flex items-center justify-between text-slate-400">
                        <span>DISK</span>
                        <span className="font-mono font-bold text-slate-200">{node.disk_usage}%</span>
                      </div>
                      <div className="w-full bg-slate-950 h-1 rounded-full mt-1 overflow-hidden">
                        <div
                          className={`h-full ${node.disk_usage > 85 ? 'bg-rose-500' : 'bg-sky-500'}`}
                          style={{ width: `${Math.min(100, node.disk_usage || 32)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Node Hosted Inventory Badges */}
                  <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-800/80 text-[11px] flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-slate-300 font-medium whitespace-nowrap">
                        <strong className="text-white font-mono">{node.apps_count}</strong> Apps ({node.containers_count} Services)
                      </span>
                      <span className="text-slate-600">•</span>
                      <span className="text-slate-300 font-medium whitespace-nowrap">
                        <strong className="text-white font-mono">{node.domains_count}</strong> Domains
                      </span>
                      <span className="text-slate-600">•</span>
                      <span className="text-brand-300 font-medium whitespace-nowrap">
                        <strong className="font-mono">{node.git_tracked_apps}</strong> Git Repos
                      </span>
                    </div>

                    {node.error_apps > 0 ? (
                      <span className="px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 text-[10px] font-bold whitespace-nowrap shrink-0">
                        {node.error_apps} Outage
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 text-[10px] font-semibold whitespace-nowrap shrink-0">
                        100% Online
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 6-Card Comprehensive Executive KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* KPI 1: Consolidated Applications & Docker Suites */}
        <div
          onClick={() => onNavigate('applications')}
          className="p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all space-y-3 group shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="font-bold uppercase tracking-wider text-[11px] text-slate-400">
              Applications & Microservices
            </span>
            <div className="p-2 rounded-lg bg-brand-950/80 border border-brand-800/80 text-brand-400">
              <Layers size={15} />
            </div>
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className="text-2xl font-bold text-white mono">{scopedMetrics.totalApps}</div>
              <div className="text-xs text-slate-400">
                Unified Apps & Suites ({scopedMetrics.totalContainers} Total Services)
              </div>
            </div>
            <div className="text-right text-xs font-mono">
              <div className="text-brand-300 font-semibold">{scopedMetrics.suitesCount} Docker Suites</div>
              <div className="text-slate-400">{scopedMetrics.totalApps - scopedMetrics.suitesCount} Standalone</div>
            </div>
          </div>

          <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs flex-wrap">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="flex items-center gap-1 text-emerald-400 font-semibold whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> {scopedMetrics.onlineApps} Online
              </span>
              {scopedMetrics.degradedApps > 0 && (
                <span className="flex items-center gap-1 text-amber-400 font-semibold whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> {scopedMetrics.degradedApps} Degraded
                </span>
              )}
              {scopedMetrics.offlineApps > 0 && (
                <span className="flex items-center gap-1 text-rose-400 font-semibold whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-400" /> {scopedMetrics.offlineApps} Offline
                </span>
              )}
            </div>
            <span className="text-[11px] text-brand-400 group-hover:underline inline-flex items-center gap-0.5 whitespace-nowrap">
              <span>Open Inventory</span>
              <ChevronRight size={12} />
            </span>
          </div>
        </div>

        {/* KPI 2: Domains & Live Resolving DNS IP vs Hosting Server IP */}
        <div
          onClick={() => onNavigate('domains')}
          className="p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all space-y-3 group shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="font-bold uppercase tracking-wider text-[11px] text-slate-400">
              Domains & Live DNS Resolution
            </span>
            <div className="p-2 rounded-lg bg-sky-950/80 border border-sky-800/80 text-sky-400">
              <Globe size={15} />
            </div>
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className="text-2xl font-bold text-white mono">{scopedMetrics.totalDomains}</div>
              <div className="text-xs text-slate-400">Active VirtualHosts & Routing Domains</div>
            </div>
            <div className="text-right text-xs font-mono">
              <div className="text-emerald-400 font-semibold">{scopedMetrics.dnsMatching} IP Match</div>
              <div className="text-amber-400">{scopedMetrics.dnsMismatch} External / Proxy</div>
            </div>
          </div>

          <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 text-[10px] font-mono whitespace-nowrap">
                {scopedMetrics.dnsMatching} Direct Server IP
              </span>
              {scopedMetrics.dnsMismatch > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800/80 text-[10px] font-mono whitespace-nowrap">
                  {scopedMetrics.dnsMismatch} Differs from Host IP
                </span>
              )}
              {scopedMetrics.dnsUnresolved > 0 && (
                <span className="px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800/80 text-[10px] font-mono whitespace-nowrap">
                  {scopedMetrics.dnsUnresolved} Unresolved
                </span>
              )}
            </div>
            <span className="text-[11px] text-brand-400 group-hover:underline inline-flex items-center gap-0.5 whitespace-nowrap">
              <span>Domains & DNS</span>
              <ChevronRight size={12} />
            </span>
          </div>
        </div>

        {/* KPI 3: SSL Certificate Health & Expiry Radar */}
        <div
          onClick={() => onNavigate('domains')}
          className="p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all space-y-3 group shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="font-bold uppercase tracking-wider text-[11px] text-slate-400">
              SSL Certificates & TLS Security
            </span>
            <div className="p-2 rounded-lg bg-emerald-950/80 border border-emerald-800/80 text-emerald-400">
              <ShieldCheck size={15} />
            </div>
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className="text-2xl font-bold text-emerald-400 mono">{scopedMetrics.sslValid}</div>
              <div className="text-xs text-slate-400">Valid Let&apos;s Encrypt / TLS Certificates</div>
            </div>
            <div className="text-right text-xs font-mono">
              <div className={scopedMetrics.sslExpiring > 0 ? 'text-amber-400 font-bold' : 'text-slate-400'}>
                {scopedMetrics.sslExpiring} Expiring &lt;30d
              </div>
              <div className={scopedMetrics.sslExpiredOrNone > 0 ? 'text-rose-400 font-bold' : 'text-slate-500'}>
                {scopedMetrics.sslExpiredOrNone} No SSL / Expired
              </div>
            </div>
          </div>

          <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs flex-wrap">
            <span className="text-slate-400">
              Auto-renewals via Certbot &bull; 1-Click SSL provisioning
            </span>
            <span className="text-[11px] text-brand-400 group-hover:underline inline-flex items-center gap-0.5 whitespace-nowrap">
              <span>Manage SSL</span>
              <ChevronRight size={12} />
            </span>
          </div>
        </div>

        {/* KPI 4: Git Repositories & Per-Site Commit Tracking */}
        <div
          onClick={() => onNavigate('git')}
          className="p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all space-y-3 group shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="font-bold uppercase tracking-wider text-[11px] text-slate-400">
              Git Repositories & Code Sync
            </span>
            <div className="p-2 rounded-lg bg-purple-950/80 border border-purple-800/80 text-purple-400">
              <GitBranch size={15} />
            </div>
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className="text-2xl font-bold text-white mono">{scopedMetrics.gitTracked}</div>
              <div className="text-xs text-slate-400">Git-Tracked Applications & Suites</div>
            </div>
            <div className="text-right text-xs font-mono">
              <div className={scopedMetrics.gitUpdates > 0 ? 'text-amber-400 font-bold' : 'text-emerald-400'}>
                {scopedMetrics.gitUpdates} Updates Available
              </div>
              <div className="text-slate-400">{scopedMetrics.gitUntracked} Static / No Repo</div>
            </div>
          </div>

          <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs flex-wrap">
            <span className="text-slate-400">
              Strict per-site DocumentRoot & container repo matching
            </span>
            <span className="text-[11px] text-brand-400 group-hover:underline inline-flex items-center gap-0.5 whitespace-nowrap">
              <span>Git Control</span>
              <ChevronRight size={12} />
            </span>
          </div>
        </div>

        {/* KPI 5: Process Stacks & Port Allocation Safety */}
        <div
          onClick={() => onNavigate('topology')}
          className="p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all space-y-3 group shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="font-bold uppercase tracking-wider text-[11px] text-slate-400">
              Process Runtimes & Port Safety
            </span>
            <div className="p-2 rounded-lg bg-indigo-950/80 border border-indigo-800/80 text-indigo-400">
              <Cpu size={15} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-1.5 rounded-lg bg-slate-950 border border-slate-800">
              <div className="text-sm font-bold text-brand-400 mono">{scopedMetrics.dockerCount}</div>
              <div className="text-[10px] text-slate-400">Docker</div>
            </div>
            <div className="p-1.5 rounded-lg bg-slate-950 border border-slate-800">
              <div className="text-sm font-bold text-amber-400 mono">{scopedMetrics.apacheCount}</div>
              <div className="text-[10px] text-slate-400">Apache2</div>
            </div>
            <div className="p-1.5 rounded-lg bg-slate-950 border border-slate-800">
              <div className="text-sm font-bold text-teal-400 mono">{scopedMetrics.nginxCount}</div>
              <div className="text-[10px] text-slate-400">Nginx</div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs flex-wrap">
            <span className="text-slate-300 font-mono text-[11px]">
              {scopedMetrics.uniquePorts.length} Active Ports Bound
            </span>
            {portCollisions.length > 0 ? (
              <span className="px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800 text-[10px] font-bold whitespace-nowrap">
                {portCollisions.length} Port Conflict
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-bold whitespace-nowrap">
                0 Port Conflicts
              </span>
            )}
          </div>
        </div>

        {/* KPI 6: Cluster SLA Reliability & Persistent Storage Protection */}
        <div
          onClick={() => onNavigate('backups')}
          className="p-4 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all space-y-3 group shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="font-bold uppercase tracking-wider text-[11px] text-slate-400">
              Cluster SLA & Data Persistence
            </span>
            <div className="p-2 rounded-lg bg-teal-950/80 border border-teal-800/80 text-teal-400">
              <Database size={15} />
            </div>
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className="text-2xl font-bold text-emerald-400 mono">{scopedMetrics.avgUptime}%</div>
              <div className="text-xs text-slate-400">Weighted 30-Day Cluster Reliability</div>
            </div>
            <div className="text-right text-xs font-mono">
              <div className="text-emerald-400 font-semibold">{srvs.online}/{srvs.total} Nodes Up</div>
              <div className="text-sky-300">Volumes Protected</div>
            </div>
          </div>

          <div className="pt-2.5 border-t border-slate-800/80 flex items-center justify-between gap-2 text-xs flex-wrap">
            <span className="text-slate-400">
              Persistent Docker Volumes &bull; 365d Auth Session
            </span>
            <span className="text-[11px] text-brand-400 group-hover:underline inline-flex items-center gap-0.5 whitespace-nowrap">
              <span>Backups Hub</span>
              <ChevronRight size={12} />
            </span>
          </div>
        </div>
      </div>

      {/* Actionable Diagnostic Radar: Outages / DNS & SSL Mismatches / Git Updates */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Radar 1: Application Outages & 1-Click AI Remediation */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between space-y-3 shadow-sm">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2 min-w-0">
              <ShieldAlert
                size={15}
                className={unhealthyApps.length > 0 ? 'text-rose-400 shrink-0' : 'text-emerald-400 shrink-0'}
              />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider truncate">
                App Outages & AI Auto-Fix ({unhealthyApps.length})
              </h3>
            </div>
            <button
              onClick={() => setInsightFilter(insightFilter === 'ATTENTION' ? 'ALL' : 'ATTENTION')}
              className="text-[11px] text-brand-400 hover:text-brand-300 font-medium whitespace-nowrap shrink-0"
            >
              {insightFilter === 'ATTENTION' ? 'Show All' : 'Filter Table'}
            </button>
          </div>

          {unhealthyApps.length === 0 ? (
            <div className="py-6 text-center space-y-1.5">
              <CheckCircle2 size={22} className="text-emerald-400 mx-auto" />
              <div className="text-xs font-semibold text-emerald-400">All {scopedMetrics.totalApps} Applications Online</div>
              <p className="text-[11px] text-slate-400">
                Every Docker suite, container, and web daemon is responding within SLA thresholds.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {unhealthyApps.map((app) => (
                <div
                  key={app.id}
                  className="p-2.5 rounded-lg bg-rose-950/30 border border-rose-800/70 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white truncate">{app.name}</span>
                      <StatusBadge status={app.health_status} size="sm" />
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                      {app.server_name} ({app.server_ip}) &bull; :{app.port}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleInvestigateAppOutage(app)}
                      className="h-7 px-2 rounded bg-rose-900/90 hover:bg-rose-800 text-rose-100 border border-rose-700 text-[10px] font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                    >
                      <Sparkles size={10} className="shrink-0" />
                      <span>Fix with AI</span>
                    </button>
                    <button
                      onClick={() => onNavigate('applications', app.id)}
                      className="h-7 px-2 rounded bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-[10px] font-semibold whitespace-nowrap shrink-0"
                    >
                      Open
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Radar 2: DNS IP Mismatch & SSL Expiry Radar */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between space-y-3 shadow-sm">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2 min-w-0">
              <Network size={15} className="text-amber-400 shrink-0" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider truncate">
                DNS IP Mismatch & SSL Alerts ({attentionDomains.length})
              </h3>
            </div>
            <button
              onClick={() => onNavigate('domains')}
              className="text-[11px] text-brand-400 hover:text-brand-300 font-medium whitespace-nowrap shrink-0"
            >
              Open Domains
            </button>
          </div>

          {attentionDomains.length === 0 ? (
            <div className="py-6 text-center space-y-1.5">
              <ShieldCheck size={22} className="text-emerald-400 mx-auto" />
              <div className="text-xs font-semibold text-emerald-400">All Domains & SSL Certificates Healthy</div>
              <p className="text-[11px] text-slate-400">
                All domains resolve to their expected server IPs with valid TLS certificates.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {attentionDomains.slice(0, 8).map((dom) => {
                const isDnsDiff = dom.dns_matches_server === false;
                const isUnresolved = !dom.resolved_ip;
                const isSslWarn = (dom.days_remaining ?? 60) <= 30 || dom.ssl_status === 'NONE' || dom.ssl_status === 'EXPIRED';
                return (
                  <div
                    key={dom.id}
                    onClick={() => onNavigate('domains', dom.id)}
                    className="p-2.5 rounded-lg bg-slate-950 hover:bg-slate-800/70 border border-slate-800 cursor-pointer transition-colors flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-white font-mono truncate">{dom.domain_name}</span>
                        {isDnsDiff && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800 text-[9px] font-bold whitespace-nowrap">
                            DNS ≠ HOST IP
                          </span>
                        )}
                        {isUnresolved && (
                          <span className="px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800 text-[9px] font-bold whitespace-nowrap">
                            NXDOMAIN
                          </span>
                        )}
                        {isSslWarn && (
                          <span className="px-1.5 py-0.2 rounded bg-rose-950 text-rose-300 border border-rose-800 text-[9px] font-bold whitespace-nowrap">
                            SSL: {dom.days_remaining}d
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                        Host: <span className="text-slate-200">{dom.server_ip || 'N/A'}</span> &rarr; Ping:{' '}
                        <span className={isDnsDiff ? 'text-amber-300 font-semibold' : 'text-emerald-400'}>
                          {dom.resolved_ip || 'Unresolved'}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigate('domains', dom.id);
                      }}
                      className="h-7 px-2 rounded bg-slate-900 hover:bg-brand-600 text-slate-200 hover:text-white border border-slate-700 text-[10px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
                    >
                      <Wrench size={10} className="shrink-0" />
                      <span>Diagnose</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Radar 3: Pending Git Updates & Recent Releases */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between space-y-3 shadow-sm">
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2 min-w-0">
              <GitBranch size={15} className="text-brand-400 shrink-0" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider truncate">
                Git Updates & Release Stream ({appsWithGitUpdates.length})
              </h3>
            </div>
            <button
              onClick={() => onNavigate('git')}
              className="text-[11px] text-brand-400 hover:text-brand-300 font-medium whitespace-nowrap shrink-0"
            >
              Git Hub
            </button>
          </div>

          {appsWithGitUpdates.length > 0 ? (
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {appsWithGitUpdates.slice(0, 6).map((app) => (
                <div
                  key={app.id}
                  onClick={() => onNavigate('applications', app.id)}
                  className="p-2.5 rounded-lg bg-slate-950 hover:bg-slate-800/70 border border-slate-800 cursor-pointer transition-colors flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold text-white truncate">{app.name}</span>
                      <span className="px-1.5 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800 text-[9px] font-bold whitespace-nowrap">
                        UPDATE READY
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                      {app.git_branch || 'main'}: <span className="text-slate-300">{app.current_commit?.slice(0, 7)}</span> &rarr;{' '}
                      <span className="text-emerald-400 font-semibold">{app.latest_repo_commit?.slice(0, 7)}</span>
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onNavigate('applications', app.id);
                    }}
                    className="h-7 px-2 rounded bg-brand-600/90 hover:bg-brand-500 text-white text-[10px] font-semibold whitespace-nowrap shrink-0"
                  >
                    Pull &amp; Deploy
                  </button>
                </div>
              ))}
            </div>
          ) : deps.recent.length > 0 ? (
            <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
              {deps.recent.slice(0, 5).map((d: any) => (
                <div
                  key={d.id}
                  onClick={() => onNavigate('deployments')}
                  className="p-2.5 rounded-lg bg-slate-950 hover:bg-slate-800/70 border border-slate-800 cursor-pointer transition-colors flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-brand-400 font-bold px-1.5 py-0.2 bg-brand-950 rounded border border-brand-800">
                        {(d.commit_hash || 'HEAD').slice(0, 7)}
                      </span>
                      <span className="text-xs font-medium text-slate-200 truncate">{d.commit_message}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      By <span className="text-slate-300">{d.deployed_by}</span> &bull; {new Date(d.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <StatusBadge status={d.status} size="sm" />
                </div>
              ))}
            </div>
          ) : (
            <div className="py-6 text-center text-slate-500 text-xs">
              All tracked Git repositories are synchronized with their remote branches.
            </div>
          )}
        </div>
      </div>

      {/* COMPREHENSIVE APPLICATION INSIGHTS & TELEMETRY MATRIX */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4 shadow-sm w-full">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2 flex-wrap">
              <Layers size={17} className="text-brand-400 shrink-0" />
              <span>Comprehensive Application &amp; Domain Insights Matrix</span>
              <span className="px-2 py-0.5 rounded bg-slate-950 text-brand-300 border border-slate-800 text-xs font-mono">
                {filteredMatrixApps.length} / {scopedApps.length} Apps
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Complete cross-stack visibility for every application: Hosting Server IP, Live Resolving DNS IP, SSL Expiry, Runtime Port, Per-Site Git Commit, and Health Status. Click any row to open its full management page.
            </p>
          </div>

          {/* Search Input */}
          <div className="relative w-full lg:w-72 shrink-0">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search app, domain, IP, commit, port..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500"
            />
          </div>
        </div>

        {/* Interactive Insight Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { id: 'ALL', label: `All Apps (${scopedApps.length})` },
            {
              id: 'ATTENTION',
              label: `Attention Needed (${
                scopedApps.filter(
                  (a) =>
                    a.health_status !== 'ONLINE' ||
                    a.dns_matches_server === false ||
                    (a.ssl_days_remaining !== undefined && a.ssl_days_remaining <= 30) ||
                    a.ssl_status === 'NONE'
                ).length
              })`,
            },
            { id: 'SUITES', label: `Docker Suites (${scopedMetrics.suitesCount})` },
            { id: 'WEB_VHOSTS', label: `Apache / Nginx (${scopedMetrics.apacheCount + scopedMetrics.nginxCount})` },
            { id: 'GIT_TRACKED', label: `Git Tracked (${scopedMetrics.gitTracked})` },
            { id: 'GIT_UPDATES', label: `Git Updates (${scopedMetrics.gitUpdates})` },
            {
              id: 'DNS_MISMATCH',
              label: `DNS IP Differs (${scopedApps.filter((a) => a.dns_matches_server === false).length})`,
            },
            {
              id: 'SSL_WARNING',
              label: `SSL Warning (${
                scopedApps.filter(
                  (a) =>
                    (a.ssl_days_remaining !== undefined && a.ssl_days_remaining <= 30) ||
                    a.ssl_status === 'NONE' ||
                    a.ssl_status === 'EXPIRED'
                ).length
              })`,
            },
          ].map((pill) => {
            const active = insightFilter === pill.id;
            return (
              <button
                key={pill.id}
                onClick={() => setInsightFilter(pill.id as any)}
                className={`h-7 px-2.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 border ${
                  active
                    ? 'bg-brand-600 text-white border-brand-500 shadow-sm'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                {pill.label}
              </button>
            );
          })}
        </div>

        {/* Full-Width Zero-Horizontal-Scroll Insights Table */}
        <div className="rounded-xl border border-slate-800 overflow-hidden w-full">
          <table className="w-full table-fixed text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                <th className="py-3 px-3 w-[23%] whitespace-nowrap">Application &amp; Domain</th>
                <th className="py-3 px-2.5 w-[18%] whitespace-nowrap">Hosting Server &amp; Runtime</th>
                <th className="py-3 px-2.5 w-[18%] whitespace-nowrap">Resolving DNS / Ping IP</th>
                <th className="py-3 px-2.5 w-[12%] whitespace-nowrap">SSL &amp; Expiry</th>
                <th className="py-3 px-2.5 w-[14%] whitespace-nowrap">Git Repo Head</th>
                <th className="py-3 px-3 w-[15%] text-right whitespace-nowrap">Health &amp; Page</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {filteredMatrixApps.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-slate-400">
                    No applications match the selected filter criteria.
                  </td>
                </tr>
              ) : (
                filteredMatrixApps.map((app) => {
                  const hasGit = Boolean(app.current_commit);
                  const isDnsMatch = app.dns_matches_server === true;
                  const isDnsDiff = app.dns_matches_server === false;
                  const sslDays = app.ssl_days_remaining ?? 60;

                  return (
                    <tr
                      key={app.id}
                      onClick={() => onNavigate('applications', app.id)}
                      className="hover:bg-slate-800/50 cursor-pointer transition-colors group"
                    >
                      {/* Col 1: App Name, Suite Badge, Domain */}
                      <td className="py-3 px-3 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-white group-hover:text-brand-400 transition-colors truncate">
                            {app.name}
                          </span>
                          {app.is_suite && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold bg-brand-950/90 text-brand-300 border border-brand-800 whitespace-nowrap shrink-0">
                              <Box size={10} className="shrink-0" />
                              <span>{app.component_count} Services</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-slate-400 font-mono text-[11px] mt-0.5 min-w-0">
                          <span className="truncate">{app.domain || `${app.service_name}.local`}</span>
                          {app.domain && !app.domain.endsWith('.local') && (
                            <a
                              href={`https://${app.domain}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-white shrink-0"
                            >
                              <ExternalLink size={10} />
                            </a>
                          )}
                        </div>
                      </td>

                      {/* Col 2: Hosting Server IP & Runtime */}
                      <td className="py-3 px-2.5 min-w-0">
                        <div className="font-medium text-slate-200 truncate">{app.server_name}</div>
                        <div className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                          {app.server_ip} &bull; {app.process_manager} (:{app.port})
                        </div>
                      </td>

                      {/* Col 3: Resolving DNS IP vs Hosting Server IP */}
                      <td className="py-3 px-2.5 min-w-0">
                        {app.resolved_ip ? (
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-semibold text-slate-200 text-[11px] whitespace-nowrap">
                                {app.resolved_ip}
                              </span>
                              {isDnsMatch ? (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 whitespace-nowrap shrink-0">
                                  MATCH
                                </span>
                              ) : isDnsDiff ? (
                                <span
                                  className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-950 text-amber-300 border border-amber-800 whitespace-nowrap shrink-0"
                                  title={`DNS resolves to ${app.resolved_ip}, which differs from Hosting Server IP ${app.server_ip}`}
                                >
                                  EXTERNAL IP
                                </span>
                              ) : null}
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                              {isDnsMatch ? 'Matches Hosting VPS' : `Host: ${app.server_ip}`}
                            </div>
                          </div>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-slate-950 text-slate-500 border border-slate-800 text-[10px] font-mono whitespace-nowrap">
                            {app.domain?.endsWith('.local') ? 'Internal Docker' : 'Unresolved'}
                          </span>
                        )}
                      </td>

                      {/* Col 4: SSL Certificate & Expiry */}
                      <td className="py-3 px-2.5 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <StatusBadge status={app.ssl_status || 'VALID'} size="sm" />
                        </div>
                        <div
                          className={`text-[10px] font-mono mt-0.5 whitespace-nowrap ${
                            sslDays <= 14
                              ? 'text-rose-400 font-bold'
                              : sslDays <= 30
                              ? 'text-amber-400 font-semibold'
                              : 'text-slate-400'
                          }`}
                        >
                          {sslDays > 0 ? `${sslDays}d remaining` : 'No active TLS'}
                        </div>
                      </td>

                      {/* Col 5: Per-Site Git Commit Head */}
                      <td className="py-3 px-2.5 min-w-0">
                        {hasGit ? (
                          <div>
                            <div className="inline-flex items-center gap-1 font-mono whitespace-nowrap">
                              <GitBranch size={11} className="text-brand-400 shrink-0" />
                              <span className="text-slate-300 text-[11px]">{app.git_branch || 'main'}</span>
                              <span className="px-1.5 py-0.2 rounded bg-slate-950 text-brand-400 border border-slate-800 text-[10px] font-semibold">
                                {app.current_commit.slice(0, 7)}
                              </span>
                            </div>
                            {app.has_git_update && (
                              <div className="text-[10px] text-amber-400 font-semibold mt-0.5 whitespace-nowrap">
                                Update Available
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-950 text-slate-500 border border-slate-800 text-[10px] font-mono whitespace-nowrap">
                            <GitBranch size={10} className="text-slate-600 shrink-0" />
                            <span>No Git Repo</span>
                          </span>
                        )}
                      </td>

                      {/* Col 6: Health Status & Full-Page Navigation Buttons */}
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <StatusBadge status={app.health_status} size="sm" />

                          {(app.health_status === 'OFFLINE' || app.health_status === 'DEGRADED') && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleInvestigateAppOutage(app);
                              }}
                              className="h-7 px-2 rounded bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-800 text-[10px] font-bold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                              title="Audit outage & fix with AI"
                            >
                              <Sparkles size={10} className="text-rose-400 shrink-0" />
                              <span>AI Fix</span>
                            </button>
                          )}

                          {app.domain_id && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onNavigate('domains', app.domain_id);
                              }}
                              className="h-7 px-2 rounded bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-[10px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                              title="Open Full-Page Domain & Website Troubleshooter"
                            >
                              <Globe size={10} className="text-sky-400 shrink-0" />
                              <span>Domain</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigate('applications', app.id);
                            }}
                            className="h-7 px-2.5 rounded bg-brand-600/90 hover:bg-brand-500 text-white text-[10px] font-semibold inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                          >
                            <span>Manage</span>
                            <ChevronRight size={11} className="shrink-0" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Split: Active System Alerts & Incident Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active System Alerts */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <span>Active System Alerts ({alerts.length})</span>
            </h3>
            <button
              onClick={() => onNavigate('alerts')}
              className="text-xs text-brand-400 hover:text-brand-300 font-medium flex items-center gap-1 whitespace-nowrap shrink-0"
            >
              <span>Manage Alerts</span>
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="space-y-2.5">
            {alerts.length === 0 ? (
              <div className="py-6 text-center text-slate-500 text-xs">
                No active system alerts. All nodes operating normally.
              </div>
            ) : (
              alerts.map((al: any) => (
                <div
                  key={al.id}
                  className="p-3 rounded-lg bg-slate-950 border border-slate-800/80 hover:border-slate-700 transition-colors flex items-start gap-3"
                >
                  <div className="shrink-0 mt-0.5">
                    {al.severity === 'CRITICAL' ? (
                      <XCircle size={16} className="text-rose-400" />
                    ) : (
                      <AlertTriangle size={16} className="text-amber-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-200 truncate">{al.rule_name}</span>
                      <span className="text-[10px] mono text-slate-400">
                        {new Date(al.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{al.message}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Incident History & Maintenance Bar */}
        <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between gap-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-slate-950 text-slate-400 border border-slate-800 shrink-0">
                <Clock size={16} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Incident Management &amp; Downtime Log</h3>
                <p className="text-[11px] text-slate-400">
                  {incidents.length === 0
                    ? '0 recorded incidents. All services operating normally within SLA.'
                    : `${incidents.length} recorded incidents across the past 30 days.`}
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigate('monitoring')}
              className="h-8 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium whitespace-nowrap shrink-0 transition-colors"
            >
              View Incident Timeline
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 pt-2 border-t border-slate-800/80 text-xs">
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
              <div className="text-slate-400 text-[11px]">Deployments Today</div>
              <div className="text-base font-bold text-white mono mt-0.5">
                {deps.today} ({deps.failed} failed)
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
              <div className="text-slate-400 text-[11px]">SSL Expiring &lt;30d</div>
              <div className="text-base font-bold text-amber-400 mono mt-0.5">
                {scopedMetrics.sslExpiring}
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800">
              <div className="text-slate-400 text-[11px]">Git Updates Ready</div>
              <div className="text-base font-bold text-brand-400 mono mt-0.5">
                {scopedMetrics.gitUpdates}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AI Command Audit & Auto-Fix Modal */}
      <CommandAuditModal
        isOpen={auditModalOpen}
        onClose={() => setAuditModalOpen(false)}
        executionData={auditExecutionData}
        onRunFix={async (fixCommand) => {
          if (auditExecutionData?.server_id) {
            const res = await api.executeTerminalCommand(auditExecutionData.server_id, fixCommand);
            await loadMetrics();
            return res;
          }
        }}
        onSuccess={loadMetrics}
      />
    </div>
  );
};
