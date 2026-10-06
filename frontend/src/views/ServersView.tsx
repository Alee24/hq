import React, { useEffect, useState } from 'react';
import {
  Server as ServerIcon,
  Plus,
  RefreshCw,
  Power,
  RotateCw,
  Cpu,
  HardDrive,
  Activity,
  Layers,
  Terminal,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Wifi,
  Database,
  Lock,
  Key,
  Play,
  Check,
  Send,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { api } from '../api/client';
import { Server, ServerMetric } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { ServerTerminalModal } from '../components/ServerTerminalModal';
import { ServerConnectionModal } from '../components/ServerConnectionModal';
import { DatabaseBackupModal } from '../components/DatabaseBackupModal';

export const ServersView: React.FC = () => {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedServer, setSelectedServer] = useState<Server | null>(null);
  const [processes, setProcesses] = useState<any[]>([]);

  // Dangerous action modal
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<string>('restart');
  const [pendingTargetServer, setPendingTargetServer] = useState<Server | null>(null);

  // Register Server Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newIp, setNewIp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newHostname, setNewHostname] = useState('');
  const [newProvider, setNewProvider] = useState('Custom VPS');
  const [newSshUser, setNewSshUser] = useState('root');
  const [newSshPort, setNewSshPort] = useState('22');
  const [showPassword, setShowPassword] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Terminal, Connection & Database Backup Modals
  const [terminalModalOpen, setTerminalModalOpen] = useState(false);
  const [terminalServer, setTerminalServer] = useState<Server | null>(null);

  const [connectionModalOpen, setConnectionModalOpen] = useState(false);
  const [connectionServer, setConnectionServer] = useState<Server | null>(null);

  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [backupServer, setBackupServer] = useState<Server | null>(null);

  const [testingId, setTestingId] = useState<string | null>(null);
  const [testNotice, setTestNotice] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  const loadServers = async (selectId?: string) => {
    try {
      const res = await api.listServers();
      setServers(res);
      if (res.length > 0) {
        const targetId = selectId || localStorage.getItem('cc_selected_server_id');
        const matched = targetId ? res.find((s) => s.id === targetId) : null;
        const toSelect = matched || res[0];
        setSelectedServer(toSelect);
        localStorage.setItem('cc_selected_server_id', toSelect.id);
        loadProcesses(toSelect.id);
      } else {
        setSelectedServer(null);
        setProcesses([]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadProcesses = async (serverId: string) => {
    try {
      const p = await api.getServerProcesses(serverId);
      setProcesses(p);
    } catch {
      setProcesses([]);
    }
  };

  useEffect(() => {
    loadServers();
  }, []);

  const handleServerSelect = (s: Server) => {
    setSelectedServer(s);
    localStorage.setItem('cc_selected_server_id', s.id);
    loadProcesses(s.id);
  };

  const handleOpenTerminal = (s: Server, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setTerminalServer(s);
    setTerminalModalOpen(true);
  };

  const handleOpenConnection = (s: Server, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setConnectionServer(s);
    setConnectionModalOpen(true);
  };

  const handleOpenBackup = (s: Server, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setBackupServer(s);
    setBackupModalOpen(true);
  };

  const handleTestPing = async (s: Server, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setTestingId(s.id);
    setTestNotice(null);
    try {
      const res = await api.testServerConnection(s.id);
      setTestNotice({
        id: s.id,
        text: `${res.latency_ms}ms • ${res.status}`,
        ok: res.success
      });
      loadServers();
    } catch (err: any) {
      setTestNotice({
        id: s.id,
        text: 'Unreachable',
        ok: false
      });
    } finally {
      setTestingId(null);
      setTimeout(() => setTestNotice(null), 4000);
    }
  };

  const triggerSafeCommand = (s: Server, action: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPendingTargetServer(s);
    setPendingAction(action);
    setConfirmModalOpen(true);
  };

  const handleRestartService = async (s: Server, serviceName: string) => {
    try {
      const res = await api.executeServerCommand(s.id, 'service_restart', undefined, serviceName);
      alert(res.message);
      loadServers();
    } catch (err: any) {
      alert(err.message || `Failed to restart service ${serviceName}`);
    }
  };

  const executeConfirmedCommand = async () => {
    if (!pendingTargetServer) return;
    setConfirmModalOpen(false);
    try {
      const res = await api.executeServerCommand(
        pendingTargetServer.id,
        pendingAction,
        pendingAction.toUpperCase()
      );
      alert(res.message);
      loadServers();
    } catch (err: any) {
      alert(err.message || 'Server operation failed');
    }
  };

  const handleRegisterServer = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const ipTrimmed = newIp.trim();
    const passTrimmed = newPassword.trim();

    if (!ipTrimmed) {
      setFormError('Public IPv4 address is required.');
      return;
    }
    if (!passTrimmed) {
      setFormError('SSH Root Password is required to establish management connection.');
      return;
    }

    setSubmitting(true);
    try {
      const s = await api.createServer({
        public_ip: ipTrimmed,
        ssh_password: passTrimmed,
        name: newName.trim() || undefined,
        hostname: newHostname.trim() || undefined,
        provider: newProvider.trim() || 'Custom VPS',
        ssh_user: newSshUser.trim() || 'root',
        ssh_port: parseInt(newSshPort) || 22,
        ssh_auth_type: 'PASSWORD'
      });
      setCreateModalOpen(false);
      setNewIp('');
      setNewPassword('');
      setNewName('');
      setNewHostname('');
      setNewProvider('Custom VPS');
      setNewSshUser('root');
      setNewSshPort('22');
      setShowAdvanced(false);
      await loadServers(s.id);
      setSuccessBanner(`Node ${s.name || ipTrimmed} (${ipTrimmed}) registered and credentials saved.`);
      setTimeout(() => setSuccessBanner(null), 5000);
    } catch (err: any) {
      setFormError(err.message || 'Failed to register server. Please verify credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            VPS Server Command Center
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Centralized bare-metal & VPS host management: interactive web terminal console, SSH connections, live telemetry, and automated database backups.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadServers()}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
            title="Refresh Server List"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
          >
            <Plus size={14} />
            <span>Add VPS Host</span>
          </button>
        </div>
      </div>

      {successBanner && (
        <div className="p-3.5 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-emerald-300 text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
            <span>{successBanner}</span>
          </div>
          <button onClick={() => setSuccessBanner(null)} className="text-emerald-400 hover:text-emerald-200 text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* Grid of Servers */}
      {loading ? (
        <div className="py-20 text-center text-slate-500 text-xs">Connecting to infrastructure nodes...</div>
      ) : servers.length === 0 ? (
        <div className="p-12 text-center bg-slate-900/60 border border-slate-800 rounded-xl space-y-3">
          <div className="w-12 h-12 rounded-xl bg-slate-800/80 flex items-center justify-center mx-auto text-slate-400">
            <ServerIcon size={24} />
          </div>
          <h3 className="text-sm font-semibold text-white">No VPS Hosts Connected</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Connect your first VPS server or bare-metal host using the lightweight agent or register a node manually.
          </p>
          <button
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold transition-colors mt-2"
          >
            <Plus size={14} />
            <span>Add VPS Host</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {servers.map((srv) => {
            const isSelected = selectedServer?.id === srv.id;
            const metric = srv.latest_metric;
            const cpu = metric?.cpu_percent || 0;
            const ram = metric?.ram_percent || 0;
            const disk = metric?.disk_percent || 0;
            const isTesting = testingId === srv.id;
            const notice = testNotice?.id === srv.id ? testNotice : null;

            return (
              <div
                key={srv.id}
                onClick={() => handleServerSelect(srv)}
                className={`p-5 rounded-xl border cursor-pointer transition-all space-y-4 ${
                  isSelected
                    ? 'bg-slate-900 border-brand-500 shadow-md ring-1 ring-brand-500/20'
                    : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* Node Title & Status Badge */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-slate-950 border border-slate-800 rounded-lg text-emerald-400">
                      <ServerIcon size={18} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-white">{srv.name}</h3>
                      <div className="text-[11px] text-slate-400 mono flex items-center gap-2">
                        <span>{srv.public_ip}:{srv.ssh_port || 22}</span>
                        {srv.has_ssh_key && (
                          <span className="text-[10px] text-brand-400 flex items-center gap-0.5" title="SSH Key Active">
                            <Key size={10} /> Key
                          </span>
                        )}
                        {srv.has_ssh_password && (
                          <span className="text-[10px] text-emerald-400 flex items-center gap-0.5" title="SSH Password Configured">
                            <Lock size={10} /> Password
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {notice && (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${notice.ok ? 'bg-emerald-950 text-emerald-400 border-emerald-800' : 'bg-rose-950 text-rose-400 border-rose-800'}`}>
                        {notice.text}
                      </span>
                    )}
                    <StatusBadge status={srv.status} size="sm" />
                  </div>
                </div>

                {/* Hardware utilization meters */}
                <div className="space-y-2 text-xs">
                  <div>
                    <div className="flex justify-between text-slate-400 text-[11px] mb-1">
                      <span>CPU Load ({srv.cpu_cores} Cores)</span>
                      <span className="mono font-semibold text-slate-200">{cpu}%</span>
                    </div>
                    <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full ${cpu > 90 ? 'bg-rose-500' : cpu > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${cpu}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-400 text-[11px] mb-1">
                      <span>RAM ({srv.ram_total_mb} MB)</span>
                      <span className="mono font-semibold text-slate-200">{ram}%</span>
                    </div>
                    <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-1.5 rounded-full ${ram > 90 ? 'bg-rose-500' : 'bg-blue-500'}`}
                        style={{ width: `${ram}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-400 text-[11px] mb-1">
                      <span>Disk Capacity ({srv.disk_total_gb} GB NVMe)</span>
                      <span className="mono font-semibold text-slate-200">{disk}%</span>
                    </div>
                    <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-1.5 rounded-full bg-purple-500"
                        style={{ width: `${disk}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Primary Card Actions */}
                <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800/80">
                  <button
                    onClick={(e) => handleOpenTerminal(srv, e)}
                    className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-slate-950 hover:bg-emerald-950/60 hover:text-emerald-300 border border-slate-800 rounded-lg text-[11px] font-semibold text-slate-200 transition-colors"
                  >
                    <Terminal size={12} className="text-emerald-400" />
                    <span>Terminal</span>
                  </button>

                  <button
                    onClick={(e) => handleOpenConnection(srv, e)}
                    className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-slate-950 hover:bg-brand-950/60 hover:text-brand-300 border border-slate-800 rounded-lg text-[11px] font-semibold text-slate-200 transition-colors"
                  >
                    <Wifi size={12} className="text-brand-400" />
                    <span>Connect</span>
                  </button>

                  <button
                    onClick={(e) => handleOpenBackup(srv, e)}
                    className="flex items-center justify-center gap-1.5 py-1.5 px-2 bg-slate-950 hover:bg-sky-950/60 hover:text-sky-300 border border-slate-800 rounded-lg text-[11px] font-semibold text-slate-200 transition-colors"
                  >
                    <Database size={12} className="text-sky-400" />
                    <span>Backup</span>
                  </button>
                </div>

                {/* Node Details & Safeguard Actions */}
                <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                  <span className="font-mono text-[10px]">
                    {srv.connection_type || 'SSH'} • <strong className="text-slate-300">v{srv.agent_version}</strong>
                  </span>
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => handleTestPing(srv, e)}
                      disabled={isTesting}
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors"
                      title="Test Connection & Latency"
                    >
                      <RefreshCw size={13} className={isTesting ? 'animate-spin' : ''} />
                    </button>
                    <button
                      onClick={(e) => triggerSafeCommand(srv, 'reboot', e)}
                      className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded transition-colors"
                      title="Reboot VPS Node"
                    >
                      <RotateCw size={13} />
                    </button>
                    <button
                      onClick={(e) => triggerSafeCommand(srv, 'restart', e)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                      title="Restart Host"
                    >
                      <Power size={13} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Selected Server Deep Dive */}
      {selectedServer && (
        <div className="space-y-4">
          {/* Node Action Toolbar */}
          <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse"></div>
              <div>
                <span className="font-semibold text-white text-sm">Managing: {selectedServer.name}</span>
                <span className="text-xs text-slate-400 ml-2 font-mono">({selectedServer.public_ip})</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleOpenTerminal(selectedServer)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
              >
                <Terminal size={14} />
                <span>Open Terminal</span>
              </button>

              <button
                onClick={() => handleOpenConnection(selectedServer)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition-colors"
              >
                <Wifi size={14} className="text-brand-400" />
                <span>SSH & Agent Setup</span>
              </button>

              <button
                onClick={() => handleOpenBackup(selectedServer)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition-colors"
              >
                <Database size={14} className="text-sky-400" />
                <span>Database Backups</span>
              </button>

              <div className="h-5 w-px bg-slate-800 hidden sm:block"></div>

              {/* Service Restarts */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleRestartService(selectedServer, 'docker')}
                  className="px-2.5 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded text-[11px] font-mono border border-slate-800"
                  title="Restart Docker Daemon"
                >
                  Restart Docker
                </button>
                <button
                  onClick={() => handleRestartService(selectedServer, 'nginx')}
                  className="px-2.5 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded text-[11px] font-mono border border-slate-800"
                  title="Restart Nginx Web Server"
                >
                  Restart Nginx
                </button>
                <button
                  onClick={() => handleRestartService(selectedServer, 'postgresql')}
                  className="px-2.5 py-1.5 bg-slate-950 hover:bg-slate-800 text-slate-300 rounded text-[11px] font-mono border border-slate-800"
                  title="Restart PostgreSQL"
                >
                  Restart Postgres
                </button>
              </div>

              <button
                onClick={() => triggerSafeCommand(selectedServer, 'restart')}
                className="flex items-center gap-1 px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded-lg text-xs font-semibold transition-colors"
              >
                <Power size={13} />
                <span>Restart Host</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Server Hardware & OS Inspector */}
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Terminal size={16} className="text-brand-400" />
                Hardware & Kernel Specification
              </h3>
              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Hostname:</span>
                  <span className="mono font-semibold text-slate-200">{selectedServer.hostname}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Operating System:</span>
                  <span className="text-slate-200 font-medium">{selectedServer.os} {selectedServer.os_version}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Kernel Version:</span>
                  <span className="mono text-slate-200">{selectedServer.kernel}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Hosting Provider:</span>
                  <span className="text-slate-200 font-medium">{selectedServer.provider}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Public IPv4:</span>
                  <span className="mono text-brand-400">{selectedServer.public_ip}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">SSH User & Port:</span>
                  <span className="mono text-slate-300">{selectedServer.ssh_user || 'root'}:{selectedServer.ssh_port || 22}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Connection Mode:</span>
                  <span className="mono text-slate-200 font-semibold">{selectedServer.connection_type || 'SSH'}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">Heartbeat Status:</span>
                  <span className="text-emerald-400 font-medium">Reporting Live</span>
                </div>
              </div>
            </div>

            {/* Running Process Manager Inspection */}
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4 col-span-2">
              <h3 className="text-sm font-semibold text-white flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Activity size={16} className="text-emerald-400" />
                  Active System Daemons & Top Processes ({selectedServer.name})
                </span>
                <button
                  onClick={() => loadProcesses(selectedServer.id)}
                  className="p-1 hover:bg-slate-800 text-slate-400 rounded"
                >
                  <RefreshCw size={12} />
                </button>
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 uppercase text-[10px]">
                      <th className="py-2.5 px-3">PID</th>
                      <th className="py-2.5 px-3">Service Process</th>
                      <th className="py-2.5 px-3">User</th>
                      <th className="py-2.5 px-3">CPU %</th>
                      <th className="py-2.5 px-3">RAM</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300 mono">
                    {processes.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-500">
                          No active agent process metrics reported yet. Connect server to stream process table.
                        </td>
                      </tr>
                    ) : (
                      processes.map((p) => (
                        <tr key={p.pid} className="hover:bg-slate-800/40">
                          <td className="py-2 px-3 text-slate-400">{p.pid}</td>
                          <td className="py-2 px-3 font-semibold text-white">{p.name}</td>
                          <td className="py-2 px-3 text-slate-400">{p.user}</td>
                          <td className="py-2 px-3 text-emerald-400">{p.cpu_percent}%</td>
                          <td className="py-2 px-3">{p.ram_mb} MB</td>
                          <td className="py-2 px-3"><span className="text-emerald-400 uppercase text-[10px]">{p.status}</span></td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dangerous Server Operation Modal */}
      <ConfirmationModal
        isOpen={confirmModalOpen}
        title={`Dangerous Operation: ${pendingAction.toUpperCase()} SERVER`}
        message={`You are about to ${pendingAction} host '${pendingTargetServer?.name}' (${pendingTargetServer?.public_ip}). This operation will temporarily interrupt all microservices and websites hosted on this VPS.`}
        confirmKeyword={pendingAction.toUpperCase()}
        confirmButtonText={`Execute ${pendingAction.toUpperCase()}`}
        isDestructive={true}
        onConfirm={executeConfirmedCommand}
        onClose={() => setConfirmModalOpen(false)}
      />

      {/* Add Server Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">Register New VPS Node</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Enter your server's IP address and SSH root password to connect.
                </p>
              </div>
              <div className="p-2 bg-brand-500/10 border border-brand-500/20 text-brand-400 rounded-lg">
                <ServerIcon size={18} />
              </div>
            </div>

            {formError && (
              <div className="p-3 bg-rose-950/60 border border-rose-800/80 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle size={15} className="shrink-0 text-rose-400" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleRegisterServer} className="space-y-3.5 text-xs">
              {/* Public IPv4 Address - REQUIRED */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                    <span>Public IPv4 Address</span>
                    <span className="text-rose-400 font-bold">*</span>
                  </label>
                  <span className="text-[10px] font-semibold text-brand-400 bg-brand-500/10 border border-brand-500/20 px-1.5 py-0.5 rounded">
                    Required
                  </span>
                </div>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newIp}
                  onChange={(e) => setNewIp(e.target.value)}
                  placeholder="e.g. 185.197.92.84"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 font-mono text-xs transition-colors"
                />
              </div>

              {/* SSH Root Password - REQUIRED */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                    <span>SSH Root Password</span>
                    <span className="text-rose-400 font-bold">*</span>
                  </label>
                  <span className="text-[10px] font-semibold text-brand-400 bg-brand-500/10 border border-brand-500/20 px-1.5 py-0.5 rounded">
                    Required
                  </span>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter root or sudo password"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 font-mono text-xs pr-10 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Used for interactive terminal commands, status monitoring, and automated backups.
                </p>
              </div>

              {/* Collapsible Optional Settings */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors font-medium py-1"
                >
                  {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  <span>{showAdvanced ? 'Hide Optional Settings' : 'Configure Optional Settings (Name, Port, User)'}</span>
                </button>

                {showAdvanced && (
                  <div className="mt-2.5 p-3.5 bg-slate-950/70 border border-slate-800/80 rounded-xl space-y-3 animate-in fade-in duration-100">
                    <div>
                      <label className="block text-slate-400 text-[11px] font-medium mb-1">
                        Server Display Name <span className="text-slate-600">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder={`Defaults to VPS-${newIp.trim() || 'IP'}`}
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 text-xs"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-slate-400 text-[11px] font-medium mb-1">
                          SSH User <span className="text-slate-600">(Default: root)</span>
                        </label>
                        <input
                          type="text"
                          value={newSshUser}
                          onChange={(e) => setNewSshUser(e.target.value)}
                          placeholder="root"
                          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-400 text-[11px] font-medium mb-1">
                          SSH Port <span className="text-slate-600">(Default: 22)</span>
                        </label>
                        <input
                          type="number"
                          value={newSshPort}
                          onChange={(e) => setNewSshPort(e.target.value)}
                          placeholder="22"
                          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-400 text-[11px] font-medium mb-1">
                        Hostname / FQDN <span className="text-slate-600">(Optional)</span>
                      </label>
                      <input
                        type="text"
                        value={newHostname}
                        onChange={(e) => setNewHostname(e.target.value)}
                        placeholder={`Defaults to ${newIp.trim() || 'IP'}`}
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-400 text-[11px] font-medium mb-1">
                        Cloud Provider <span className="text-slate-600">(Default: Custom VPS)</span>
                      </label>
                      <input
                        type="text"
                        value={newProvider}
                        onChange={(e) => setNewProvider(e.target.value)}
                        placeholder="Custom VPS"
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setCreateModalOpen(false);
                    setFormError(null);
                  }}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-colors font-medium text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white rounded-xl font-semibold transition-colors flex items-center gap-1.5 text-xs shadow-md shadow-brand-600/20"
                >
                  {submitting && <RefreshCw size={12} className="animate-spin" />}
                  <span>{submitting ? 'Registering...' : 'Register Node'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Terminal Modal */}
      {terminalServer && (
        <ServerTerminalModal
          server={terminalServer}
          isOpen={terminalModalOpen}
          onClose={() => setTerminalModalOpen(false)}
        />
      )}

      {/* Connection / SSH Modal */}
      {connectionServer && (
        <ServerConnectionModal
          server={connectionServer}
          isOpen={connectionModalOpen}
          onClose={() => setConnectionModalOpen(false)}
          onUpdated={(updated) => {
            setServers((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
            if (selectedServer?.id === updated.id) {
              setSelectedServer(updated);
            }
          }}
        />
      )}

      {/* Database Backup Modal */}
      {backupServer && (
        <DatabaseBackupModal
          server={backupServer}
          isOpen={backupModalOpen}
          onClose={() => setBackupModalOpen(false)}
        />
      )}
    </div>
  );
};
