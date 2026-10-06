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
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { api } from '../api/client';
import { Application } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { useEnvironment } from '../context/EnvironmentContext';

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

  // Restart Confirmation
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [selectedAppForAction, setSelectedAppForAction] = useState<Application | null>(null);
  const [pendingAction, setPendingAction] = useState<string>('restart');

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
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            Applications Inventory
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Central repository of all web applications, APIs, background daemons, and microservices.
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
            placeholder="Filter by name, domain, or commit hash..."
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
                      <div className="font-semibold text-white text-sm">No Applications Registered</div>
                      <p className="text-xs text-slate-500">
                        Register your first website, API, containerized microservice, or background daemon.
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
                apps.map((app) => (
                  <tr
                    key={app.id}
                    onClick={() => onSelectApp(app.id)}
                    className="hover:bg-slate-800/50 cursor-pointer transition-colors group"
                  >
                    {/* App Name & Domain */}
                    <td className="py-3 px-4 font-medium">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white group-hover:text-brand-400 transition-colors">
                          {app.name}
                        </span>
                        {app.is_maintenance && (
                          <span className="text-[10px] font-mono px-1 py-0.2 bg-blue-950 text-blue-300 border border-blue-800 rounded">
                            MAINT
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-400 mt-0.5 mono">
                        <span>{app.domain}</span>
                        <a
                          href={`https://${app.domain}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="hover:text-white"
                        >
                          <ExternalLink size={10} />
                        </a>
                      </div>
                    </td>

                    {/* Environment */}
                    <td className="py-3 px-4">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${
                        app.environment === 'production'
                          ? 'bg-purple-950/80 text-purple-300 border-purple-800/80'
                          : app.environment === 'staging'
                          ? 'bg-amber-950/80 text-amber-300 border-amber-800/80'
                          : 'bg-blue-950/80 text-blue-300 border-blue-800/80'
                      }`}>
                        {app.environment}
                      </span>
                    </td>

                    {/* Server & IP */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Server size={13} className="text-slate-500 shrink-0" />
                        <span className="truncate max-w-[130px]">{app.server_name || 'VPS Node'}</span>
                      </div>
                      <div className="text-slate-400 mono text-[11px] mt-0.5">{app.server_ip || '109.199.111.51'}</div>
                    </td>

                    {/* Process / Port */}
                    <td className="py-3 px-4">
                      <div className="text-slate-300 font-medium">{app.process_manager}</div>
                      <div className="text-slate-400 mono text-[11px] mt-0.5">Port :{app.port}</div>
                    </td>

                    {/* Git Head */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 mono">
                        <GitBranch size={12} className="text-slate-500" />
                        <span className="text-slate-300">{app.git_branch}</span>
                        <span className="text-brand-400 font-semibold px-1 py-0.2 bg-slate-950 rounded border border-slate-800">
                          {app.current_commit}
                        </span>
                      </div>
                      {app.current_commit !== app.latest_repo_commit && (
                        <div className="text-[10px] text-amber-400 font-semibold mt-0.5">
                          Update Available
                        </div>
                      )}
                    </td>

                    {/* Uptime */}
                    <td className="py-3 px-4 mono text-emerald-400 font-medium">
                      {app.uptime_percent}%
                    </td>

                    {/* Health Status */}
                    <td className="py-3 px-4">
                      <StatusBadge status={app.health_status} size="sm" />
                    </td>

                    {/* Operational Quick Actions */}
                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleAction(app, 'restart')}
                          disabled={actionInProgress === app.id}
                          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                          title="Graceful Restart"
                        >
                          <RotateCw size={13} className={actionInProgress === app.id ? 'animate-spin' : ''} />
                        </button>
                        <button
                          onClick={() => handleAction(app, app.health_status === 'OFFLINE' ? 'start' : 'stop')}
                          disabled={actionInProgress === app.id}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                          title={app.health_status === 'OFFLINE' ? 'Start Service' : 'Stop Service'}
                        >
                          {app.health_status === 'OFFLINE' ? <Play size={13} /> : <Square size={13} />}
                        </button>
                        <button
                          onClick={() => onSelectApp(app.id)}
                          className="p-1.5 text-brand-400 hover:text-brand-300 hover:bg-slate-800 rounded transition-colors"
                          title="View Details"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

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

      {/* Create Application Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-white">Register New Application</h3>
            <form onSubmit={handleCreateApp} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Application Name</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Student Portal"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Domain Name</label>
                <input
                  type="text"
                  required
                  value={newDomain}
                  onChange={(e) => setNewDomain(e.target.value)}
                  placeholder="e.g. portal.example.com"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Port</label>
                  <input
                    type="number"
                    value={newPort}
                    onChange={(e) => setNewPort(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Environment</label>
                  <select
                    value={newEnvironment}
                    onChange={(e) => setNewEnvironment(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                  >
                    <option value="production">Production</option>
                    <option value="staging">Staging</option>
                    <option value="development">Development</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Hosting Server</label>
                <select
                  value={newServerId}
                  onChange={(e) => setNewServerId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                >
                  <option value="">None (Unassigned / Cloud / External)</option>
                  {serversList.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.public_ip})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-500 font-semibold"
                >
                  Register Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
