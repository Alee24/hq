import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  RotateCw,
  Square,
  Play,
  Rocket,
  ShieldCheck,
  Server,
  GitBranch,
  FileText,
  Clock,
  Key,
  Archive,
  Sliders,
  ClipboardList,
  Activity,
  ExternalLink,
  Download,
  AlertTriangle,
  CheckCircle2,
  GitPullRequest,
  Trash2,
  Save,
  Box,
  Terminal,
  Cpu,
  HardDrive,
  RefreshCw,
  Layers,
  Sparkles,
  Copy,
  Check,
  RotateCcw,
  Folder
} from 'lucide-react';
import { api } from '../api/client';

import { Application, DeploymentItem, LogItem, AuditLogItem } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmationModal } from '../components/ConfirmationModal';

interface ApplicationDetailViewProps {
  appId: string;
  onBack: () => void;
  onNavigateToDeployments: () => void;
}

export const ApplicationDetailView: React.FC<ApplicationDetailViewProps> = ({
  appId,
  onBack,
  onNavigateToDeployments,
}) => {
  const [app, setApp] = useState<Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'docker' | 'monitoring' | 'deployments' | 'git' | 'logs' | 'server' | 'license' | 'backups' | 'config' | 'audit'
  >('overview');

  // Sub-data states
  const [deployments, setDeployments] = useState<DeploymentItem[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [gitStatus, setGitStatus] = useState<any>(null);
  const [serverInfo, setServerInfo] = useState<any>(null);
  const [licenseInfo, setLicenseInfo] = useState<any>(null);
  const [backups, setBackups] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);

  // Docker Container Inspection & Tuning States
  const [dockerData, setDockerData] = useState<any>(null);
  const [dockerLoading, setDockerLoading] = useState(false);
  const [selectedContainerName, setSelectedContainerName] = useState<string>('');
  const [customCommand, setCustomCommand] = useState('');
  const [commandOutput, setCommandOutput] = useState<{
    command: string;
    stdout: string;
    stderr: string;
    exit_code: number;
    duration_ms: number;
    success: boolean;
  } | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Modals & Action States
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<string>('restart');
  const [selectedLogForModal, setSelectedLogForModal] = useState<string | null>(null);

  // Rollback Modal
  const [rollbackModalOpen, setRollbackModalOpen] = useState(false);
  const [targetDeploymentForRollback, setTargetDeploymentForRollback] = useState<DeploymentItem | null>(null);

  // Delete App Modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Config tab form state
  const [editServiceName, setEditServiceName] = useState('');
  const [editHealthUrl, setEditHealthUrl] = useState('');
  const [editPort, setEditPort] = useState(80);
  const [editDomain, setEditDomain] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSuccess, setConfigSuccess] = useState(false);

  // Git Operations State
  const [gitActionLoading, setGitActionLoading] = useState<string | null>(null);
  const [gitTerminalOutput, setGitTerminalOutput] = useState<any>(null);

  const handleExecuteGitAction = async (
    action: 'pull' | 'fetch' | 'reset_hard' | 'status' | 'diff' | 'log' | 'custom',
    customCmd?: string
  ) => {
    if (!app) return;
    setGitActionLoading(action);
    try {
      const res = await api.executeGitAction(app.id, {
        action,
        branch: gitStatus?.branch || app.git_branch || 'main',
        custom_command: customCmd,
      });
      setGitTerminalOutput(res);
      setActionSuccessMessage(res.message);
      setTimeout(() => setActionSuccessMessage(null), 5000);
      const newStatus = await api.getGitStatus(app.id);
      setGitStatus(newStatus);
      const freshApp = await api.getApplication(app.id);
      setApp(freshApp);
      const freshDeps = await api.listDeployments(app.id);
      setDeployments(freshDeps);
    } catch (err: any) {
      setGitTerminalOutput({
        command: customCmd || `git ${action}`,
        stdout: '',
        stderr: err.message || 'Execution failed',
        exit_code: 1,
        duration_ms: 0,
      });
    } finally {
      setGitActionLoading(null);
    }
  };

  const loadDockerInfo = async (targetAppId: string) => {
    setDockerLoading(true);
    try {
      const d = await api.inspectAppContainer(targetAppId);
      setDockerData(d);
      if (d.target_name) {
        setSelectedContainerName(d.target_name);
      }
    } catch (e) {
      console.error('Failed to inspect Docker container:', e);
    } finally {
      setDockerLoading(false);
    }
  };

  const handleDockerAction = async (action: string, extraParams: any = {}) => {
    if (!app) return;
    setActionLoading(true);
    try {
      const res = await api.executeAppDockerAction(app.id, {
        action,
        container_name: selectedContainerName || app.service_name || app.name,
        ...extraParams
      });
      setCommandOutput(res);
      setActionSuccessMessage(res.message || `Action ${action} executed.`);
      setTimeout(() => setActionSuccessMessage(null), 5000);
      await loadDockerInfo(app.id);
    } catch (err: any) {
      alert(err.message || 'Docker container action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const loadAll = async () => {
    try {
      const a = await api.getApplication(appId);
      setApp(a);
      setEditServiceName(a.service_name || '');
      setEditHealthUrl(a.health_check_url || '');
      setEditPort(a.port || 80);
      setEditDomain(a.domain || '');

      const [deps, appLogs, git, srv, allBackups, audits] = await Promise.all([
        api.listDeployments(appId),
        api.getAppLogs(appId, 100),
        api.getGitStatus(appId).catch(() => null),
        api.getServer(a.server_id).catch(() => null),
        api.listBackups(),
        api.listAuditLogs(undefined, undefined, 'application'),
      ]);

      setDeployments(deps);
      setLogs(appLogs);
      setGitStatus(git);
      setServerInfo(srv);
      setBackups(allBackups.filter((b: any) => b.application_id === appId));
      setAuditLogs(audits.filter((l: any) => l.entity_id === appId));

      loadDockerInfo(appId);

      if (a.license_id) {
        const lic = await api.listLicenses().then(list => list.find(l => l.id === a.license_id));
        setLicenseInfo(lic);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteApp = async () => {
    if (!app) return;
    setDeleting(true);
    try {
      await api.deleteApplication(app.id);
      setDeleteModalOpen(false);
      onBack();
    } catch (err: any) {
      alert(err.message || 'Failed to delete application');
    } finally {
      setDeleting(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!app) return;
    setSavingConfig(true);
    try {
      await api.updateApplication(app.id, {
        service_name: editServiceName,
        health_check_url: editHealthUrl,
        port: Number(editPort),
        domain: editDomain,
      });
      setConfigSuccess(true);
      setTimeout(() => setConfigSuccess(false), 3000);
      await loadAll();
    } catch (err: any) {
      alert(err.message || 'Failed to update application configuration');
    } finally {
      setSavingConfig(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [appId]);

  const handleAction = async (action: string) => {
    if (!app) return;
    if (action === 'restart' && app.environment === 'production') {
      setConfirmAction('restart');
      setConfirmModalOpen(true);
      return;
    }

    setActionLoading(true);
    try {
      await api.executeAppAction(app.id, action);
      await loadAll();
    } catch (err: any) {
      alert(err.message || 'Operation failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleMaintenance = async () => {
    if (!app) return;
    setActionLoading(true);
    try {
      await api.toggleMaintenance(app.id, !app.is_maintenance, 'Scheduled maintenance window');
      await loadAll();
    } catch (err: any) {
      alert(err.message || 'Maintenance toggle failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleTriggerRollback = async () => {
    if (!targetDeploymentForRollback) return;
    try {
      await api.triggerRollback({
        deployment_id: targetDeploymentForRollback.id,
        reason: 'Operator requested emergency rollback to stable build',
        confirmation: 'ROLLBACK',
      });
      setRollbackModalOpen(false);
      await loadAll();
      alert('Rollback completed successfully.');
    } catch (err: any) {
      alert(err.message || 'Rollback failed');
    }
  };

  if (loading || !app) {
    return (
      <div className="p-8 space-y-4">
        <div className="h-6 w-32 bg-slate-800 rounded animate-pulse" />
        <div className="h-32 bg-slate-900 rounded-xl animate-pulse" />
      </div>
    );
  }

  const isNativeApp = Boolean(
    dockerData?.is_native_process ||
    (dockerData && !dockerData.has_container) ||
    app.process_manager === 'Apache' ||
    app.process_manager === 'Nginx' ||
    app.process_manager === 'Systemd' ||
    app.app_type === 'Web Application'
  );

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Sliders },
    { id: 'docker', label: isNativeApp ? 'Process & Web Host' : 'Docker & Performance', icon: isNativeApp ? Cpu : Box },
    { id: 'monitoring', label: 'Monitoring', icon: Activity },
    { id: 'deployments', label: 'Deployments', icon: Rocket },
    { id: 'git', label: 'Git Integration', icon: GitBranch },
    { id: 'logs', label: 'Logs', icon: FileText },
    { id: 'server', label: 'Server Info', icon: Server },
    { id: 'license', label: 'License', icon: Key },
    { id: 'backups', label: 'Backups', icon: Archive },
    { id: 'config', label: 'Configuration', icon: Sliders },
    { id: 'audit', label: 'Audit Trail', icon: ClipboardList },
  ] as const;

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Back button */}
      <div>
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} />
          <span>Back to Applications</span>
        </button>
      </div>

      {/* Application Hero Card */}
      <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white tracking-tight">{app.name}</h1>
              <StatusBadge status={app.health_status} />
              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wider border ${
                app.environment === 'production'
                  ? 'bg-purple-950/80 text-purple-300 border-purple-800/80'
                  : 'bg-blue-950/80 text-blue-300 border-blue-800/80'
              }`}>
                {app.environment}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
              <a
                href={`https://${app.domain}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-brand-400 hover:underline mono"
              >
                <span>https://{app.domain}</span>
                <ExternalLink size={12} />
              </a>
              <span>•</span>
              <span className="mono">Port :{app.port}</span>
              <span>•</span>
              <span>Process: <span className="text-slate-200 font-semibold">{app.process_manager}</span></span>
              <span>•</span>
              <span>Version: <span className="mono text-slate-200 font-semibold">{app.current_version}</span></span>
            </div>
          </div>

          {/* Action Button Bar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleAction('restart')}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-colors"
            >
              <RotateCw size={13} className={actionLoading ? 'animate-spin' : ''} />
              <span>Restart</span>
            </button>

            <button
              onClick={() => handleAction(app.health_status === 'OFFLINE' ? 'start' : 'stop')}
              disabled={actionLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-colors"
            >
              {app.health_status === 'OFFLINE' ? <Play size={13} /> : <Square size={13} />}
              <span>{app.health_status === 'OFFLINE' ? 'Start' : 'Stop'}</span>
            </button>

            <button
              onClick={handleToggleMaintenance}
              disabled={actionLoading}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                app.is_maintenance
                  ? 'bg-amber-950/80 text-amber-300 border-amber-800 hover:bg-amber-900/60'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <Clock size={13} />
              <span>{app.is_maintenance ? 'Disable Maint Mode' : 'Maintenance Mode'}</span>
            </button>

            <button
              onClick={onNavigateToDeployments}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-500 text-white text-xs font-medium rounded-lg shadow-sm transition-colors"
            >
              <Rocket size={13} />
              <span>Deploy Release</span>
            </button>

            <button
              onClick={() => setDeleteModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs font-medium rounded-lg transition-colors"
              title="Deregister Application"
            >
              <Trash2 size={13} />
              <span>Delete App</span>
            </button>
          </div>
        </div>


        {/* Tab Navigation */}
        <div className="flex items-center gap-1 border-t border-slate-800 pt-3 overflow-x-auto text-xs">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
              >
                <Icon size={14} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Panels */}
      <div className="space-y-6">
        {/* Tab 1: Overview */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4 col-span-2">
              <h3 className="text-sm font-semibold text-white">System Vital Overview</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-slate-500">Uptime SLA</span>
                  <div className="text-lg font-bold text-emerald-400 mono mt-0.5">{app.uptime_percent}%</div>
                </div>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-slate-500">HTTP Status</span>
                  <div className="text-lg font-bold text-white mono mt-0.5">{app.http_status} OK</div>
                </div>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-slate-500">SSL Certificate</span>
                  <div className="text-lg font-bold text-emerald-400 mono mt-0.5">{app.ssl_status}</div>
                </div>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-slate-500">Hosting Server</span>
                  <div className="text-sm font-semibold text-slate-200 mt-0.5">{app.server_name}</div>
                  <div className="text-[11px] text-slate-400 mono">{app.server_ip}</div>
                </div>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-slate-500">Current Commit</span>
                  <div className="text-sm font-semibold text-brand-400 mono mt-0.5">{app.current_commit}</div>
                </div>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-slate-500">License Status</span>
                  <div className="text-sm font-semibold text-purple-400 mono mt-0.5">{app.license_status || 'VALID'}</div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800 text-xs text-slate-400 space-y-1">
                <div>Description: {app.description || 'Enterprise platform microservice component.'}</div>
                <div>Last Restart: {app.last_restart_at ? new Date(app.last_restart_at).toLocaleString() : 'N/A'}</div>
                <div>Last Deployment: {app.last_deployment_at ? new Date(app.last_deployment_at).toLocaleString() : 'N/A'}</div>
              </div>
            </div>

            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
              <h3 className="text-sm font-semibold text-white">Quick Infrastructure Actions</h3>
              <div className="space-y-2 text-xs">
                <button
                  onClick={() => handleAction('restart')}
                  className="w-full text-left p-3 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 transition-colors"
                >
                  <div className="font-semibold text-slate-200">Restart Application Service</div>
                  <div className="text-slate-400 mt-0.5">Executes graceful restart without container down-time.</div>
                </button>
                <button
                  onClick={async () => {
                    await api.triggerBackup(app.id, app.server_id);
                    alert('Instant snapshot initiated.');
                    loadAll();
                  }}
                  className="w-full text-left p-3 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 transition-colors"
                >
                  <div className="font-semibold text-slate-200">Take Immediate Backup Snapshot</div>
                  <div className="text-slate-400 mt-0.5">Saves container volume & config to S3 storage bucket.</div>
                </button>
              </div>
            </div>

            {/* Live Docker Container or Native Process Architecture Preview Banner in Overview */}
            {dockerData?.has_container && dockerData?.container ? (
              <div className="col-span-full p-5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-brand-950/80 border border-brand-800/80 rounded-xl text-brand-400">
                    <Box size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-sm">Container: {dockerData.container.name}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                        dockerData.container.state === 'running'
                          ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                          : 'bg-rose-950 text-rose-400 border-rose-800'
                      }`}>
                        {dockerData.container.state}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-3 font-mono">
                      <span>ID: <code className="text-slate-300">{dockerData.container.id}</code></span>
                      <span>•</span>
                      <span>CPU: <strong className="text-emerald-400">{dockerData.container.cpu_percent}%</strong></span>
                      <span>•</span>
                      <span>RAM: <strong className="text-slate-200">{dockerData.container.mem_usage}</strong></span>
                      <span>•</span>
                      <span>Ceiling: <strong className="text-slate-300">{dockerData.container.memory_limit}</strong></span>
                      <span>•</span>
                      <span>Restart: <strong className="text-brand-300">{dockerData.container.restart_policy}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDockerAction('restart')}
                    disabled={actionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition-colors"
                  >
                    <RotateCw size={12} className={actionLoading ? 'animate-spin' : ''} />
                    <span>Restart Container</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('docker')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                  >
                    <Terminal size={13} />
                    <span>Manage Container & Tuning</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="col-span-full p-5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-950/80 border border-emerald-800/80 rounded-xl text-emerald-400">
                    <Cpu size={20} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white text-sm">
                        Native Host Architecture: {app.process_manager || 'Bare-Metal Web Service'}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-950 text-emerald-400 border border-emerald-800">
                        DIRECT HOST PROCESS
                      </span>
                      {app.process_manager && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-950 text-purple-300 border border-purple-800">
                          {app.process_manager}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-3 font-mono">
                      <span>Host: <strong className="text-slate-200">{app.server_name}</strong> ({app.server_ip})</span>
                      <span>•</span>
                      <span>Root: <strong className="text-amber-300">{app.root_path || gitStatus?.doc_root || `/var/www/${app.domain}`}</strong></span>
                      <span>•</span>
                      <span>Port: <strong className="text-sky-300">:{app.port || 80}</strong></span>
                      <span>•</span>
                      <span>Service: <strong className="text-slate-300">{app.service_name || app.domain}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const isApache = (app.process_manager || '').toLowerCase().includes('apache') || (app.service_name || '').toLowerCase().includes('apache');
                      handleDockerAction('custom_command', {
                        command: isApache ? 'apache2ctl configtest' : 'nginx -t'
                      });
                      setActiveTab('docker');
                    }}
                    disabled={actionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 transition-colors"
                  >
                    <CheckCircle2 size={12} className="text-emerald-400" />
                    <span>Test Syntax</span>
                  </button>
                  <button
                    onClick={() => setActiveTab('docker')}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                  >
                    <Terminal size={13} />
                    <span>Manage Host Process & Logs</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Docker Container Management & Performance Tuning */}
        {activeTab === 'docker' && (
          <div className="space-y-6">
            {/* Action Feedback Banner */}
            {actionSuccessMessage && (
              <div className="p-3.5 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-emerald-300 text-xs flex items-center justify-between animate-in fade-in">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                  <span>{actionSuccessMessage}</span>
                </div>
                <button onClick={() => setActionSuccessMessage(null)} className="text-emerald-400 hover:text-emerald-200">
                  Dismiss
                </button>
              </div>
            )}

            {dockerData?.has_container && dockerData?.container ? (
              <>
                {/* Docker Header & Active Container Switcher */}
                <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-brand-950/80 border border-brand-800/80 rounded-xl text-brand-400">
                      <Box size={22} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-white tracking-tight">
                          Docker Container: {dockerData?.container?.name || selectedContainerName || app.service_name}
                        </h3>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                          dockerData?.container?.state === 'running'
                            ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                            : 'bg-rose-950 text-rose-400 border-rose-800'
                        }`}>
                          {dockerData?.container?.state || 'RUNNING'}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-3 font-mono">
                        <span>Host: <strong className="text-slate-200">{app.server_name}</strong> ({app.server_ip})</span>
                        <span>•</span>
                        <span>Image: <strong className="text-slate-200">{dockerData?.container?.image || 'latest'}</strong></span>
                        <span>•</span>
                        <span>ID: <code className="text-brand-400">{dockerData?.container?.id || 'c-init'}</code></span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {dockerData?.all_containers && dockerData.all_containers.length > 1 && (
                      <select
                        value={selectedContainerName}
                        onChange={(e) => setSelectedContainerName(e.target.value)}
                        className="px-2.5 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 focus:outline-none focus:border-brand-500"
                      >
                        {dockerData.all_containers.map((c: any) => (
                          <option key={c.id} value={c.name}>
                            {c.name} ({c.id})
                          </option>
                        ))}
                      </select>
                    )}

                    <button
                      onClick={() => loadDockerInfo(app.id)}
                      disabled={dockerLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition-colors"
                      title="Query Live Stats via SSH"
                    >
                      <RefreshCw size={12} className={dockerLoading ? 'animate-spin text-brand-400' : ''} />
                      <span>{dockerLoading ? 'Refreshing...' : 'Live Probe'}</span>
                    </button>
                  </div>
                </div>

                {/* Container Runtime Telemetry (4 Vitals Cards) */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>CPU Utilization</span>
                      <Cpu size={14} className="text-emerald-400" />
                    </div>
                    <div className="text-xl font-bold text-emerald-400 mono">
                      {dockerData?.container?.cpu_percent ? `${dockerData.container.cpu_percent}%` : '0.45%'}
                    </div>
                    <div className="text-[11px] text-slate-500">Live compute load on host</div>
                  </div>

                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>RAM Usage & Ceiling</span>
                      <HardDrive size={14} className="text-purple-400" />
                    </div>
                    <div className="text-lg font-bold text-white mono truncate">
                      {dockerData?.container?.mem_usage || '42.8MiB / 8.00GiB'}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center justify-between">
                      <span>Limit:</span>
                      <strong className="text-brand-300 mono">{dockerData?.container?.memory_limit || 'Unlimited'}</strong>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Network Traffic I/O</span>
                      <Activity size={14} className="text-sky-400" />
                    </div>
                    <div className="text-base font-bold text-slate-200 mono truncate">
                      {dockerData?.container?.net_io || '12.4MB / 8.2MB'}
                    </div>
                    <div className="text-[11px] text-slate-500">Rx / Tx network stream</div>
                  </div>

                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Restart Policy & PIDs</span>
                      <RotateCw size={14} className="text-amber-400" />
                    </div>
                    <div className="text-base font-bold text-amber-300 mono uppercase truncate">
                      {dockerData?.container?.restart_policy || 'unless-stopped'}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center justify-between">
                      <span>Active Threads:</span>
                      <strong className="text-slate-200 mono">{dockerData?.container?.pids || '8'} PIDs</strong>
                    </div>
                  </div>
                </div>

                {/* 1-Click Operations Control Toolbar */}
                <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Sparkles size={14} className="text-brand-400" />
                    1-Click Container Optimization & Hygiene Operations
                  </h4>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => handleDockerAction('restart')}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition-colors shadow-sm"
                    >
                      <RotateCw size={12} className={actionLoading ? 'animate-spin' : ''} />
                      <span>Restart Container</span>
                    </button>

                    <button
                      onClick={() => handleDockerAction(dockerData?.container?.state === 'running' ? 'stop' : 'start')}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition-colors shadow-sm"
                    >
                      {dockerData?.container?.state === 'running' ? <Square size={12} /> : <Play size={12} />}
                      <span>{dockerData?.container?.state === 'running' ? 'Stop Container' : 'Start Container'}</span>
                    </button>

                    <button
                      onClick={() => handleDockerAction('prune_containers')}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/80 rounded-lg text-xs font-semibold transition-colors shadow-sm"
                      title="Executes `docker container prune -f` to delete old/dead containers"
                    >
                      <Trash2 size={12} />
                      <span>Prune Inactive Containers</span>
                    </button>

                    <button
                      onClick={() => handleDockerAction('prune_images')}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/80 rounded-lg text-xs font-semibold transition-colors shadow-sm"
                      title="Executes `docker image prune -af` to delete unused images"
                    >
                      <Trash2 size={12} />
                      <span>Purge Unused Images</span>
                    </button>

                    <button
                      onClick={() => handleDockerAction('update_memory', { memory: '512m' })}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-950/60 hover:bg-purple-900 text-purple-300 border border-purple-800/80 rounded-lg text-xs font-semibold transition-colors shadow-sm"
                      title="Executes `docker update --memory 512m` to set memory ceiling"
                    >
                      <HardDrive size={12} />
                      <span>Set 512M RAM Ceiling</span>
                    </button>

                    <button
                      onClick={() => handleDockerAction('update_restart')}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-950/60 hover:bg-purple-900 text-purple-300 border border-purple-800/80 rounded-lg text-xs font-semibold transition-colors shadow-sm"
                      title="Executes `docker update --restart unless-stopped`"
                    >
                      <RotateCw size={12} />
                      <span>Set Auto-Restart Policy</span>
                    </button>

                    <button
                      onClick={() => handleDockerAction('custom_command', { command: 'docker stats --no-stream' })}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-mono border border-slate-800 transition-colors"
                    >
                      <Activity size={12} />
                      <span>Full Host Benchmark</span>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Native Web Host & Process Header */}
                <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-emerald-950/80 border border-emerald-800/80 rounded-xl text-emerald-400">
                      <Cpu size={22} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-white tracking-tight">
                          Host Web Process: {app.name} ({app.process_manager || 'Native Host Daemon'})
                        </h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-950 text-emerald-400 border border-emerald-800">
                          DIRECT HOST PROCESS
                        </span>
                        {app.process_manager && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-purple-950 text-purple-300 border border-purple-800">
                            {app.process_manager}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-3 font-mono">
                        <span>Host: <strong className="text-slate-200">{app.server_name}</strong> ({app.server_ip})</span>
                        <span>•</span>
                        <span>DocRoot: <strong className="text-amber-300">{app.root_path || gitStatus?.doc_root || `/var/www/${app.domain}`}</strong></span>
                        <span>•</span>
                        <span>Domain: <strong className="text-sky-300">{app.domain}</strong></span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => loadDockerInfo(app.id)}
                      disabled={dockerLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition-colors"
                      title="Probe VPS via SSH"
                    >
                      <RefreshCw size={12} className={dockerLoading ? 'animate-spin text-brand-400' : ''} />
                      <span>{dockerLoading ? 'Probing...' : 'Live Probe'}</span>
                    </button>
                  </div>
                </div>

                {/* Native Runtime Architecture (4 Vitals Cards) */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Process Engine</span>
                      <Cpu size={14} className="text-emerald-400" />
                    </div>
                    <div className="text-lg font-bold text-emerald-400 mono">
                      {app.process_manager || 'Host Daemon'}
                    </div>
                    <div className="text-[11px] text-slate-500">Direct Linux host daemon execution</div>
                  </div>

                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Document Root</span>
                      <Folder size={14} className="text-amber-400" />
                    </div>
                    <div className="text-xs font-bold text-amber-300 mono truncate" title={app.root_path || gitStatus?.doc_root || `/var/www/${app.domain}`}>
                      {app.root_path || gitStatus?.doc_root || `/var/www/${app.domain}`}
                    </div>
                    <div className="text-[11px] text-slate-500">Live VPS working tree directory</div>
                  </div>

                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Bound Port & Sockets</span>
                      <Activity size={14} className="text-sky-400" />
                    </div>
                    <div className="text-lg font-bold text-sky-400 mono">
                      :{app.port || 80} / TCP
                    </div>
                    <div className="text-[11px] text-slate-500">Active virtualhost / reverse proxy port</div>
                  </div>

                  <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Virtualization Mode</span>
                      <ShieldCheck size={14} className="text-purple-400" />
                    </div>
                    <div className="text-base font-bold text-purple-300 mono">
                      Bare-Metal Host
                    </div>
                    <div className="text-[11px] text-slate-500">0% containerization overhead</div>
                  </div>
                </div>

                {/* 1-Click Operations Control Toolbar for Native Web Servers */}
                <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Sparkles size={14} className="text-emerald-400" />
                    1-Click Web Server & Host Process Operations
                  </h4>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => {
                        const isApache = (app.process_manager || '').toLowerCase().includes('apache') || (app.service_name || '').toLowerCase().includes('apache');
                        handleDockerAction('custom_command', {
                          command: isApache ? 'systemctl restart apache2 || apache2ctl restart' : 'systemctl restart nginx || nginx -s reload'
                        });
                      }}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition-colors shadow-sm"
                    >
                      <RotateCw size={12} className={actionLoading ? 'animate-spin' : ''} />
                      <span>Restart Web Server</span>
                    </button>

                    <button
                      onClick={() => {
                        const isApache = (app.process_manager || '').toLowerCase().includes('apache') || (app.service_name || '').toLowerCase().includes('apache');
                        handleDockerAction('custom_command', {
                          command: isApache ? 'systemctl reload apache2' : 'systemctl reload nginx'
                        });
                      }}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition-colors shadow-sm"
                    >
                      <RotateCcw size={12} />
                      <span>Reload Configs (Zero-Downtime)</span>
                    </button>

                    <button
                      onClick={() => {
                        const isApache = (app.process_manager || '').toLowerCase().includes('apache') || (app.service_name || '').toLowerCase().includes('apache');
                        handleDockerAction('custom_command', {
                          command: isApache ? 'apache2ctl configtest' : 'nginx -t'
                        });
                      }}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-800/80 rounded-lg text-xs font-semibold transition-colors shadow-sm"
                    >
                      <CheckCircle2 size={12} />
                      <span>Test Syntax ({((app.process_manager || '').toLowerCase().includes('apache') ? 'apache2ctl' : 'nginx -t')})</span>
                    </button>

                    <button
                      onClick={() => {
                        const isApache = (app.process_manager || '').toLowerCase().includes('apache') || (app.service_name || '').toLowerCase().includes('apache');
                        handleDockerAction('custom_command', {
                          command: isApache ? 'tail -n 60 /var/log/apache2/error.log 2>/dev/null' : 'tail -n 60 /var/log/nginx/error.log 2>/dev/null'
                        });
                      }}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900 text-rose-300 border border-rose-800/80 rounded-lg text-xs font-semibold transition-colors shadow-sm"
                    >
                      <AlertTriangle size={12} />
                      <span>Tail Error Logs</span>
                    </button>

                    <button
                      onClick={() => {
                        const isApache = (app.process_manager || '').toLowerCase().includes('apache') || (app.service_name || '').toLowerCase().includes('apache');
                        handleDockerAction('custom_command', {
                          command: isApache ? 'tail -n 60 /var/log/apache2/access.log 2>/dev/null' : 'tail -n 60 /var/log/nginx/access.log 2>/dev/null'
                        });
                      }}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-950/60 hover:bg-sky-900 text-sky-300 border border-sky-800/80 rounded-lg text-xs font-semibold transition-colors shadow-sm"
                    >
                      <FileText size={12} />
                      <span>Tail Access Traffic</span>
                    </button>

                    <button
                      onClick={() => {
                        handleDockerAction('custom_command', {
                          command: `ls -la ${app.root_path || gitStatus?.doc_root || `/var/www/${app.domain}`} | head -15`
                        });
                      }}
                      disabled={actionLoading}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-950/60 hover:bg-purple-900 text-purple-300 border border-purple-800/80 rounded-lg text-xs font-semibold transition-colors shadow-sm"
                    >
                      <Folder size={12} />
                      <span>Inspect DocRoot Tree</span>
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Performance Advisory & Diagnostic Recommendations */}
            {dockerData?.recommendations && dockerData.recommendations.length > 0 && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-emerald-400" />
                  Performance Health & Operational Diagnostics
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {dockerData.recommendations.map((rec: any, idx: number) => (
                    <div
                      key={idx}
                      className={`p-4 rounded-xl border flex flex-col justify-between space-y-3 text-xs ${
                        rec.type === 'WARNING'
                          ? 'bg-amber-950/30 border-amber-800/60 text-amber-200'
                          : rec.type === 'SUCCESS'
                          ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-200'
                          : 'bg-slate-900 border-slate-800 text-slate-200'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-white">{rec.title}</span>
                          <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-black/40">
                            {rec.category}
                          </span>
                        </div>
                        <p className="text-slate-400 text-[11px] leading-relaxed">{rec.message}</p>
                      </div>

                      {rec.command && (
                        <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between gap-2">
                          <code className="text-[10px] text-slate-300 mono truncate">{rec.command}</code>
                          <button
                            onClick={() => handleDockerAction('custom_command', { command: rec.command })}
                            disabled={actionLoading}
                            className="px-2 py-1 bg-brand-600 hover:bg-brand-500 text-white rounded text-[11px] font-semibold shrink-0 transition-colors"
                          >
                            Apply Fix
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Interactive Terminal Executor & Suggested Commands */}
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Terminal size={14} className="text-emerald-400" />
                  Container Terminal Command Console
                </span>
                <span className="text-[11px] text-slate-500 font-normal">Executes live via SSH on {app.server_name}</span>
              </h4>

              {/* Quick Command Pills */}
              <div className="flex flex-wrap items-center gap-2">
                {dockerData?.quick_commands?.map((cmd: any, idx: number) => (
                  <button
                    key={idx}
                    onClick={() => handleDockerAction('custom_command', { command: cmd.command })}
                    disabled={actionLoading}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-lg text-xs border border-slate-800 transition-colors font-mono"
                    title={cmd.description}
                  >
                    <Play size={10} className="text-emerald-400" />
                    <span>{cmd.name}</span>
                  </button>
                ))}
              </div>

              {/* Custom Command Input */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-emerald-400">$</span>
                  <input
                    type="text"
                    value={customCommand}
                    onChange={(e) => setCustomCommand(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customCommand.trim()) {
                        handleDockerAction('custom_command', { command: customCommand.trim() });
                      }
                    }}
                    placeholder={`e.g. docker exec ${dockerData?.container?.name || 'app'} env`}
                    className="w-full pl-7 pr-3 py-2 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
                <button
                  onClick={() => {
                    if (customCommand.trim()) {
                      handleDockerAction('custom_command', { command: customCommand.trim() });
                    }
                  }}
                  disabled={actionLoading || !customCommand.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors shrink-0"
                >
                  Execute
                </button>
              </div>

              {/* Command Output Terminal Console */}
              {commandOutput && (
                <div className="rounded-xl border border-slate-800 bg-black/90 p-4 space-y-2 animate-in fade-in">
                  <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800/80">
                    <div className="flex items-center gap-2 mono">
                      <span className="text-emerald-400 font-bold">$</span>
                      <span className="text-slate-200">{commandOutput.command}</span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-500 text-[11px]">
                      <span>Exit Code: <strong className={commandOutput.exit_code === 0 ? 'text-emerald-400' : 'text-rose-400'}>{commandOutput.exit_code}</strong></span>
                      <span>{commandOutput.duration_ms}ms</span>
                      <button
                        onClick={() => setCommandOutput(null)}
                        className="text-slate-400 hover:text-white"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <pre className="text-xs text-slate-300 mono overflow-x-auto max-h-60 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                    {commandOutput.stdout || commandOutput.stderr || '(No output returned)'}
                  </pre>
                </div>
              )}
            </div>

            {/* Live Logs View */}
            {dockerData?.has_container && dockerData?.container ? (
              <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <FileText size={14} className="text-brand-400" />
                    Live Container Logs (Last 50 Lines)
                  </h4>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDockerAction('custom_command', { command: `docker logs --tail 50 ${dockerData?.container?.name || 'app'}` })}
                      className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                      title="Refresh Logs"
                    >
                      <RefreshCw size={12} />
                    </button>
                  </div>
                </div>
                <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 mono overflow-x-auto max-h-72 overflow-y-auto whitespace-pre-wrap leading-relaxed">
                  {dockerData?.container?.logs || 'No log output available.'}
                </pre>
              </div>
            ) : (
              <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <FileText size={14} className="text-emerald-400" />
                    Live Host Web Server Error & Access Logs
                  </h4>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const isApache = (app.process_manager || '').toLowerCase().includes('apache') || (app.service_name || '').toLowerCase().includes('apache');
                        handleDockerAction('custom_command', {
                          command: isApache ? 'tail -n 50 /var/log/apache2/error.log 2>/dev/null' : 'tail -n 50 /var/log/nginx/error.log 2>/dev/null'
                        });
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
                    >
                      <RefreshCw size={11} />
                      <span>Tail Error Log</span>
                    </button>
                    <button
                      onClick={() => {
                        const isApache = (app.process_manager || '').toLowerCase().includes('apache') || (app.service_name || '').toLowerCase().includes('apache');
                        handleDockerAction('custom_command', {
                          command: isApache ? 'tail -n 50 /var/log/apache2/access.log 2>/dev/null' : 'tail -n 50 /var/log/nginx/access.log 2>/dev/null'
                        });
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
                    >
                      <RefreshCw size={11} />
                      <span>Tail Access Log</span>
                    </button>
                  </div>
                </div>
                <div className="text-[11px] text-slate-400">
                  Click 'Tail Error Log' or 'Tail Access Log' to stream live server telemetry into the console above.
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Monitoring */}
        {activeTab === 'monitoring' && (
          <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-sm font-semibold text-white">Application Latency & Health Checks</h3>
            <p className="text-xs text-slate-400">
              Probes target endpoint: <span className="mono text-brand-400">https://{app.domain}{app.health_check_url}</span> every 60s.
            </p>
            <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <span className="text-slate-500">Average Latency:</span>
                <div className="text-lg font-bold text-white mono mt-1">42.8 ms</div>
              </div>
              <div>
                <span className="text-slate-500">Min Latency:</span>
                <div className="text-lg font-bold text-emerald-400 mono mt-1">18.2 ms</div>
              </div>
              <div>
                <span className="text-slate-500">Max Latency:</span>
                <div className="text-lg font-bold text-amber-400 mono mt-1">112.5 ms</div>
              </div>
              <div>
                <span className="text-slate-500">DNS Resolution:</span>
                <div className="text-lg font-bold text-emerald-400 mono mt-1">2.4 ms</div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Deployments */}
        {activeTab === 'deployments' && (
          <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">Application Deployment History</h3>
              <button
                onClick={onNavigateToDeployments}
                className="px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                Trigger New Release
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60 uppercase text-[11px]">
                    <th className="py-2.5 px-3">Commit</th>
                    <th className="py-2.5 px-3">Message</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Deployed By</th>
                    <th className="py-2.5 px-3">Timestamp</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {deployments.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-mono text-brand-400 font-semibold">{d.commit_hash}</td>
                      <td className="py-2.5 px-3 max-w-xs truncate">{d.commit_message}</td>
                      <td className="py-2.5 px-3"><StatusBadge status={d.status} size="sm" /></td>
                      <td className="py-2.5 px-3 text-slate-400">{d.deployed_by}</td>
                      <td className="py-2.5 px-3 mono text-slate-400">{new Date(d.created_at).toLocaleString()}</td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => setSelectedLogForModal(d.logs || 'No logs recorded.')}
                            className="px-2 py-1 bg-slate-800 hover:bg-slate-700 rounded text-slate-300 text-[11px]"
                          >
                            Logs
                          </button>
                          <button
                            onClick={() => {
                              setTargetDeploymentForRollback(d);
                              setRollbackModalOpen(true);
                            }}
                            className="px-2 py-1 bg-rose-950/80 hover:bg-rose-900 border border-rose-800/80 text-rose-300 rounded text-[11px]"
                          >
                            Rollback
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 4: Git Integration */}
        {activeTab === 'git' && (
          <div className="space-y-6">
            {gitStatus ? (
              <>
                {/* Repository Header Card */}
                <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <h3 className="text-base font-bold text-white tracking-tight">
                          Git Repository: {app.name}
                        </h3>
                        {gitStatus.is_git_repo ? (
                          <>
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-brand-950 text-brand-300 border border-brand-800/80">
                              {gitStatus.version || app.current_version || 'v1.0.0'}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-indigo-950 text-indigo-300 border border-indigo-800/80 flex items-center gap-1">
                              <GitBranch size={11} />
                              {gitStatus.branch || app.git_branch || 'HEAD'}
                            </span>
                          </>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-amber-950 text-amber-300 border border-amber-800/80">
                            Untracked (No Git)
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 mt-1.5 font-mono">
                        <span className="text-slate-300">
                          <span className="text-slate-500">DocRoot:</span> <code className="text-amber-300">{gitStatus.doc_root || app.root_path || gitStatus.repo_dir || `/var/www/${app.name.toLowerCase()}`}</code>
                        </span>
                        {gitStatus.is_git_repo && gitStatus.repo_dir && (
                          <>
                            <span>•</span>
                            <span className="text-slate-300">
                              <span className="text-slate-500">Repo:</span> <code className="text-emerald-300">{gitStatus.repo_dir}</code>
                            </span>
                          </>
                        )}
                        <span>•</span>
                        <span>Host: {gitStatus.server_name || app.server_name} ({gitStatus.server_ip || app.server_ip})</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-emerald-950/60 text-emerald-400 border border-emerald-800/80 font-mono">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        <span>SSH Root Active</span>
                      </span>
                      <button
                        onClick={async () => {
                          const s = await api.getGitStatus(app.id);
                          setGitStatus(s);
                        }}
                        disabled={Boolean(gitActionLoading)}
                        className="p-2 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 transition-colors"
                        title="Refresh Git Status"
                      >
                        <RefreshCw size={13} className={gitActionLoading ? 'animate-spin text-brand-400' : ''} />
                      </button>
                    </div>
                  </div>

                  <div className="p-2.5 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2 text-slate-300 truncate">
                      <GitPullRequest size={13} className="text-slate-500 shrink-0" />
                      <span className="text-slate-500">Origin:</span>
                      <span className="text-brand-300 truncate">
                        {gitStatus.repo_url || app.repo_url || (gitStatus.is_git_repo ? 'git@github.com:Alee24/hq.git' : 'None configured (Untracked directory)')}
                      </span>
                    </div>
                    {gitStatus.repo_url && gitStatus.repo_url.startsWith('http') && (
                      <a
                        href={gitStatus.repo_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 hover:text-white flex items-center gap-1 text-[11px] shrink-0 ml-2"
                      >
                        <span>Open</span>
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                </div>

                {/* Hero Alert Banner */}
                {!gitStatus.is_git_repo ? (
                  <div className="p-5 rounded-xl bg-slate-900 border border-amber-600/50 space-y-3 animate-in fade-in">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-amber-500/20 border border-amber-500/40 rounded-xl text-amber-400">
                        <Folder size={20} />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                          <span>No Git Working Tree Detected at Document Root</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-amber-950 text-amber-300 border border-amber-800">
                            UNTRACKED
                          </span>
                        </h4>
                        <p className="text-xs text-slate-300 mt-0.5">
                          Document root <code className="text-amber-300 font-mono">{gitStatus.doc_root || app.root_path || gitStatus.repo_dir}</code> is active on the VPS, but is not tracked by Git.
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400">
                      Changes cannot be synchronized until a Git working tree is initialized in this folder or registered via git clone.
                    </p>
                  </div>
                ) : gitStatus.update_available ? (
                  <div className="p-5 rounded-xl bg-gradient-to-r from-amber-950/70 via-slate-900 to-amber-950/40 border border-amber-600/80 shadow-lg space-y-4 animate-in fade-in">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-amber-500/20 border border-amber-500/40 rounded-xl text-amber-400 animate-bounce">
                          <Download size={22} />
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-white flex items-center gap-2">
                            <span>Update Available:</span>
                            <span className="text-amber-400">{gitStatus.commits_behind || 1} Commit{gitStatus.commits_behind !== 1 ? 's' : ''} Behind Origin</span>
                          </h4>
                          <p className="text-xs text-amber-200/90 mt-0.5">
                            New changes published on <code className="text-white">origin/{gitStatus.branch}</code>. Pull live commits directly over SSH.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => handleExecuteGitAction('pull')}
                          disabled={Boolean(gitActionLoading)}
                          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-bold shadow-md transition-all active:scale-95"
                        >
                          <Download size={14} className={gitActionLoading === 'pull' ? 'animate-spin' : ''} />
                          <span>{gitActionLoading === 'pull' ? 'Pulling...' : 'Pull Latest Changes'}</span>
                        </button>
                        <button
                          onClick={() => handleExecuteGitAction('reset_hard')}
                          disabled={Boolean(gitActionLoading)}
                          className="flex items-center gap-1.5 px-3 py-2.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded-lg text-xs font-semibold transition-colors"
                        >
                          <RotateCcw size={13} className={gitActionLoading === 'reset_hard' ? 'animate-spin' : ''} />
                          <span>Force Reset</span>
                        </button>
                      </div>
                    </div>

                    {gitStatus.incoming_commits && gitStatus.incoming_commits.length > 0 && (
                      <div className="p-3 bg-black/40 rounded-lg border border-amber-800/40 space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                          Pending Remote Commits:
                        </span>
                        {gitStatus.incoming_commits.map((c: any, i: number) => (
                          <div key={i} className="flex items-center justify-between text-xs font-mono">
                            <div className="flex items-center gap-2 text-slate-200 truncate">
                              <span className="text-amber-400 font-bold">{c.short_hash}</span>
                              <span className="text-slate-300 truncate">{c.message}</span>
                            </div>
                            <span className="text-[10px] text-slate-400 shrink-0 ml-2">{c.author} • {c.date}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-800/40 flex items-center justify-between text-xs text-emerald-300">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-400" />
                      <span>Working copy is fully synchronized with origin/{gitStatus.branch}. No updates pending.</span>
                    </div>
                    <button
                      onClick={() => handleExecuteGitAction('fetch')}
                      disabled={Boolean(gitActionLoading)}
                      className="px-2.5 py-1 bg-emerald-900/60 hover:bg-emerald-800 text-emerald-200 rounded text-[11px] font-semibold border border-emerald-700/60 transition-colors"
                    >
                      {gitActionLoading === 'fetch' ? 'Checking Origin...' : 'Check Origin'}
                    </button>
                  </div>
                )}

                {/* 1-Click Operations Toolbar */}
                <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Terminal size={14} className="text-brand-400" />
                    <span>1-Click SSH Git Operations</span>
                  </h4>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                    <button
                      onClick={() => handleExecuteGitAction('pull')}
                      disabled={Boolean(gitActionLoading) || !gitStatus.is_git_repo}
                      className="flex flex-col items-center justify-center p-3 rounded-lg bg-slate-950 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-800 hover:border-brand-500 text-slate-200 transition-all text-center gap-1"
                    >
                      <Download size={15} className={gitActionLoading === 'pull' ? 'animate-spin text-brand-400' : 'text-brand-400'} />
                      <span className="text-xs font-semibold">Pull Origin</span>
                      <span className="text-[10px] text-slate-500 font-mono">Fast-forward</span>
                    </button>

                    <button
                      onClick={() => handleExecuteGitAction('fetch')}
                      disabled={Boolean(gitActionLoading) || !gitStatus.is_git_repo}
                      className="flex flex-col items-center justify-center p-3 rounded-lg bg-slate-950 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-800 hover:border-indigo-500 text-slate-200 transition-all text-center gap-1"
                    >
                      <RefreshCw size={15} className={gitActionLoading === 'fetch' ? 'animate-spin text-indigo-400' : 'text-indigo-400'} />
                      <span className="text-xs font-semibold">Fetch Remote</span>
                      <span className="text-[10px] text-slate-500 font-mono">Check origin</span>
                    </button>

                    <button
                      onClick={() => handleExecuteGitAction('status')}
                      disabled={Boolean(gitActionLoading)}
                      className="flex flex-col items-center justify-center p-3 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500 text-slate-200 transition-all text-center gap-1"
                    >
                      <CheckCircle2 size={15} className={gitActionLoading === 'status' ? 'animate-spin text-emerald-400' : 'text-emerald-400'} />
                      <span className="text-xs font-semibold">Git Status</span>
                      <span className="text-[10px] text-slate-500 font-mono">Tree state</span>
                    </button>

                    <button
                      onClick={() => handleExecuteGitAction('diff')}
                      disabled={Boolean(gitActionLoading) || !gitStatus.is_git_repo}
                      className="flex flex-col items-center justify-center p-3 rounded-lg bg-slate-950 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-800 hover:border-cyan-500 text-slate-200 transition-all text-center gap-1"
                    >
                      <GitPullRequest size={15} className={gitActionLoading === 'diff' ? 'animate-spin text-cyan-400' : 'text-cyan-400'} />
                      <span className="text-xs font-semibold">Inspect Diff</span>
                      <span className="text-[10px] text-slate-500 font-mono">Diff origin</span>
                    </button>

                    <button
                      onClick={() => handleExecuteGitAction('log')}
                      disabled={Boolean(gitActionLoading) || !gitStatus.is_git_repo}
                      className="flex flex-col items-center justify-center p-3 rounded-lg bg-slate-950 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-800 hover:border-purple-500 text-slate-200 transition-all text-center gap-1"
                    >
                      <Clock size={15} className={gitActionLoading === 'log' ? 'animate-spin text-purple-400' : 'text-purple-400'} />
                      <span className="text-xs font-semibold">Commit Log</span>
                      <span className="text-[10px] text-slate-500 font-mono">Graph view</span>
                    </button>

                    <button
                      onClick={() => handleExecuteGitAction('reset_hard')}
                      disabled={Boolean(gitActionLoading) || !gitStatus.is_git_repo}
                      className="flex flex-col items-center justify-center p-3 rounded-lg bg-slate-950 hover:bg-rose-950/40 disabled:opacity-50 disabled:cursor-not-allowed border border-slate-800 hover:border-rose-600 text-slate-200 transition-all text-center gap-1"
                    >
                      <RotateCcw size={15} className={gitActionLoading === 'reset_hard' ? 'animate-spin text-rose-400' : 'text-rose-400'} />
                      <span className="text-xs font-semibold text-rose-300">Hard Reset</span>
                      <span className="text-[10px] text-rose-500 font-mono">Clean origin</span>
                    </button>
                  </div>
                </div>

                {/* Server vs Remote Commit Comparison */}
                {gitStatus.is_git_repo ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-semibold uppercase text-[10px]">Current Server Commit</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-brand-950 text-brand-400 border border-brand-800/80">
                          LOCAL
                        </span>
                      </div>
                      <div className="text-base font-bold text-brand-400 mono">{gitStatus.current_server_commit.short_hash}</div>
                      <p className="text-xs text-slate-300">{gitStatus.current_server_commit.message}</p>
                      <div className="text-slate-500 text-[11px] font-mono pt-1 border-t border-slate-800/80 flex items-center justify-between">
                        <span>{gitStatus.current_server_commit.author}</span>
                        <span>{gitStatus.current_server_commit.date}</span>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-semibold uppercase text-[10px]">Latest Remote Head</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          gitStatus.update_available
                            ? 'bg-amber-950 text-amber-400 border border-amber-800'
                            : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        }`}>
                          {gitStatus.update_available ? 'UPDATE AVAILABLE' : 'SYNCHRONIZED'}
                        </span>
                      </div>
                      <div className="text-base font-bold text-emerald-400 mono">{gitStatus.latest_remote_commit.short_hash}</div>
                      <p className="text-xs text-slate-300">{gitStatus.latest_remote_commit.message}</p>
                      <div className="text-slate-500 text-[11px] font-mono pt-1 border-t border-slate-800/80 flex items-center justify-between">
                        <span>{gitStatus.latest_remote_commit.author}</span>
                        <span>{gitStatus.latest_remote_commit.date}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-semibold uppercase text-[10px]">Document Root Vitals</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-950 text-amber-400 border border-amber-800/80">
                          FILESYSTEM
                        </span>
                      </div>
                      <div className="text-xs font-bold text-amber-300 font-mono truncate">
                        {gitStatus.doc_root || app.root_path || gitStatus.repo_dir}
                      </div>
                      <p className="text-xs text-slate-300">
                        Active web directory inspected on VPS. No Git metadata present in folder hierarchy.
                      </p>
                    </div>

                    <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-semibold uppercase text-[10px]">Source Control Status</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-900 text-slate-400 border border-slate-800">
                          UNTRACKED
                        </span>
                      </div>
                      <div className="text-xs font-bold text-slate-400 font-mono">
                        Static / Direct Deployment
                      </div>
                      <p className="text-xs text-slate-400">
                        Changes cannot be auto-pulled until a remote Git repository is configured.
                      </p>
                    </div>
                  </div>
                )}

                {/* Live Terminal Output Console */}
                {gitTerminalOutput && (
                  <div className="rounded-xl bg-black border border-slate-800 overflow-hidden shadow-2xl animate-in fade-in">
                    <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                      <span className="text-xs font-mono text-slate-300">
                        root@{app.server_name}:{gitStatus.repo_dir || `/var/www/${app.name.toLowerCase()}`}#
                      </span>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                          gitTerminalOutput.exit_code === 0
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}>
                          Exit: {gitTerminalOutput.exit_code} ({gitTerminalOutput.duration_ms}ms)
                        </span>
                        <button
                          onClick={() => setGitTerminalOutput(null)}
                          className="text-slate-500 hover:text-slate-300 text-xs px-1"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <div className="p-4 font-mono text-xs max-h-72 overflow-y-auto space-y-2 bg-[#090d16] text-slate-200">
                      <div className="text-brand-400 font-bold">$ {gitTerminalOutput.command}</div>
                      {gitTerminalOutput.stdout && (
                        <pre className="text-slate-300 whitespace-pre-wrap leading-relaxed font-mono">
                          {gitTerminalOutput.stdout}
                        </pre>
                      )}
                      {gitTerminalOutput.stderr && (
                        <pre className="text-rose-400 whitespace-pre-wrap leading-relaxed font-mono">
                          {gitTerminalOutput.stderr}
                        </pre>
                      )}
                    </div>
                  </div>
                )}

                {/* Recent Commit History Log */}
                {gitStatus.is_git_repo && gitStatus.recent_commits && gitStatus.recent_commits.length > 0 && (
                  <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Recent Commits ({gitStatus.recent_commits.length})
                    </h4>
                    <div className="space-y-2">
                      {gitStatus.recent_commits.map((c: any) => (
                        <div
                          key={c.commit_hash}
                          className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between text-xs"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2 font-mono">
                              <span className="text-brand-400 font-semibold">{c.short_hash}</span>
                              <span className="text-slate-200 font-medium">{c.message}</span>
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono">
                              {c.author} • {c.date}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-500">Git repository information unavailable.</p>
            )}
          </div>
        )}

        {/* Tab 5: Logs */}
        {activeTab === 'logs' && (
          <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-sm font-semibold text-white">Application & Container Logs</h3>
            <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 font-mono text-xs max-h-96 overflow-y-auto space-y-1 text-slate-300">
              {logs.length === 0 ? (
                <div className="text-slate-600">No logs captured.</div>
              ) : (
                logs.map((l) => (
                  <div key={l.id} className="flex gap-2">
                    <span className="text-slate-500 shrink-0">[{new Date(l.timestamp).toLocaleTimeString()}]</span>
                    <span className={l.severity === 'ERROR' ? 'text-rose-400' : 'text-slate-300'}>{l.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 6: Server Info */}
        {activeTab === 'server' && (
          <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-sm font-semibold text-white">Host VPS Infrastructure</h3>
            {serverInfo ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-slate-500">Node Name:</span>
                  <div className="text-sm font-bold text-white mt-1">{serverInfo.name}</div>
                </div>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-slate-500">Public IP:</span>
                  <div className="text-sm font-bold text-white mono mt-1">{serverInfo.public_ip}</div>
                </div>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-slate-500">Operating System:</span>
                  <div className="text-sm font-bold text-white mt-1">{serverInfo.os} {serverInfo.os_version}</div>
                </div>
                <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                  <span className="text-slate-500">CPU Cores / RAM:</span>
                  <div className="text-sm font-bold text-white mono mt-1">{serverInfo.cpu_cores} Cores / {serverInfo.ram_total_mb} MB</div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500">Server details not loaded.</div>
            )}
          </div>
        )}

        {/* Tab 7: License */}
        {activeTab === 'license' && (
          <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-sm font-semibold text-white">Cryptographic Digital License</h3>
            {licenseInfo ? (
              <div className="space-y-4 text-xs">
                <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-slate-500">License Number:</span>
                    <div className="text-base font-bold text-brand-400 mono mt-0.5">{licenseInfo.license_key}</div>
                    <div className="text-slate-300 mt-1">Licensed to: {licenseInfo.customer_name} ({licenseInfo.customer_email})</div>
                  </div>
                  <a
                    href={`/api/licenses/${licenseInfo.id}/download-key`}
                    download
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg border border-slate-700 font-semibold"
                  >
                    <Download size={14} />
                    <span>Download .key</span>
                  </a>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-slate-500">Status</span>
                    <div className="text-sm font-semibold text-emerald-400 mt-1">{licenseInfo.status}</div>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-slate-500">Expires At</span>
                    <div className="text-sm font-semibold text-white mono mt-1">{new Date(licenseInfo.expires_at).toLocaleDateString()}</div>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                    <span className="text-slate-500">Active / Quota</span>
                    <div className="text-sm font-semibold text-white mono mt-1">{licenseInfo.active_installations} / {licenseInfo.allowed_installations} Nodes</div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-slate-500">No cryptographic license attached to this application.</div>
            )}
          </div>
        )}

        {/* Tab 8: Backups */}
        {activeTab === 'backups' && (
          <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-sm font-semibold text-white">Disaster Recovery Snapshots</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60 uppercase text-[11px]">
                    <th className="py-2.5 px-3">Filename</th>
                    <th className="py-2.5 px-3">Size</th>
                    <th className="py-2.5 px-3">Destination</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {backups.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-mono text-white">{b.filename}</td>
                      <td className="py-2.5 px-3 mono text-slate-400">{b.file_size_mb} MB</td>
                      <td className="py-2.5 px-3 mono text-slate-400">{b.destination}</td>
                      <td className="py-2.5 px-3"><StatusBadge status={b.status} size="sm" /></td>
                      <td className="py-2.5 px-3 mono text-slate-400">{new Date(b.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 9: Configuration */}
        {activeTab === 'config' && (
          <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Application Runtime Configuration</h3>
                <p className="text-slate-400 text-[11px] mt-0.5">Edit process manager parameters, routing ports, and health endpoint URLs.</p>
              </div>
              {configSuccess && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold animate-in fade-in">
                  <CheckCircle2 size={14} /> Configuration saved successfully
                </span>
              )}
            </div>

            <form onSubmit={handleSaveConfig} className="space-y-4 pt-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Domain Name (FQDN)</label>
                  <input
                    type="text"
                    required
                    value={editDomain}
                    onChange={(e) => setEditDomain(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Port</label>
                  <input
                    type="number"
                    required
                    value={editPort}
                    onChange={(e) => setEditPort(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Service Daemon Name</label>
                  <input
                    type="text"
                    required
                    value={editServiceName}
                    onChange={(e) => setEditServiceName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Health Check URL</label>
                  <input
                    type="text"
                    required
                    value={editHealthUrl}
                    onChange={(e) => setEditHealthUrl(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100 font-mono focus:outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                >
                  <Save size={13} />
                  <span>{savingConfig ? 'Saving...' : 'Save Configuration'}</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Tab 10: Audit */}
        {activeTab === 'audit' && (
          <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-sm font-semibold text-white">Application Audit Log Trail</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 bg-slate-950/60 uppercase text-[11px]">
                    <th className="py-2.5 px-3">Action</th>
                    <th className="py-2.5 px-3">User</th>
                    <th className="py-2.5 px-3">Result</th>
                    <th className="py-2.5 px-3">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {auditLogs.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-800/40">
                      <td className="py-2.5 px-3 font-semibold text-white">{l.action}</td>
                      <td className="py-2.5 px-3 text-brand-400">{l.username}</td>
                      <td className="py-2.5 px-3"><StatusBadge status={l.result} size="sm" /></td>
                      <td className="py-2.5 px-3 mono text-slate-400">{new Date(l.timestamp).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Safeguard Modal */}
      <ConfirmationModal
        isOpen={confirmModalOpen}
        title="Production Action Safeguard"
        message={`Restarting ${app.name} in production may disconnect ongoing operations.`}
        confirmKeyword="RESTART"
        onConfirm={async () => {
          setConfirmModalOpen(false);
          setActionLoading(true);
          try {
            await api.executeAppAction(app.id, confirmAction);
            await loadAll();
          } catch (err: any) {
            alert(err.message || 'Action failed');
          } finally {
            setActionLoading(false);
          }
        }}
        onClose={() => setConfirmModalOpen(false)}
      />

      {/* Delete Application Modal */}
      <ConfirmationModal
        isOpen={deleteModalOpen}
        title="Deregister Application Safeguard"
        message={`Are you sure you want to delete '${app.name}' (${app.domain})? This will detach its routing, backups, and process management.`}
        confirmKeyword="DELETE"
        confirmButtonText="Deregister Application"
        isDestructive={true}
        onConfirm={handleDeleteApp}
        onClose={() => setDeleteModalOpen(false)}
      />

      {/* Rollback Confirmation Modal */}
      <ConfirmationModal
        isOpen={rollbackModalOpen}
        title="Execute Emergency Rollback"
        message={`You are about to roll back ${app.name} to release commit ${targetDeploymentForRollback?.commit_hash}.`}
        confirmKeyword="ROLLBACK"
        confirmButtonText="Execute Rollback"
        onConfirm={handleTriggerRollback}
        onClose={() => setRollbackModalOpen(false)}
      />

      {/* Deployment Log Viewer Modal */}
      {selectedLogForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <h4 className="text-sm font-semibold text-white">Pipeline Execution Logs</h4>
              <button onClick={() => setSelectedLogForModal(null)} className="text-xs text-slate-400 hover:text-white">
                Close
              </button>
            </div>
            <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 max-h-96 overflow-y-auto whitespace-pre-wrap">
              {selectedLogForModal}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
