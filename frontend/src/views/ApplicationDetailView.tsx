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
  Save
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
    'overview' | 'monitoring' | 'deployments' | 'git' | 'logs' | 'server' | 'license' | 'backups' | 'config' | 'audit'
  >('overview');

  // Sub-data states
  const [deployments, setDeployments] = useState<DeploymentItem[]>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [gitStatus, setGitStatus] = useState<any>(null);
  const [serverInfo, setServerInfo] = useState<any>(null);
  const [licenseInfo, setLicenseInfo] = useState<any>(null);
  const [backups, setBackups] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);

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

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Sliders },
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
          <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-sm font-semibold text-white">Repository Synchronization Status</h3>
            {gitStatus ? (
              <div className="space-y-4 text-xs">
                <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-slate-500">Tracking Branch:</span>
                    <div className="text-sm font-semibold text-white mono mt-0.5">{gitStatus.branch}</div>
                    <div className="text-slate-400 mt-1">{gitStatus.repo_url}</div>
                  </div>
                  <button
                    onClick={async () => {
                      await api.pullGitChanges(app.id);
                      alert('Pulled remote updates successfully.');
                      loadAll();
                    }}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 font-semibold"
                  >
                    <GitPullRequest size={14} />
                    <span>Pull Origin</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
                    <span className="text-slate-500 font-semibold uppercase text-[10px]">Current Server Commit</span>
                    <div className="text-sm font-bold text-brand-400 mono">{gitStatus.current_server_commit.short_hash}</div>
                    <p className="text-slate-300 mt-1">{gitStatus.current_server_commit.message}</p>
                    <div className="text-slate-500 text-[11px]">Author: {gitStatus.current_server_commit.author}</div>
                  </div>

                  <div className="p-4 bg-slate-950 rounded-lg border border-slate-800 space-y-1">
                    <span className="text-slate-500 font-semibold uppercase text-[10px]">Latest Remote Commit</span>
                    <div className="text-sm font-bold text-emerald-400 mono">{gitStatus.latest_remote_commit.short_hash}</div>
                    <p className="text-slate-300 mt-1">{gitStatus.latest_remote_commit.message}</p>
                    <div className="text-slate-500 text-[11px]">Author: {gitStatus.latest_remote_commit.author}</div>
                  </div>
                </div>
              </div>
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
