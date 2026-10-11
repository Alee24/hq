import React, { useEffect, useState } from 'react';
import {
  Layers,
  Plus,
  Search,
  ExternalLink,
  RotateCw,
  Square,
  Play,
  ShieldCheck,
  Server,
  GitBranch,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  AlertCircle,
  Trash2,
  Box,
  Terminal,
  Database,
  Cpu,
  X
} from 'lucide-react';
import { api } from '../api/client';
import { Application, ApplicationComponent } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { useEnvironment } from '../context/EnvironmentContext';
import { Button, InputField, SelectField, ModalShell, EmptyState } from '../components/common';

interface ApplicationsViewProps {
  onSelectApp: (appId: string) => void;
}

export const ApplicationsView: React.FC<ApplicationsViewProps> = ({ onSelectApp }) => {
  const { environment } = useEnvironment();
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  // Suite Expansion State (tracks which application suites have their components drawer expanded)
  const [expandedSuites, setExpandedSuites] = useState<Set<string>>(new Set());

  // Component & Suite Actions In-Progress State
  const [componentActionInProgress, setComponentActionInProgress] = useState<Record<string, string>>({});
  const [suiteActionInProgress, setSuiteActionInProgress] = useState<Record<string, string>>({});

  // Container Logs Modal State
  const [logsModal, setLogsModal] = useState<{
    appName: string;
    componentName: string;
    logs: string;
    loading: boolean;
  } | null>(null);

  // Restart Confirmation
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [selectedAppForAction, setSelectedAppForAction] = useState<Application | null>(null);
  const [pendingAction, setPendingAction] = useState<string>('restart');

  // Delete Confirmation
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedAppForDelete, setSelectedAppForDelete] = useState<Application | null>(null);

  // Create App Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [newPort, setNewPort] = useState(80);
  const [newServerId, setNewServerId] = useState('');
  const [newServiceName, setNewServiceName] = useState('');
  const [newEnvironment, setNewEnvironment] = useState('production');
  const [serversList, setServersList] = useState<any[]>([]);

  const loadData = async () => {
    try {
      const res = await api.listApplications(environment, statusFilter, search);
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

  useEffect(() => {
    loadData();
  }, [environment, statusFilter, search]);

  const toggleSuiteExpanded = (appId: string) => {
    setExpandedSuites((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) {
        next.delete(appId);
      } else {
        next.add(appId);
      }
      return next;
    });
  };

  const handleAction = async (app: Application, action: string) => {
    if (action === 'restart' && app.environment === 'production') {
      setSelectedAppForAction(app);
      setPendingAction('restart');
      setConfirmModalOpen(true);
      return;
    }

    setActionInProgress(app.id);
    try {
      await api.executeAppAction(app.id, action);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setActionInProgress(null);
    }
  };

  const executeConfirmedAction = async () => {
    if (!selectedAppForAction) return;
    setConfirmModalOpen(false);
    setActionInProgress(selectedAppForAction.id);
    try {
      await api.executeAppAction(selectedAppForAction.id, pendingAction);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setActionInProgress(null);
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

  // Component-level action (e.g. restart only gatepass_db, gatepass_backend, etc.)
  const handleComponentAction = async (app: Application, componentName: string, action: string) => {
    const key = `${app.id}-${componentName}`;
    setComponentActionInProgress((prev) => ({ ...prev, [key]: action }));
    try {
      const res = await api.executeComponentAction(app.id, componentName, action);
      if (res.success) {
        await loadData();
      } else {
        alert(res.message || `Failed to ${action} ${componentName}`);
      }
    } catch (err: any) {
      alert(err.message || `Failed to ${action} ${componentName}`);
    } finally {
      setComponentActionInProgress((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  // Suite-level coordinated action (e.g. restart all containers in the suite)
  const handleSuiteAction = async (app: Application, action: string) => {
    setSuiteActionInProgress((prev) => ({ ...prev, [app.id]: action }));
    try {
      const compNames = app.components?.map((c) => c.service_name || c.name);
      const res = await api.executeSuiteAction(app.id, action, compNames);
      if (res.success) {
        await loadData();
      } else {
        alert(res.message || `Failed to ${action} suite`);
      }
    } catch (err: any) {
      alert(err.message || `Failed to ${action} suite`);
    } finally {
      setSuiteActionInProgress((prev) => {
        const next = { ...prev };
        delete next[app.id];
        return next;
      });
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

  const getRoleBadge = (role: string, label: string) => {
    switch (role) {
      case 'frontend':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-950 text-sky-300 border border-sky-800">
            🌐 {label}
          </span>
        );
      case 'backend':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-950 text-purple-300 border border-purple-800">
            ⚙️ {label}
          </span>
        );
      case 'database':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-800">
            🗄️ {label}
          </span>
        );
      case 'cache':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-800">
            ⚡ {label}
          </span>
        );
      case 'certbot':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-950 text-teal-300 border border-teal-800">
            🔒 {label}
          </span>
        );
      case 'agent':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">
            📡 {label}
          </span>
        );
      case 'worker':
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-900 text-slate-300 border border-slate-700">
            ⏳ {label}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-900 text-slate-300 border border-slate-800">
            📦 {label || 'Service'}
          </span>
        );
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Applications Inventory
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Unified view of applications and multi-container Docker suites. Sibling microservices (frontend, backend, database) are consolidated into one application per line with dropdown controls.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadData()}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} />
          </button>

          <button
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-medium shadow-sm transition-colors"
          >
            <Plus size={14} />
            <span>Register Application</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-2.5 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by application name, domain, or suite..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 px-3 py-1.5 focus:outline-none focus:border-brand-500"
          >
            <option value="all">All Statuses</option>
            <option value="ONLINE">Online</option>
            <option value="DEGRADED">Degraded</option>
            <option value="OFFLINE">Offline</option>
            <option value="MAINTENANCE">Maintenance</option>
          </select>
        </div>
      </div>

      {/* Applications Data Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Application</th>
                <th className="py-3 px-4">Environment</th>
                <th className="py-3 px-4">Server & IP</th>
                <th className="py-3 px-4">Process / Port</th>
                <th className="py-3 px-4">Git Head</th>
                <th className="py-3 px-4">Uptime</th>
                <th className="py-3 px-4">Health</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500">
                    Loading applications directory...
                  </td>
                </tr>
              ) : apps.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-400">
                    <div className="space-y-3 max-w-sm mx-auto">
                      <div className="p-3 bg-slate-950 border border-slate-800 w-12 h-12 rounded-xl mx-auto flex items-center justify-center text-slate-400">
                        <Layers size={24} />
                      </div>
                      <div className="font-semibold text-white text-sm">No Applications Found</div>
                      <p className="text-xs text-slate-500">
                        Register your first website, API, or multi-container microservice suite.
                      </p>
                      <button
                        onClick={() => setCreateModalOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                      >
                        <Plus size={14} />
                        <span>Register First Application</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                apps.map((app) => {
                  const isSuite = Boolean(app.is_suite && app.components && app.components.length > 1);
                  const isExpanded = expandedSuites.has(app.id);
                  const isSuiteBusy = Boolean(suiteActionInProgress[app.id]);

                  return (
                    <React.Fragment key={app.id}>
                      {/* Main Application Row (Strictly ONE per line) */}
                      <tr
                        onClick={() => {
                          if (isSuite) {
                            toggleSuiteExpanded(app.id);
                          } else {
                            onSelectApp(app.id);
                          }
                        }}
                        className={`hover:bg-slate-800/50 cursor-pointer transition-colors group ${
                          isExpanded ? 'bg-slate-800/30' : ''
                        }`}
                      >
                        {/* App Name, Suite Indicator & Domain */}
                        <td className="py-3 px-4 font-medium">
                          <div className="flex items-center gap-2">
                            {isSuite && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleSuiteExpanded(app.id);
                                }}
                                className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors"
                                title={isExpanded ? 'Collapse microservices' : 'Expand microservices dropdown'}
                              >
                                {isExpanded ? (
                                  <ChevronDown size={14} className="text-brand-400" />
                                ) : (
                                  <ChevronRight size={14} />
                                )}
                              </button>
                            )}

                            <span className="font-semibold text-white group-hover:text-brand-400 transition-colors">
                              {app.name}
                            </span>

                            {isSuite && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-brand-950/80 text-brand-300 border border-brand-800/80">
                                <Box size={10} />
                                {app.components?.length || app.component_count || 1} Services
                              </span>
                            )}

                            {app.is_maintenance && (
                              <span className="text-[10px] font-mono px-1 py-0.2 bg-blue-950 text-blue-300 border border-blue-800 rounded">
                                MAINT
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 text-slate-400 mt-0.5 mono">
                            <span>{app.domain || `${app.service_name}.local`}</span>
                            {app.domain && !app.domain.endsWith('.local') && (
                              <a
                                href={`https://${app.domain}`}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="hover:text-white"
                              >
                                <ExternalLink size={10} />
                              </a>
                            )}
                          </div>
                        </td>

                        {/* Environment */}
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${
                              app.environment === 'production'
                                ? 'bg-purple-950/80 text-purple-300 border-purple-800/80'
                                : app.environment === 'staging'
                                ? 'bg-amber-950/80 text-amber-300 border-amber-800/80'
                                : 'bg-blue-950/80 text-blue-300 border-blue-800/80'
                            }`}
                          >
                            {app.environment}
                          </span>
                        </td>

                        {/* Server & IP */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 text-slate-300">
                            <Server size={13} className="text-slate-500 shrink-0" />
                            <span className="truncate max-w-[130px]">{app.server_name || 'VPS Node'}</span>
                          </div>
                          <div className="text-slate-400 mono text-[11px] mt-0.5">
                            {app.server_ip || '185.192.97.84'}
                          </div>
                        </td>

                        {/* Process / Port */}
                        <td className="py-3 px-4">
                          <div className="text-slate-300 font-medium">
                            {isSuite ? 'Docker Compose' : app.process_manager}
                          </div>
                          <div className="text-slate-400 mono text-[11px] mt-0.5">
                            {isSuite ? (
                              <span>
                                Ports:{' '}
                                {app.components
                                  ?.map((c) => c.port)
                                  .filter((p) => p && p !== 80)
                                  .slice(0, 3)
                                  .join(', ') || 'Internal'}
                              </span>
                            ) : (
                              `Port :${app.port}`
                            )}
                          </div>
                        </td>

                        {/* Git Head */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5 mono">
                            <GitBranch size={12} className="text-slate-500" />
                            <span className="text-slate-300">{app.git_branch || 'main'}</span>
                            <span className="text-brand-400 font-semibold px-1 py-0.2 bg-slate-950 rounded border border-slate-800">
                              {app.current_commit || 'HEAD'}
                            </span>
                          </div>
                          {app.current_commit && app.current_commit !== app.latest_repo_commit && (
                            <div className="text-[10px] text-amber-400 font-semibold mt-0.5">
                              Update Available
                            </div>
                          )}
                        </td>

                        {/* Uptime */}
                        <td className="py-3 px-4 mono text-emerald-400 font-medium">
                          {app.uptime_percent || 99.98}%
                        </td>

                        {/* Health Status */}
                        <td className="py-3 px-4">
                          <StatusBadge status={app.health_status} size="sm" />
                        </td>

                        {/* Operational Quick Actions */}
                        <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            {isSuite ? (
                              <>
                                <button
                                  onClick={() => toggleSuiteExpanded(app.id)}
                                  className={`px-2 py-1 rounded text-[11px] font-semibold border transition-colors flex items-center gap-1 ${
                                    isExpanded
                                      ? 'bg-brand-950 text-brand-300 border-brand-800'
                                      : 'bg-slate-950 hover:bg-slate-800 text-slate-300 border-slate-800'
                                  }`}
                                  title={isExpanded ? 'Hide services dropdown' : 'View microservices dropdown'}
                                >
                                  <span>{isExpanded ? 'Hide' : 'Services'}</span>
                                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                </button>

                                <button
                                  onClick={() => handleSuiteAction(app, 'restart')}
                                  disabled={isSuiteBusy}
                                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                                  title="Restart Entire Suite (All Containers)"
                                >
                                  <RotateCw
                                    size={13}
                                    className={isSuiteBusy ? 'animate-spin text-brand-400' : ''}
                                  />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleAction(app, 'restart')}
                                  disabled={actionInProgress === app.id}
                                  className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                                  title="Graceful Restart"
                                >
                                  <RotateCw
                                    size={13}
                                    className={actionInProgress === app.id ? 'animate-spin' : ''}
                                  />
                                </button>
                                <button
                                  onClick={() =>
                                    handleAction(app, app.health_status === 'OFFLINE' ? 'start' : 'stop')
                                  }
                                  disabled={actionInProgress === app.id}
                                  className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                                  title={app.health_status === 'OFFLINE' ? 'Start Service' : 'Stop Service'}
                                >
                                  {app.health_status === 'OFFLINE' ? <Play size={13} /> : <Square size={13} />}
                                </button>
                              </>
                            )}

                            <button
                              onClick={() => {
                                setSelectedAppForDelete(app);
                                setDeleteModalOpen(true);
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                              title="Delete Application"
                            >
                              <Trash2 size={13} />
                            </button>

                            <button
                              onClick={() => onSelectApp(app.id)}
                              className="p-1.5 text-brand-400 hover:text-brand-300 hover:bg-slate-800 rounded transition-colors"
                              title="View Full Dashboard"
                            >
                              <ChevronRight size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Dropdown Drawer for Microservice Containers */}
                      {isSuite && isExpanded && (
                        <tr className="bg-slate-950/80 border-b border-slate-800">
                          <td colSpan={8} className="p-4 pl-6 md:pl-10">
                            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 space-y-3.5 shadow-inner">
                              {/* Drawer Header */}
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
                                <div>
                                  <div className="text-xs font-bold text-white flex items-center gap-2">
                                    <Box size={14} className="text-brand-400" />
                                    <span>{app.name} &mdash; Microservices & Sub-Containers</span>
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono font-medium">
                                      {app.components?.length || 0} Components
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-slate-400 mt-0.5">
                                    Individually manage, restart, or inspect any container (Database, API, Frontend, Cache, etc.) independently without stopping the rest of the application.
                                  </p>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleSuiteAction(app, 'restart')}
                                    disabled={isSuiteBusy}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-sm disabled:opacity-50"
                                    title="Restart all containers in coordinated order (DB -> Backend -> Frontend)"
                                  >
                                    <RotateCw
                                      size={12}
                                      className={isSuiteBusy ? 'animate-spin' : ''}
                                    />
                                    <span>Restart Entire Suite</span>
                                  </button>
                                </div>
                              </div>

                              {/* Component Grid */}
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                {app.components?.map((comp) => {
                                  const actionKey = `${app.id}-${comp.name}`;
                                  const isBusy = Boolean(componentActionInProgress[actionKey]);

                                  return (
                                    <div
                                      key={comp.id || comp.name}
                                      className="p-3 bg-slate-950 border border-slate-800/90 rounded-lg hover:border-slate-700 transition-all flex flex-col justify-between gap-2.5"
                                    >
                                      <div className="flex items-start justify-between gap-2">
                                        <div>
                                          <div className="flex items-center gap-1.5">
                                            {getRoleBadge(comp.role, comp.role_label)}
                                          </div>
                                          <div
                                            className="font-mono text-xs font-semibold text-white mt-1 truncate max-w-[170px]"
                                            title={comp.name}
                                          >
                                            {comp.name}
                                          </div>
                                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
                                            <span className="font-mono">Port :{comp.port}</span>
                                            <span>&bull;</span>
                                            <span>{comp.process_manager || 'Docker'}</span>
                                          </div>
                                        </div>
                                        <StatusBadge status={comp.health_status} size="sm" />
                                      </div>

                                      {/* Individual Component Controls */}
                                      <div className="flex items-center justify-between gap-1 pt-2 border-t border-slate-800/80">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <button
                                            onClick={() => handleComponentAction(app, comp.name, 'restart')}
                                            disabled={isBusy}
                                            className="flex items-center gap-1 px-2 py-1 bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-slate-200 hover:text-white rounded text-[11px] font-medium transition-colors disabled:opacity-50"
                                            title={`Restart ${comp.name} container only`}
                                          >
                                            <RotateCw
                                              size={11}
                                              className={
                                                componentActionInProgress[actionKey] === 'restart'
                                                  ? 'animate-spin text-brand-400'
                                                  : ''
                                              }
                                            />
                                            <span>Restart</span>
                                          </button>

                                          <button
                                            onClick={() =>
                                              handleComponentAction(
                                                app,
                                                comp.name,
                                                comp.health_status === 'OFFLINE' || comp.health_status === 'STOPPED'
                                                  ? 'start'
                                                  : 'stop'
                                              )
                                            }
                                            disabled={isBusy}
                                            className={`flex items-center gap-1 px-2 py-1 border rounded text-[11px] font-medium transition-colors disabled:opacity-50 ${
                                              comp.health_status === 'OFFLINE' || comp.health_status === 'STOPPED'
                                                ? 'bg-emerald-950/60 hover:bg-emerald-900/60 border-emerald-800 text-emerald-300'
                                                : 'bg-rose-950/40 hover:bg-rose-900/40 border-rose-800/80 text-rose-300'
                                            }`}
                                            title={`${
                                              comp.health_status === 'OFFLINE' || comp.health_status === 'STOPPED'
                                                ? 'Start'
                                                : 'Stop'
                                            } ${comp.name}`}
                                          >
                                            {comp.health_status === 'OFFLINE' || comp.health_status === 'STOPPED' ? (
                                              <>
                                                <Play size={11} />
                                                <span>Start</span>
                                              </>
                                            ) : (
                                              <>
                                                <Square size={11} />
                                                <span>Stop</span>
                                              </>
                                            )}
                                          </button>
                                        </div>

                                        <button
                                          onClick={() => handleViewComponentLogs(app, comp.name)}
                                          className="flex items-center gap-1 px-1.5 py-1 text-slate-400 hover:text-sky-300 hover:bg-slate-800 rounded transition-colors text-[11px]"
                                          title={`View logs for ${comp.name}`}
                                        >
                                          <Terminal size={12} />
                                          <span>Logs</span>
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
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
            <div className="flex items-center justify-between w-full">
              <span className="text-[11px] text-slate-400">
                Showing last 100 stdout lines from Docker daemon.
              </span>
              <Button variant="secondary" onClick={() => setLogsModal(null)}>
                Close
              </Button>
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
    </div>
  );
};
