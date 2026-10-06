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
  AlertTriangle
} from 'lucide-react';
import { api } from '../api/client';
import { Server, ServerMetric } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmationModal } from '../components/ConfirmationModal';

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
  const [newName, setNewName] = useState('');
  const [newHostname, setNewHostname] = useState('');
  const [newIp, setNewIp] = useState('');
  const [newProvider, setNewProvider] = useState('Hetzner Dedicated');

  const loadServers = async () => {
    try {
      const res = await api.listServers();
      setServers(res);
      if (res.length > 0 && !selectedServer) {
        setSelectedServer(res[0]);
        loadProcesses(res[0].id);
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
    loadProcesses(s.id);
  };

  const triggerSafeCommand = (s: Server, action: string) => {
    setPendingTargetServer(s);
    setPendingAction(action);
    setConfirmModalOpen(true);
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
    try {
      await api.createServer({
        name: newName,
        hostname: newHostname,
        public_ip: newIp,
        provider: newProvider,
      });
      setCreateModalOpen(false);
      setNewName('');
      setNewHostname('');
      setNewIp('');
      loadServers();
    } catch (err: any) {
      alert(err.message || 'Failed to register server');
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
            Centralized bare-metal & VPS host operating system management, safe whitelisted controls, and telemetry.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadServers()}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-slate-300 hover:text-white transition-colors"
          >
            <RefreshCw size={14} />
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

      {/* Servers Grid */}
      {servers.length === 0 ? (
        <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-xl space-y-3">
          <div className="p-3 bg-slate-950 border border-slate-800 w-12 h-12 rounded-xl mx-auto flex items-center justify-center text-slate-400">
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
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-slate-950 border border-slate-800 rounded-lg text-emerald-400">
                      <ServerIcon size={18} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-white">{srv.name}</h3>
                      <div className="text-[11px] text-slate-400 mono">{srv.public_ip}</div>
                    </div>
                  </div>
                  <StatusBadge status={srv.status} size="sm" />
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

                {/* Node Details & Safeguard Actions */}
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                  <span>Agent: <strong className="text-slate-300 font-mono">v{srv.agent_version}</strong></span>
                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => triggerSafeCommand(srv, 'reboot')}
                      className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-slate-800 rounded transition-colors"
                      title="Reboot VPS Node"
                    >
                      <RotateCw size={13} />
                    </button>
                    <button
                      onClick={() => triggerSafeCommand(srv, 'restart')}
                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                      title="Restart Server"
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Server Hardware & OS Inspector */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Terminal size={16} className="text-brand-400" />
              Hardware & Kernel Specification
            </h3>
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-500">Hostname:</span>
                <span className="mono font-semibold text-slate-200">{selectedServer.hostname}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-500">Operating System:</span>
                <span className="text-slate-200 font-medium">{selectedServer.os} {selectedServer.os_version}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-500">Kernel Version:</span>
                <span className="mono text-slate-200">{selectedServer.kernel}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-500">Hosting Provider:</span>
                <span className="text-slate-200 font-medium">{selectedServer.provider}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-500">Public IPv4:</span>
                <span className="mono text-brand-400">{selectedServer.public_ip}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-500">Private IP / Mesh:</span>
                <span className="mono text-slate-300">{selectedServer.private_ip || 'None'}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-500">SSH Port:</span>
                <span className="mono text-slate-300">{selectedServer.ssh_port}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500">Heartbeat Status:</span>
                <span className="text-emerald-400 font-medium">Reporting Live (0 latency)</span>
              </div>
            </div>
          </div>

          {/* Running Process Manager Inspection (Section 8) */}
          <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4 col-span-2">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Activity size={16} className="text-emerald-400" />
              Active System Daemons & Top Processes ({selectedServer.name})
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
                  {processes.map((p) => (
                    <tr key={p.pid} className="hover:bg-slate-800/40">
                      <td className="py-2 px-3 text-slate-400">{p.pid}</td>
                      <td className="py-2 px-3 font-semibold text-white">{p.name}</td>
                      <td className="py-2 px-3 text-slate-400">{p.user}</td>
                      <td className="py-2 px-3 text-emerald-400">{p.cpu_percent}%</td>
                      <td className="py-2 px-3">{p.ram_mb} MB</td>
                      <td className="py-2 px-3"><span className="text-emerald-400 uppercase text-[10px]">{p.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Dangerous Server Operation Modal (Section 7 Safeguard) */}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-white">Register New VPS Node</h3>
            <form onSubmit={handleRegisterServer} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Server Name</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. VPS-04-Analytics"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Hostname (FQDN)</label>
                <input
                  type="text"
                  required
                  value={newHostname}
                  onChange={(e) => setNewHostname(e.target.value)}
                  placeholder="e.g. vps04.infra.enterprise.net"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Public IPv4 Address</label>
                <input
                  type="text"
                  required
                  value={newIp}
                  onChange={(e) => setNewIp(e.target.value)}
                  placeholder="e.g. 109.199.111.54"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Cloud / Hardware Provider</label>
                <input
                  type="text"
                  value={newProvider}
                  onChange={(e) => setNewProvider(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-100"
                />
              </div>
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-600 text-white rounded-lg font-semibold"
                >
                  Register Node
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
