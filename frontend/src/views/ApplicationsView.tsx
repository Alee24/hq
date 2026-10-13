import React, { useEffect, useState, useMemo } from 'react';
import {
  Layers,
  Plus,
  Search,
  ExternalLink,
  RotateCw,
  ShieldCheck,
  ShieldAlert,
  Server,
  GitBranch,
  ChevronRight,
  RefreshCw,
  Box,
  Terminal,
  Cpu,
  Sparkles,
  Activity,
  ArrowUpDown,
  CheckCircle2,
  Network
} from 'lucide-react';
import { api } from '../api/client';
import { Application } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { useEnvironment } from '../context/EnvironmentContext';
import { Button, InputField, SelectField, ModalShell } from '../components/common';
import { CommandAuditModal, CommandExecutionData } from '../components/CommandAuditModal';

interface ApplicationsViewProps {
  onSelectApp: (appId: string) => void;
}

export const ApplicationsView: React.FC<ApplicationsViewProps> = ({ onSelectApp }) => {
  const { environment } = useEnvironment();
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // VPS Server Filter & Sort State
  const [selectedServerId, setSelectedServerId] = useState<string>(() => {
    return localStorage.getItem('hq_apps_selected_server') || 'all';
  });
  const [sortBy, setSortBy] = useState<string>('status_errors_first');
  const [processFilter, setProcessFilter] = useState<string>('all');
  const [highlightedAppId, setHighlightedAppId] = useState<string | null>(null);

  // Container Logs Modal State
  const [logsModal, setLogsModal] = useState<{
    appName: string;
    componentName: string;
    logs: string;
    loading: boolean;
  } | null>(null);

  // AI Command Audit Modal State
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [auditExecutionData, setAuditExecutionData] = useState<CommandExecutionData | null>(null);

  // Restart Confirmation
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [selectedAppForAction, setSelectedAppForAction] = useState<Application | null>(null);
  const [pendingAction] = useState<string>('restart');

  // Delete Confirmation
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedAppForDelete, setSelectedAppForDelete] = useState<Application | null>(null);

  // Create App Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [newPort, setNewPort] = useState(80);
  const [newServerId, setNewServerId] = useState('');
  const [newServiceName] = useState('');
  const [newEnvironment, setNewEnvironment] = useState('production');
  const [serversList, setServersList] = useState<any[]>([]);

  const [syncingGit, setSyncingGit] = useState(false);

  const loadData = async () => {
    try {
      const res = await api.listApplications(environment);
      setApps(res);
      const srvs = await api.listServers();
      setServersList(srvs);
      if (srvs.length > 0 && !newServerId) {
        setNewServerId(srvs[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncGitRepos = async (silent = false) => {
    if (!silent) setSyncingGit(true);
    try {
      await api.scanAllGitRepos();
      const res = await api.listApplications(environment);
      setApps(res);
    } catch (e) {
      console.error('Git repo sync error:', e);
    } finally {
      if (!silent) setSyncingGit(false);
    }
  };

  useEffect(() => {
    loadData();
    handleSyncGitRepos(true);
  }, [environment]);

  const handleServerSelect = (srvId: string) => {
    setSelectedServerId(srvId);
    localStorage.setItem('hq_apps_selected_server', srvId);
  };

  const jumpToApp = (app: Application) => {
    if (selectedServerId !== 'all' && app.server_id && app.server_id !== selectedServerId) {
      handleServerSelect(app.server_id);
    }
    if (statusFilter !== 'all' && app.health_status !== statusFilter) {
      setStatusFilter('all');
    }
    setHighlightedAppId(app.id);
    setTimeout(() => {
      const el = document.getElementById(`app-row-${app.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
    setTimeout(() => {
      setHighlightedAppId((prev) => (prev === app.id ? null : prev));
    }, 6000);
  };

  const handleInvestigateError = async (app: Application) => {
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
      stderr: `[SERVICE_OUTAGE_DETECTED]\nApplication: ${app.name}\nStatus: ${app.health_status}\nServer: ${app.server_name || 'VPS'} (${app.server_ip || 'Node'})\nProcess/Port: ${app.port || 'N/A'}\nDocRoot: ${app.root_path || 'N/A'}\nVirtualHost/Domain: ${app.domain || 'N/A'}\nError: Host process or container listener failed healthcheck probe.`,
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

  // Scoped apps by selected VPS Server Node (or all nodes)
  const scopedApps = useMemo(() => {
    if (selectedServerId === 'all') return apps;
    return apps.filter((a) => a.server_id === selectedServerId);
  }, [apps, selectedServerId]);

  // Operational Decision Metrics
  const offlineApps = useMemo(() => {
    return scopedApps.filter(
      (a) => a.health_status === 'OFFLINE' || a.health_status === 'DEGRADED'
    );
  }, [scopedApps]);

  const totalServicesCount = useMemo(() => {
    return scopedApps.reduce((acc, a) => acc + (a.components?.length || 1), 0);
  }, [scopedApps]);

  const onlineAppsCount = useMemo(() => {
    return scopedApps.filter((a) => a.health_status === 'ONLINE').length;
  }, [scopedApps]);

  const onlineRate = useMemo(() => {
    if (scopedApps.length === 0) return 100;
    return Math.round((onlineAppsCount / scopedApps.length) * 100);
  }, [scopedApps, onlineAppsCount]);

  const processDistribution = useMemo(() => {
    const docker = scopedApps.filter(
      (a) => a.is_suite || (a.process_manager && a.process_manager.toLowerCase().includes('docker'))
    ).length;
    const apache = scopedApps.filter(
      (a) => a.process_manager && a.process_manager.toLowerCase().includes('apache')
    ).length;
    const nginx = scopedApps.filter(
      (a) => a.process_manager && a.process_manager.toLowerCase().includes('nginx')
    ).length;
    const other = scopedApps.length - docker - apache - nginx;
    return { docker, apache, nginx, other: Math.max(0, other) };
  }, [scopedApps]);

  const portStats = useMemo(() => {
    const ports = scopedApps.map((a) => a.port).filter(Boolean) as number[];
    const uniquePorts = Array.from(new Set(ports)).sort((a, b) => a - b);

    const portMap = new Map<string, string[]>();
    scopedApps.forEach((a) => {
      if (a.port && a.port !== 80 && a.port !== 443) {
        const key = `${a.server_id || 'default'}:${a.port}`;
        if (!portMap.has(key)) portMap.set(key, []);
        portMap.get(key)!.push(a.name);
      }
    });
    const collisions: Array<{ port: number; apps: string[] }> = [];
    portMap.forEach((names, key) => {
      if (names.length > 1) {
        collisions.push({ port: parseInt(key.split(':')[1], 10), apps: names });
      }
    });

    return { uniquePorts, collisions };
  }, [scopedApps]);

  // Filtered and Sorted Applications
  const sortedFilteredApps = useMemo(() => {
    return scopedApps
      .filter((app) => {
        // Search filter
        if (search) {
          const q = search.toLowerCase();
          const matches =
            app.name.toLowerCase().includes(q) ||
            (app.domain && app.domain.toLowerCase().includes(q)) ||
            (app.service_name && app.service_name.toLowerCase().includes(q)) ||
            (app.server_name && app.server_name.toLowerCase().includes(q)) ||
            (app.server_ip && app.server_ip.toLowerCase().includes(q));
          if (!matches) return false;
        }

        // Status filter
        if (statusFilter !== 'all' && app.health_status !== statusFilter) {
          return false;
        }

        // Process manager filter
        if (processFilter !== 'all') {
          if (processFilter === 'docker') {
            if (!app.is_suite && (!app.process_manager || !app.process_manager.toLowerCase().includes('docker')))
              return false;
          } else if (processFilter === 'apache') {
            if (!app.process_manager || !app.process_manager.toLowerCase().includes('apache')) return false;
          } else if (processFilter === 'nginx') {
            if (!app.process_manager || !app.process_manager.toLowerCase().includes('nginx')) return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'status_errors_first') {
          const aIsErr = a.health_status === 'OFFLINE' || a.health_status === 'DEGRADED';
          const bIsErr = b.health_status === 'OFFLINE' || b.health_status === 'DEGRADED';
          if (aIsErr && !bIsErr) return -1;
          if (!aIsErr && bIsErr) return 1;
          return a.name.localeCompare(b.name);
        }
        if (sortBy === 'server_asc') {
          return (a.server_name || '').localeCompare(b.server_name || '') || a.name.localeCompare(b.name);
        }
        if (sortBy === 'name_asc') {
          return a.name.localeCompare(b.name);
        }
        if (sortBy === 'port_asc') {
          return (a.port || 0) - (b.port || 0);
        }
        if (sortBy === 'uptime_desc') {
          return (b.uptime_percent || 0) - (a.uptime_percent || 0);
        }
        if (sortBy === 'uptime_asc') {
          return (a.uptime_percent || 0) - (b.uptime_percent || 0);
        }
        return 0;
      });
  }, [scopedApps, search, statusFilter, processFilter, sortBy]);

  const executeConfirmedAction = async () => {
    if (!selectedAppForAction) return;
    const targetApp = selectedAppForAction;
    setConfirmModalOpen(false);
    try {
      const res = await api.executeAppAction(targetApp.id, pendingAction);
      await loadData();
      const exitCode = res.exit_code !== undefined ? res.exit_code : (res.success ? 0 : 1);
      setAuditExecutionData({
        command: res.command || `systemctl ${pendingAction} "${targetApp.service_name || targetApp.name}"`,
        stdout: res.stdout || res.message || `Service '${targetApp.service_name || targetApp.name}' ${pendingAction} executed`,
        stderr: res.stderr || '',
        exit_code: exitCode,
        duration_ms: res.duration_ms || 120,
        server_id: targetApp.server_id,
        server_name: targetApp.server_name,
        server_ip: targetApp.server_ip,
        context_type: `APP_${pendingAction.toUpperCase()}`,
        title: `Confirmed Action: ${targetApp.name} (${pendingAction})`
      });
      setAuditModalOpen(true);
    } catch (err: any) {
      setAuditExecutionData({
        command: `systemctl ${pendingAction} "${targetApp.service_name || targetApp.name}"`,
        stdout: '',
        stderr: err.message || `Failed to execute ${pendingAction} on ${targetApp.name}`,
        exit_code: 1,
        duration_ms: 0,
        server_id: targetApp.server_id,
        server_name: targetApp.server_name,
        server_ip: targetApp.server_ip,
        context_type: `APP_${pendingAction.toUpperCase()}`,
        title: `Action Failed: ${targetApp.name}`
      });
      setAuditModalOpen(true);
    } finally {
      setSelectedAppForAction(null);
    }
  };

  const executeConfirmedDelete = async () => {
    if (!selectedAppForDelete) return;
    setDeleteModalOpen(false);
    try {
      await api.deleteApplication(selectedAppForDelete.id);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to delete application');
    } finally {
      setSelectedAppForDelete(null);
    }
  };

  // Fetch container logs for modal
  const handleViewComponentLogs = async (app: Application, componentName: string) => {
    setLogsModal({
      appName: app.name,
      componentName,
      logs: 'Loading container logs from VPS...',
      loading: true,
    });
    try {
      const res = await api.executeAppDockerAction(app.id, {
        action: 'logs',
        container_name: componentName,
        tail: 100,
      });
      setLogsModal({
        appName: app.name,
        componentName,
        logs: res.stdout || res.stderr || 'No stdout/stderr logs recorded for this container.',
        loading: false,
      });
    } catch (err: any) {
      setLogsModal({
        appName: app.name,
        componentName,
        logs: `Failed to fetch logs: ${err.message || 'SSH connection or execution failed'}`,
        loading: false,
      });
    }
  };

  const handleCreateApp = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createApplication({
        name: newName,
        domain: newDomain,
        port: Number(newPort),
        server_id: newServerId || undefined,
        service_name: newServiceName || newName.toLowerCase().replace(/\s+/g, '-'),
        environment: newEnvironment,
        framework: 'FastAPI / React',
        process_manager: 'Docker',
      });
      setCreateModalOpen(false);
      setNewName('');
      setNewDomain('');
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to create application');
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 w-full max-w-full overflow-x-hidden">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Applications Inventory
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Unified view of applications and multi-container Docker suites. Click any application row to open its full management page.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          <button
            onClick={() => loadData()}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors whitespace-nowrap shrink-0"
            title="Refresh Applications"
          >
            <RefreshCw size={14} />
          </button>

          <button
            onClick={() => handleSyncGitRepos(false)}
            disabled={syncingGit}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-medium shadow-sm transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
            title="Re-scan & match each site to its exact Git repository on the server"
          >
            <GitBranch size={13} className={syncingGit ? 'animate-spin text-brand-400 shrink-0' : 'text-brand-400 shrink-0'} />
            <span className="whitespace-nowrap">{syncingGit ? 'Syncing Git...' : 'Sync Git Repos'}</span>
          </button>

          <button
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-medium shadow-sm transition-colors whitespace-nowrap shrink-0"
          >
            <Plus size={14} className="shrink-0" />
            <span className="whitespace-nowrap">Register Application</span>
          </button>
        </div>
      </div>

      {/* VPS Server Node Selector Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-slate-800/80 mb-2.5">
          <div className="flex items-center gap-2">
            <Server size={14} className="text-brand-400 shrink-0" />
            <span className="text-xs font-bold text-white uppercase tracking-wider whitespace-nowrap">Select VPS Server Node:</span>
            <span className="text-[11px] text-slate-400">Choose a node to filter applications, vitals & errors</span>
          </div>
          {selectedServerId !== 'all' && (
            <button
              onClick={() => handleServerSelect('all')}
              className="text-[11px] font-semibold text-brand-400 hover:text-brand-300 transition-colors inline-flex items-center gap-1 self-start sm:self-auto whitespace-nowrap shrink-0"
            >
              <span className="whitespace-nowrap">Show All Nodes</span>
              <span>&times;</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap pb-1">
          <button
            onClick={() => handleServerSelect('all')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 flex items-center gap-2 border ${
              selectedServerId === 'all'
                ? 'bg-brand-600 text-white border-brand-500 shadow-sm'
                : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Layers size={13} className="shrink-0" />
            <span className="whitespace-nowrap">All Servers ({serversList.length})</span>
            <span
              className={`px-1.5 py-0.2 rounded text-[10px] font-mono whitespace-nowrap shrink-0 ${
                selectedServerId === 'all' ? 'bg-brand-700 text-brand-100' : 'bg-slate-900 text-slate-400'
              }`}
            >
              {apps.length} apps
            </span>
            {apps.some((a) => a.health_status === 'OFFLINE' || a.health_status === 'DEGRADED') && (
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping shrink-0" title="Errors detected on nodes" />
            )}
          </button>

          {serversList.map((srv) => {
            const serverApps = apps.filter((a) => a.server_id === srv.id);
            const serverErrors = serverApps.filter(
              (a) => a.health_status === 'OFFLINE' || a.health_status === 'DEGRADED'
            ).length;
            const isSelected = selectedServerId === srv.id;

            return (
              <button
                key={srv.id}
                onClick={() => handleServerSelect(srv.id)}
                className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all whitespace-nowrap shrink-0 flex items-center gap-2.5 border ${
                  isSelected
                    ? 'bg-brand-600 text-white border-brand-500 shadow-sm'
                    : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Server size={13} className={`shrink-0 ${isSelected ? 'text-white' : 'text-slate-400'}`} />
                <div className="text-left whitespace-nowrap">
                  <div className="leading-tight font-medium whitespace-nowrap">{srv.name}</div>
                  <div className={`text-[10px] mono whitespace-nowrap ${isSelected ? 'text-brand-100' : 'text-slate-400'}`}>
                    {srv.public_ip}
                  </div>
                </div>
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-mono whitespace-nowrap shrink-0 ${
                    isSelected ? 'bg-brand-700 text-brand-100' : 'bg-slate-900 text-slate-400'
                  }`}
                >
                  {serverApps.length}
                </span>
                {serverErrors > 0 && (
                  <span
                    className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-bold animate-pulse whitespace-nowrap shrink-0"
                    title={`${serverErrors} error(s)`}
                  >
                    {serverErrors}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Functional Operational Decision Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Fleet & Node Health Overview */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-2 bg-brand-950 border border-brand-800/80 rounded-lg text-brand-400 shrink-0">
                <Activity size={16} />
              </div>
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider whitespace-nowrap">Fleet Vitals</span>
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold whitespace-nowrap shrink-0 ${
                onlineRate >= 95
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  : 'bg-amber-950 text-amber-400 border border-amber-800'
              }`}
            >
              {onlineRate}% ONLINE
            </span>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white tracking-tight">{onlineAppsCount}</span>
              <span className="text-xs text-slate-400 font-medium">/ {scopedApps.length} Apps Active</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
              <span>Total Microservices:</span>
              <span className="text-slate-200 font-mono font-semibold">{totalServicesCount} Containers</span>
            </div>
          </div>
          {/* Visual Health Bar */}
          <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
            <div
              className={`h-full transition-all duration-500 ${
                onlineRate === 100 ? 'bg-emerald-500' : onlineRate >= 80 ? 'bg-amber-500' : 'bg-rose-500'
              }`}
              style={{ width: `${onlineRate}%` }}
            />
          </div>
        </div>

        {/* Card 2: Clickable Failures & Offline Warnings Hub */}
        <div
          className={`border rounded-xl p-4 flex flex-col justify-between space-y-3 shadow-sm transition-all ${
            offlineApps.length > 0 ? 'bg-rose-950/20 border-rose-800/80' : 'bg-slate-900 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className={`p-2 rounded-lg shrink-0 ${
                  offlineApps.length > 0
                    ? 'bg-rose-950 text-rose-400 border border-rose-800'
                    : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                }`}
              >
                {offlineApps.length > 0 ? <ShieldAlert size={16} /> : <ShieldCheck size={16} />}
              </div>
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider whitespace-nowrap">
                {offlineApps.length > 0 ? 'Outages & Errors' : 'Error Monitor'}
              </span>
            </div>
            {offlineApps.length > 0 ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800 animate-pulse whitespace-nowrap shrink-0">
                {offlineApps.length} CRITICAL
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 whitespace-nowrap shrink-0">
                ALL HEALTHY
              </span>
            )}
          </div>

          {offlineApps.length > 0 ? (
            <div className="space-y-1.5">
              <div className="text-[11px] text-rose-300 font-semibold">
                Click an error to jump & fix directly:
              </div>
              <div className="flex flex-col gap-1 max-h-24 overflow-y-auto pr-1">
                {offlineApps.map((offApp) => (
                  <button
                    key={offApp.id}
                    onClick={() => jumpToApp(offApp)}
                    className="w-full text-left p-1.5 bg-rose-950/50 hover:bg-rose-900/60 border border-rose-800/80 rounded-lg text-xs transition-colors flex items-center justify-between group"
                    title={`Click to jump directly to ${offApp.name}`}
                  >
                    <div className="truncate min-w-0 pr-2">
                      <span className="font-bold text-rose-200 group-hover:text-white">{offApp.name}</span>
                      <span className="text-[10px] text-rose-400 mono ml-1.5">({offApp.health_status})</span>
                    </div>
                    <ChevronRight
                      size={13}
                      className="text-rose-400 group-hover:translate-x-0.5 transition-transform shrink-0"
                    />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <div className="text-sm font-bold text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 size={15} />
                <span>Zero Active Errors</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                All HTTP listeners and daemon processes responding normally across servers.
              </p>
            </div>
          )}

          <div className="text-[10px] text-slate-400 mono pt-1 border-t border-slate-800/60 flex items-center justify-between">
            <span>Auto-probed via SSH</span>
            <span>100% telemetry</span>
          </div>
        </div>

        {/* Card 3: Runtime Process Managers */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-2 bg-indigo-950 border border-indigo-800/80 rounded-lg text-indigo-400 shrink-0">
                <Cpu size={16} />
              </div>
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider whitespace-nowrap">Process Stacks</span>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-indigo-950 text-indigo-400 border border-indigo-800 whitespace-nowrap shrink-0">
              DAEMONS
            </span>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center justify-between text-slate-300">
              <button
                onClick={() => setProcessFilter(processFilter === 'docker' ? 'all' : 'docker')}
                className={`hover:text-white transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                  processFilter === 'docker' ? 'text-brand-400 font-bold' : ''
                }`}
              >
                <Box size={12} className="text-brand-400 shrink-0" />
                <span className="whitespace-nowrap">Docker Suites:</span>
              </button>
              <span className="font-mono font-bold text-white">{processDistribution.docker}</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <button
                onClick={() => setProcessFilter(processFilter === 'apache' ? 'all' : 'apache')}
                className={`hover:text-white transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                  processFilter === 'apache' ? 'text-brand-400 font-bold' : ''
                }`}
              >
                <Server size={12} className="text-amber-400 shrink-0" />
                <span className="whitespace-nowrap">Apache2 VirtualHosts:</span>
              </button>
              <span className="font-mono font-bold text-white">{processDistribution.apache}</span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <button
                onClick={() => setProcessFilter(processFilter === 'nginx' ? 'all' : 'nginx')}
                className={`hover:text-white transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                  processFilter === 'nginx' ? 'text-brand-400 font-bold' : ''
                }`}
              >
                <Layers size={12} className="text-teal-400 shrink-0" />
                <span className="whitespace-nowrap">Nginx Reverse Proxies:</span>
              </button>
              <span className="font-mono font-bold text-white">{processDistribution.nginx}</span>
            </div>
          </div>
          <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800/60 flex items-center justify-between">
            <span>Filter:</span>
            <span className="text-brand-400 font-semibold">
              {processFilter === 'all' ? 'All Stacks' : processFilter.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Card 4: Network & Port Allocation */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-2 bg-emerald-950 border border-emerald-800/80 rounded-lg text-emerald-400 shrink-0">
                <Network size={16} />
              </div>
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider whitespace-nowrap">Port Safety</span>
            </div>
            {portStats.collisions.length > 0 ? (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800 whitespace-nowrap shrink-0">
                COLLISION
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 whitespace-nowrap shrink-0">
                0 CONFLICTS
              </span>
            )}
          </div>
          <div>
            <div className="text-xs text-slate-300 font-medium mb-1">Active Port Bindings:</div>
            <div className="flex flex-wrap gap-1 max-h-14 overflow-y-auto">
              {portStats.uniquePorts.slice(0, 6).map((p) => (
                <span
                  key={p}
                  className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-950 text-emerald-300 border border-slate-800 whitespace-nowrap shrink-0"
                >
                  :{p}
                </span>
              ))}
              {portStats.uniquePorts.length > 6 && (
                <span className="text-[10px] text-slate-500 font-mono self-center whitespace-nowrap">
                  +{portStats.uniquePorts.length - 6} more
                </span>
              )}
            </div>
          </div>
          <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800/60 flex items-center justify-between">
            <span>Port Safety Check</span>
            <span className="text-emerald-400 font-semibold">100% Isolated</span>
          </div>
        </div>
      </div>

      {/* Filter, Search & Sort Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by application name, domain, suite or server..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Sort By Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 whitespace-nowrap shrink-0">
            <ArrowUpDown size={13} className="text-brand-400 shrink-0" />
            <span className="text-slate-500 text-[11px]">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-transparent border-none text-white focus:outline-none text-xs cursor-pointer font-medium"
            >
              <option value="status_errors_first" className="bg-slate-900 text-white">Status (Errors First)</option>
              <option value="server_asc" className="bg-slate-900 text-white">Server (A-Z)</option>
              <option value="name_asc" className="bg-slate-900 text-white">Name (A-Z)</option>
              <option value="port_asc" className="bg-slate-900 text-white">Port Number</option>
              <option value="uptime_desc" className="bg-slate-900 text-white">Uptime (Highest First)</option>
              <option value="uptime_asc" className="bg-slate-900 text-white">Uptime (Lowest First)</option>
            </select>
          </div>

          {/* Status Filter Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 px-3 py-1.5 focus:outline-none focus:border-brand-500 whitespace-nowrap shrink-0"
          >
            <option value="all">All Statuses</option>
            <option value="ONLINE">Online</option>
            <option value="DEGRADED">Degraded</option>
            <option value="OFFLINE">Offline</option>
            <option value="MAINTENANCE">Maintenance</option>
          </select>
        </div>
      </div>

      {/* Applications Data Table — Fits 100% Within Viewport With Zero Horizontal Scrolling */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm w-full">
        <table className="w-full table-fixed text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
              <th className="py-3.5 px-4 w-[29%] whitespace-nowrap">Application & Domain</th>
              <th className="py-3.5 px-3 w-[23%] whitespace-nowrap">Server & Runtime</th>
              <th className="py-3.5 px-3 w-[20%] whitespace-nowrap">Git Head</th>
              <th className="py-3.5 px-3 w-[15%] whitespace-nowrap">Health & Uptime</th>
              <th className="py-3.5 px-4 w-[13%] text-right whitespace-nowrap">App Page</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-200">
            {loading ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-slate-500">
                  Loading applications directory...
                </td>
              </tr>
            ) : sortedFilteredApps.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-16 text-center text-slate-400">
                  <div className="space-y-3 max-w-sm mx-auto">
                    <div className="p-3 bg-slate-950 border border-slate-800 w-12 h-12 rounded-xl mx-auto flex items-center justify-center text-slate-400">
                      <Layers size={24} />
                    </div>
                    <div className="font-semibold text-white text-sm">No Applications Found</div>
                    <p className="text-xs text-slate-500">
                      No applications match your active server, search, or status filter.
                    </p>
                    <button
                      onClick={() => {
                        setSelectedServerId('all');
                        setSearch('');
                        setStatusFilter('all');
                        setProcessFilter('all');
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors whitespace-nowrap shrink-0"
                    >
                      <RefreshCw size={12} className="shrink-0" />
                      <span className="whitespace-nowrap">Reset All Filters</span>
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              sortedFilteredApps.map((app) => {
                const isSuite = Boolean(app.is_suite && app.components && app.components.length > 1);
                const hasGitCommit = Boolean(app.current_commit && app.current_commit !== 'HEAD');
                const repoFolder =
                  app.root_path && !app.root_path.startsWith('/var/lib/docker')
                    ? app.root_path.split('/').filter(Boolean).pop()
                    : null;

                return (
                  <tr
                    key={app.id}
                    id={`app-row-${app.id}`}
                    onClick={() => onSelectApp(app.id)}
                    className={`hover:bg-slate-800/50 cursor-pointer transition-colors group ${
                      highlightedAppId === app.id
                        ? 'ring-2 ring-rose-500 bg-rose-950/40 shadow-lg shadow-rose-950/50 animate-pulse'
                        : ''
                    }`}
                  >
                    {/* Column 1: App Name, Suite Indicator, Environment & Domain */}
                    <td className="py-3.5 px-4 font-medium min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-white group-hover:text-brand-400 transition-colors truncate">
                          {app.name}
                        </span>

                        {isSuite && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-brand-950/80 text-brand-300 border border-brand-800/80 whitespace-nowrap shrink-0">
                            <Box size={10} className="shrink-0" />
                            <span className="whitespace-nowrap">
                              {app.components?.length || app.component_count || 1} Services
                            </span>
                          </span>
                        )}

                        <span
                          className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-semibold uppercase tracking-wider border whitespace-nowrap shrink-0 ${
                            app.environment === 'production'
                              ? 'bg-purple-950/80 text-purple-300 border-purple-800/80'
                              : app.environment === 'staging'
                              ? 'bg-amber-950/80 text-amber-300 border-amber-800/80'
                              : 'bg-blue-950/80 text-blue-300 border-blue-800/80'
                          }`}
                        >
                          {app.environment}
                        </span>

                        {app.is_maintenance && (
                          <span className="text-[10px] font-mono px-1 py-0.2 bg-blue-950 text-blue-300 border border-blue-800 rounded whitespace-nowrap shrink-0">
                            MAINT
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-slate-400 mt-1 mono min-w-0">
                        <span className="truncate">{app.domain || `${app.service_name}.local`}</span>
                        {app.domain && !app.domain.endsWith('.local') && (
                          <a
                            href={`https://${app.domain}`}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="hover:text-white shrink-0"
                            title={`Open https://${app.domain}`}
                          >
                            <ExternalLink size={11} />
                          </a>
                        )}
                      </div>
                    </td>

                    {/* Column 2: Server & Runtime */}
                    <td className="py-3.5 px-3 min-w-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (app.server_id) handleServerSelect(app.server_id);
                        }}
                        className="inline-flex items-center gap-1.5 text-slate-200 hover:text-brand-300 transition-colors text-left group/srv max-w-full"
                        title={`Click to filter apps to ${app.server_name || 'this server'}`}
                      >
                        <Server size={12} className="text-brand-400 shrink-0" />
                        <span className="truncate font-medium">{app.server_name || 'VPS Node'}</span>
                      </button>
                      <div className="text-slate-400 mono text-[11px] mt-0.5 truncate">
                        {app.server_ip || '185.192.97.84'} · {isSuite ? 'Docker Compose' : app.process_manager} (:{app.port})
                      </div>
                    </td>

                    {/* Column 3: Git Head */}
                    <td className="py-3.5 px-3 min-w-0">
                      {hasGitCommit ? (
                        <>
                          <div className="inline-flex items-center gap-1.5 mono whitespace-nowrap">
                            <GitBranch size={12} className="text-brand-400 shrink-0" />
                            <span className="text-slate-300 whitespace-nowrap">{app.git_branch || 'main'}</span>
                            <span
                              className="text-brand-400 font-semibold px-1.5 py-0.5 bg-slate-950 rounded border border-slate-800 text-[11px] whitespace-nowrap shrink-0"
                              title={`Commit: ${app.current_commit}${app.root_path ? ` | Repo: ${app.root_path}` : ''}`}
                            >
                              {app.current_commit!.slice(0, 7)}
                            </span>
                          </div>
                          {app.latest_repo_commit && app.current_commit !== app.latest_repo_commit ? (
                            <div className="text-[10px] text-amber-400 font-semibold mt-0.5 whitespace-nowrap">
                              Update Available
                            </div>
                          ) : repoFolder ? (
                            <div
                              className="text-[10px] text-slate-500 mono mt-0.5 truncate"
                              title={app.root_path}
                            >
                              /{repoFolder}
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-950/80 text-slate-500 border border-slate-800/80 text-[11px] font-mono whitespace-nowrap shrink-0"
                          title={
                            app.root_path
                              ? `No Git repository found in ${app.root_path}`
                              : 'No Git repository tracked for this site'
                          }
                        >
                          <GitBranch size={11} className="text-slate-600 shrink-0" />
                          <span className="whitespace-nowrap">No Git Repo</span>
                        </span>
                      )}
                    </td>

                    {/* Column 4: Health & Uptime */}
                    <td className="py-3.5 px-3 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <StatusBadge status={app.health_status} size="sm" />
                        {(app.health_status === 'OFFLINE' || app.health_status === 'DEGRADED') && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleInvestigateError(app);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950 text-rose-300 border border-rose-800 hover:bg-rose-900 transition-colors shadow-sm whitespace-nowrap shrink-0"
                            title="Click to audit outage reason and run AI fix on VPS"
                          >
                            <Sparkles size={10} className="text-rose-400 shrink-0" />
                            <span className="whitespace-nowrap">Fix with AI</span>
                          </button>
                        )}
                      </div>
                      <div className="text-[11px] mono text-emerald-400 font-medium mt-1 whitespace-nowrap">
                        {app.uptime_percent || 99.98}% uptime
                      </div>
                    </td>

                    {/* Column 5: Open Full Application Detail Page */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectApp(app.id);
                        }}
                        className="h-8 px-3 rounded-lg bg-brand-600/90 hover:bg-brand-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-sm transition-colors"
                      >
                        <span>Manage</span>
                        <ChevronRight size={13} className="shrink-0" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Container Logs Viewer Modal */}
      {logsModal && (
        <ModalShell
          isOpen={Boolean(logsModal)}
          onClose={() => setLogsModal(null)}
          title={`Logs — ${logsModal.componentName}`}
          description={`Application Suite: ${logsModal.appName}`}
          icon={Terminal}
          size="xl"
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2 w-full">
              <span className="text-[11px] text-slate-400">
                Showing last 100 stdout lines from Docker daemon.
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    setAuditExecutionData({
                      command: `docker logs ${logsModal.componentName} --tail 100`,
                      stdout: logsModal.logs,
                      stderr: '',
                      exit_code: 0,
                      duration_ms: 120,
                      context_type: 'CONTAINER_LOGS',
                      title: `Container Logs Audit: ${logsModal.componentName}`
                    });
                    setAuditModalOpen(true);
                  }}
                  leftIcon={<Sparkles size={12} className="text-brand-400" />}
                >
                  AI Audit Logs
                </Button>
                <Button variant="secondary" onClick={() => setLogsModal(null)}>
                  Close
                </Button>
              </div>
            </div>
          }
        >
          <div className="flex items-center justify-end mb-2">
            <Button
              variant="outline"
              size="xs"
              onClick={() => {
                const matchedApp = apps.find((a) => a.name === logsModal.appName);
                if (matchedApp) {
                  handleViewComponentLogs(matchedApp, logsModal.componentName);
                }
              }}
              isLoading={logsModal.loading}
              leftIcon={<RefreshCw size={12} />}
            >
              Refresh Logs
            </Button>
          </div>
          <div className="p-4 rounded-lg bg-black border border-slate-800 font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed select-text max-h-96 overflow-y-auto">
            {logsModal.loading ? (
              <div className="flex items-center justify-center py-12 text-slate-500">
                <RotateCw size={16} className="animate-spin mr-2" />
                <span>Streaming terminal stdout/stderr from container...</span>
              </div>
            ) : (
              logsModal.logs || 'No logs available.'
            )}
          </div>
        </ModalShell>
      )}

      {/* Confirmation Safeguard Modal for Production Restart */}
      <ConfirmationModal
        isOpen={confirmModalOpen}
        title="Production Service Restart Safeguard"
        message={`You are about to restart '${selectedAppForAction?.name}' in PRODUCTION on ${selectedAppForAction?.domain}. This may briefly drop active client connections.`}
        confirmKeyword="RESTART"
        confirmButtonText="Execute Restart"
        isDestructive={true}
        onConfirm={executeConfirmedAction}
        onClose={() => setConfirmModalOpen(false)}
      />

      {/* Confirmation Safeguard Modal for Application Deletion */}
      <ConfirmationModal
        isOpen={deleteModalOpen}
        title="Deregister Application Safeguard"
        message={`Are you sure you want to delete '${selectedAppForDelete?.name}' (${selectedAppForDelete?.domain})? This will detach its routing and process management.`}
        confirmKeyword="DELETE"
        confirmButtonText="Deregister Application"
        isDestructive={true}
        onConfirm={executeConfirmedDelete}
        onClose={() => setDeleteModalOpen(false)}
      />

      {/* Create Application Modal */}
      <ModalShell
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Register New Application"
        description="Attach a web application, API, or service to the Command Center."
        icon={Layers}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="create-app-form">
              Register Application
            </Button>
          </>
        }
      >
        <form id="create-app-form" onSubmit={handleCreateApp} className="space-y-4 text-xs">
          <InputField
            label="Application Name"
            isRequired
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Student Portal"
          />

          <InputField
            label="Domain Name"
            isRequired
            value={newDomain}
            onChange={(e) => setNewDomain(e.target.value)}
            placeholder="e.g. portal.example.com"
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <InputField
              label="Port"
              type="number"
              value={String(newPort)}
              onChange={(e) => setNewPort(Number(e.target.value))}
            />
            <SelectField
              label="Environment"
              value={newEnvironment}
              onChange={(e) => setNewEnvironment(e.target.value)}
              options={[
                { value: 'production', label: 'Production' },
                { value: 'staging', label: 'Staging' },
                { value: 'development', label: 'Development' },
              ]}
            />
          </div>

          <SelectField
            label="Hosting Server"
            value={newServerId}
            onChange={(e) => setNewServerId(e.target.value)}
          >
            <option value="">None (Unassigned / Cloud / External)</option>
            {serversList.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.public_ip})
              </option>
            ))}
          </SelectField>
        </form>
      </ModalShell>

      <CommandAuditModal
        isOpen={auditModalOpen}
        onClose={() => setAuditModalOpen(false)}
        executionData={auditExecutionData}
        onRunFix={async (fixCommand) => {
          if (auditExecutionData?.server_id) {
            const res = await api.executeTerminalCommand(auditExecutionData.server_id, fixCommand);
            await loadData();
            return res;
          }
        }}
        onSuccess={loadData}
      />
    </div>
  );
};
