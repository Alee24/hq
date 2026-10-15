import React, { useEffect, useState } from 'react';
import {
  Server as ServerIcon,
  Plus,
  RefreshCw,
  Power,
  RotateCw,
  RotateCcw,
  Camera,
  Archive,
  Clock,
  Cpu,
  HardDrive,
  Activity,
  Layers,
  Terminal,
  ShieldAlert,
  ShieldCheck,
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
  ChevronUp,
  Trash2,
  Globe,
  Search,
  ExternalLink
} from 'lucide-react';
import { api } from '../api/client';

import { Server, ServerMetric, ServerSnapshot } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { ServerTerminalModal } from '../components/ServerTerminalModal';
import { ServerConnectionModal } from '../components/ServerConnectionModal';
import { DatabaseBackupModal } from '../components/DatabaseBackupModal';

interface ServersViewProps {
  onSelectServer?: (serverId: string) => void;
}

export const ServersView: React.FC<ServersViewProps> = ({ onSelectServer }) => {
  const [servers, setServers] = useState<Server[]>(() => {
    try {
      const cached = localStorage.getItem('cc_cached_servers');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState<boolean>(() => {
    try {
      const cached = localStorage.getItem('cc_cached_servers');
      return !cached || JSON.parse(cached).length === 0;
    } catch {
      return true;
    }
  });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedServer, setSelectedServer] = useState<Server | null>(() => {
    try {
      const cached = localStorage.getItem('cc_cached_servers');
      const list: Server[] = cached ? JSON.parse(cached) : [];
      const targetId = localStorage.getItem('cc_selected_server_id');
      return (targetId ? list.find(s => s.id === targetId) : list[0]) || null;
    } catch {
      return null;
    }
  });
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
  const [newUseSudo, setNewUseSudo] = useState(false);
  const [newSudoPassword, setNewSudoPassword] = useState('');
  const [showSudoPassword, setShowSudoPassword] = useState(false);
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

  const [deleteServerModalOpen, setDeleteServerModalOpen] = useState(false);
  const [serverToDelete, setServerToDelete] = useState<Server | null>(null);

  const [testingId, setTestingId] = useState<string | null>(null);
  const [testNotice, setTestNotice] = useState<{ id: string; text: string; ok: boolean } | null>(null);

  // Live Processes & Telemetry States
  const [processesLoading, setProcessesLoading] = useState(false);
  const [processSearch, setProcessSearch] = useState('');
  const [probingSystem, setProbingSystem] = useState(false);

  // Website & Domain Discovery Scanner States
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [scanningWebsites, setScanningWebsites] = useState(false);
  const [scanResult, setScanResult] = useState<{
    total_discovered: number;
    newly_imported: number;
    websites: any[];
    message: string;
  } | null>(null);

  // Server Snapshot & Revert States
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);
  const [snapshotServer, setSnapshotServer] = useState<Server | null>(null);
  const [snapshotsList, setSnapshotsList] = useState<ServerSnapshot[]>([]);
  const [snapshotsLoading, setSnapshotsLoading] = useState(false);
  const [snapshotCreating, setSnapshotCreating] = useState(false);
  const [revertingSnapshotId, setRevertingSnapshotId] = useState<string | null>(null);
  const [deletingSnapshotId, setDeletingSnapshotId] = useState<string | null>(null);
  const [newSnapshotName, setNewSnapshotName] = useState('');
  const [newSnapshotDesc, setNewSnapshotDesc] = useState('');
  const [newSnapshotType, setNewSnapshotType] = useState('system_config');
  const [snapshotActionNotice, setSnapshotActionNotice] = useState<{ type: 'success' | 'error'; text: string; details?: string } | null>(null);
  const [confirmRevertTarget, setConfirmRevertTarget] = useState<ServerSnapshot | null>(null);

  const loadServers = async (selectId?: string) => {
    setLoadError(null);
    try {
      const res = await api.listServers();
      setServers(res);
      localStorage.setItem('cc_cached_servers', JSON.stringify(res));
      if (res.length > 0) {
        const targetId = selectId || localStorage.getItem('cc_selected_server_id');
        const matched = targetId ? res.find((s) => s.id === targetId) : null;
        const toSelect = matched || res[0];
        setSelectedServer(toSelect);
        localStorage.setItem('cc_selected_server_id', toSelect.id);
        // Non-blocking background load for processes
        setTimeout(() => loadProcesses(toSelect.id), 50);
      } else {
        setSelectedServer(null);
        setProcesses([]);
      }
    } catch (e: any) {
      console.error(e);
      setLoadError(e?.message || 'Failed to establish connection to infrastructure nodes.');
    } finally {
      setLoading(false);
    }
  };

  const loadProcesses = async (serverId: string) => {
    setProcessesLoading(true);
    try {
      const p = await api.getServerProcesses(serverId);
      setProcesses(p);
    } catch {
      setProcesses([]);
    } finally {
      setProcessesLoading(false);
    }
  };

  const handleProbeSystem = async (s: Server) => {
    setProbingSystem(true);
    try {
      const res = await api.discoverServerSystem(s.id);
      setSuccessBanner(res.message);
      setTimeout(() => setSuccessBanner(null), 6000);
      await loadServers(s.id);
      loadProcesses(s.id);
    } catch (err: any) {
      alert(err.message || 'Failed to probe server specifications');
    } finally {
      setProbingSystem(false);
    }
  };

  const handleScanWebsites = async (s: Server) => {
    setScanModalOpen(true);
    setScanningWebsites(true);
    setScanResult(null);
    try {
      const res = await api.scanServerWebsites(s.id, true);
      setScanResult(res);
      setSuccessBanner(`Scanned ${s.name}: ${res.total_discovered} websites discovered, ${res.newly_imported} imported to Applications.`);
      setTimeout(() => setSuccessBanner(null), 6000);
      loadServers(s.id);
    } catch (err: any) {
      alert(err.message || 'Failed to scan server websites');
    } finally {
      setScanningWebsites(false);
    }
  };

  const loadSnapshots = async (serverId: string) => {
    setSnapshotsLoading(true);
    try {
      const list = await api.listServerSnapshots(serverId);
      setSnapshotsList(list);
    } catch (err: any) {
      console.error('Failed to load snapshots:', err);
    } finally {
      setSnapshotsLoading(false);
    }
  };

  const handleOpenSnapshots = (s: Server, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSnapshotServer(s);
    setSnapshotModalOpen(true);
    setSnapshotActionNotice(null);
    setConfirmRevertTarget(null);
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 16).replace('T', ' ');
    setNewSnapshotName(`Snapshot - ${dateStr}`);
    setNewSnapshotDesc('');
    setNewSnapshotType('system_config');
    loadSnapshots(s.id);
  };

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!snapshotServer) return;
    if (!newSnapshotName.trim()) {
      setSnapshotActionNotice({ type: 'error', text: 'Snapshot name is required.' });
      return;
    }
    setSnapshotCreating(true);
    setSnapshotActionNotice(null);
    try {
      const res = await api.createServerSnapshot(snapshotServer.id, {
        name: newSnapshotName.trim(),
        description: newSnapshotDesc.trim() || undefined,
        snapshot_type: newSnapshotType,
      });
      setSnapshotActionNotice({
        type: 'success',
        text: `Snapshot '${res.name}' created successfully (${(res.size_mb || 0).toFixed(2)} MB).`,
        details: res.file_path ? `Archived to: ${res.file_path}` : undefined,
      });
      const now = new Date();
      setNewSnapshotName(`Snapshot - ${now.toISOString().slice(0, 16).replace('T', ' ')}`);
      setNewSnapshotDesc('');
      await loadSnapshots(snapshotServer.id);
    } catch (err: any) {
      setSnapshotActionNotice({
        type: 'error',
        text: err?.message || 'Failed to create server snapshot.',
      });
    } finally {
      setSnapshotCreating(false);
    }
  };

  const handleRevertSnapshot = async (snapshot: ServerSnapshot) => {
    if (!snapshotServer) return;
    setRevertingSnapshotId(snapshot.id);
    setSnapshotActionNotice(null);
    try {
      const res = await api.revertServerSnapshot(snapshotServer.id, snapshot.id);
      setSnapshotActionNotice({
        type: res.success ? 'success' : 'error',
        text: res.message,
        details: res.safety_backup_path ? `Safety backup created at: ${res.safety_backup_path}` : undefined,
      });
      setConfirmRevertTarget(null);
      await loadSnapshots(snapshotServer.id);
    } catch (err: any) {
      setSnapshotActionNotice({
        type: 'error',
        text: err?.message || 'Failed to revert server snapshot.',
      });
    } finally {
      setRevertingSnapshotId(null);
    }
  };

  const handleDeleteSnapshot = async (snapshotId: string) => {
    if (!snapshotServer) return;
    setDeletingSnapshotId(snapshotId);
    try {
      await api.deleteServerSnapshot(snapshotServer.id, snapshotId);
      setSnapshotsList((prev) => prev.filter((s) => s.id !== snapshotId));
      setSnapshotActionNotice({
        type: 'success',
        text: 'Snapshot deleted successfully.',
      });
    } catch (err: any) {
      setSnapshotActionNotice({
        type: 'error',
        text: err?.message || 'Failed to delete snapshot.',
      });
    } finally {
      setDeletingSnapshotId(null);
    }
  };

  useEffect(() => {
    loadServers();
  }, []);

  const handleServerSelect = (s: Server) => {
    setSelectedServer(s);
    localStorage.setItem('cc_selected_server_id', s.id);
    if (onSelectServer) {
      onSelectServer(s.id);
    } else {
      loadProcesses(s.id);
    }
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

  const executeConfirmedServerDelete = async () => {
    if (!serverToDelete) return;
    setDeleteServerModalOpen(false);
    try {
      await api.deleteServer(serverToDelete.id);
      localStorage.removeItem('cc_selected_server_id');
      loadServers();
      setSuccessBanner(`Server node '${serverToDelete.name}' deregistered successfully.`);
    } catch (err: any) {
      alert(err.message || 'Failed to delete server node');
    } finally {
      setServerToDelete(null);
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
      setFormError('SSH Password is required to establish management connection.');
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
        ssh_auth_type: 'PASSWORD',
        use_sudo: newUseSudo || newSshUser.trim() !== 'root',
        sudo_password: newSudoPassword.trim() || undefined
      });
      setCreateModalOpen(false);
      setNewIp('');
      setNewPassword('');
      setNewName('');
      setNewHostname('');
      setNewProvider('Custom VPS');
      setNewSshUser('root');
      setNewSshPort('22');
      setNewUseSudo(false);
      setNewSudoPassword('');
      setShowSudoPassword(false);
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
    <div className="p-4 sm:p-6 md:p-8 space-y-6 max-w-7xl mx-auto w-full max-w-full overflow-x-hidden">
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

      {/* Managing Server Bar (Positioned ABOVE Server Cards) */}
      {selectedServer && (
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse"></div>
            <div>
              <span className="font-semibold text-white text-sm">Managing: {selectedServer.name}</span>
              <span className="text-xs text-slate-400 ml-2 font-mono">({selectedServer.public_ip})</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleOpenSnapshots(selectedServer)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
              title="Server Snapshots & Instant Revert"
            >
              <Camera size={14} />
              <span>Snapshots & Recovery</span>
            </button>

            <button
              onClick={() => handleOpenTerminal(selectedServer)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
            >
              <Terminal size={14} />
              <span>Open Terminal</span>
            </button>

            {onSelectServer && (
              <button
                onClick={() => onSelectServer(selectedServer.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
              >
                <ExternalLink size={14} />
                <span>Open Full Dashboard & Manage</span>
              </button>
            )}

            <button
              onClick={() => handleScanWebsites(selectedServer)}
              disabled={scanningWebsites}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-900/60 hover:bg-purple-800 text-purple-200 border border-purple-700/80 rounded-lg text-xs font-semibold shadow-sm transition-colors"
              title="Audit Apache, Nginx, and Docker web apps to auto-import as Applications"
            >
              <Globe size={14} className={scanningWebsites ? "animate-spin text-purple-300" : "text-purple-400"} />
              <span>{scanningWebsites ? 'Scanning Websites...' : 'Scan Hosted Websites'}</span>
            </button>

            <button
              onClick={() => handleProbeSystem(selectedServer)}
              disabled={probingSystem}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition-colors"
              title="Execute live hardware and OS telemetry probe via SSH"
            >
              <Activity size={14} className={probingSystem ? "animate-spin text-emerald-400" : "text-emerald-400"} />
              <span>{probingSystem ? 'Probing...' : 'Probe Live Specs'}</span>
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
            <div className="flex flex-wrap items-center gap-1">
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
      )}

      {loadError && servers.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-400 shrink-0" />
            <span>Telemetry update warning: {loadError}</span>
          </div>
          <button
            onClick={() => loadServers()}
            className="flex items-center gap-1 px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded text-2xs font-semibold transition-colors"
          >
            <RefreshCw size={11} />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Grid of Servers */}
      {loading && servers.length === 0 ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
          <div className="text-slate-400 text-xs font-medium tracking-wide">Connecting to infrastructure nodes...</div>
        </div>
      ) : loadError && servers.length === 0 ? (
        <div className="p-8 text-center bg-rose-950/20 border border-rose-800/40 rounded-xl space-y-3">
          <div className="w-10 h-10 rounded-xl bg-rose-900/40 text-rose-400 flex items-center justify-center mx-auto">
            <AlertTriangle size={20} />
          </div>
          <h3 className="text-sm font-semibold text-white">Connection to Infrastructure Nodes Failed</h3>
          <p className="text-xs text-rose-300/80 max-w-md mx-auto">{loadError}</p>
          <button
            onClick={() => {
              setLoading(true);
              loadServers();
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold transition-colors mt-2"
          >
            <RefreshCw size={14} />
            <span>Retry Connection</span>
          </button>
        </div>
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
                      <div className="text-[11px] text-slate-400 mono flex items-center flex-wrap gap-1.5 mt-0.5">
                        <span>{srv.public_ip}:{srv.ssh_port || 22}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                          {srv.ssh_user || 'root'}
                        </span>
                        {srv.use_sudo && (
                          <span className="text-[10px] text-amber-400 flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-950/60 border border-amber-800/50" title="Sudo Privilege Escalation Active (sudo su)">
                            <ShieldAlert size={10} /> sudo su
                          </span>
                        )}
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
                <div className="grid grid-cols-4 gap-1.5 pt-1 border-t border-slate-800/80">
                  <button
                    onClick={(e) => handleOpenTerminal(srv, e)}
                    className="flex items-center justify-center gap-1 py-1.5 px-1 bg-slate-950 hover:bg-emerald-950/60 hover:text-emerald-300 border border-slate-800 rounded-lg text-[11px] font-semibold text-slate-200 transition-colors"
                    title="Interactive SSH Terminal"
                  >
                    <Terminal size={12} className="text-emerald-400 shrink-0" />
                    <span className="truncate">Terminal</span>
                  </button>

                  <button
                    onClick={(e) => handleOpenConnection(srv, e)}
                    className="flex items-center justify-center gap-1 py-1.5 px-1 bg-slate-950 hover:bg-brand-950/60 hover:text-brand-300 border border-slate-800 rounded-lg text-[11px] font-semibold text-slate-200 transition-colors"
                    title="SSH Credentials & Agent Setup"
                  >
                    <Wifi size={12} className="text-brand-400 shrink-0" />
                    <span className="truncate">Connect</span>
                  </button>

                  <button
                    onClick={(e) => handleOpenBackup(srv, e)}
                    className="flex items-center justify-center gap-1 py-1.5 px-1 bg-slate-950 hover:bg-sky-950/60 hover:text-sky-300 border border-slate-800 rounded-lg text-[11px] font-semibold text-slate-200 transition-colors"
                    title="Database Backups"
                  >
                    <Database size={12} className="text-sky-400 shrink-0" />
                    <span className="truncate">Backup</span>
                  </button>

                  <button
                    onClick={(e) => handleOpenSnapshots(srv, e)}
                    className="flex items-center justify-center gap-1 py-1.5 px-1 bg-slate-950 hover:bg-amber-950/60 hover:text-amber-300 border border-slate-800 rounded-lg text-[11px] font-semibold text-slate-200 transition-colors"
                    title="Server Snapshots & Recovery"
                  >
                    <Camera size={12} className="text-amber-400 shrink-0" />
                    <span className="truncate">Snapshot</span>
                  </button>
                </div>

                {/* Manage Server & Details Direct Action */}
                {onSelectServer && (
                  <div className="pt-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectServer(srv.id);
                      }}
                      className="w-full py-1.5 px-3 bg-brand-600/90 hover:bg-brand-500 text-white rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                    >
                      <span>Manage Server & Details</span>
                      <ExternalLink size={11} />
                    </button>
                  </div>
                )}

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
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setServerToDelete(srv);
                        setDeleteServerModalOpen(true);
                      }}
                      className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded transition-colors"
                      title="Deregister VPS Node"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}

      {/* Selected Server Deep Dive: Hardware Specs & Processes */}
      {selectedServer && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Server Hardware & OS Inspector */}
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Terminal size={16} className="text-brand-400" />
                  Hardware & Kernel Specification
                </h3>
                <button
                  onClick={() => handleProbeSystem(selectedServer)}
                  disabled={probingSystem}
                  className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition-colors"
                  title="Probe live specifications via SSH"
                >
                  <RefreshCw size={13} className={probingSystem ? "animate-spin text-emerald-400" : ""} />
                </button>
              </div>
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
                  <span className="text-slate-400">CPU Cores:</span>
                  <span className="mono text-slate-200 font-semibold">{selectedServer.cpu_cores} VCPU Cores</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Total RAM:</span>
                  <span className="mono text-slate-200 font-semibold">{selectedServer.ram_total_mb} MB ({Math.round(selectedServer.ram_total_mb / 1024)} GB)</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800">
                  <span className="text-slate-400">Disk Capacity:</span>
                  <span className="mono text-slate-200 font-semibold">{selectedServer.disk_total_gb} GB SSD</span>
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
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Activity size={16} className="text-emerald-400" />
                  Active System Daemons & Top Processes ({selectedServer.name})
                </h3>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Filter processes..."
                      value={processSearch}
                      onChange={(e) => setProcessSearch(e.target.value)}
                      className="pl-7 pr-2.5 py-1 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-brand-500 w-36 sm:w-44"
                    />
                  </div>
                  <button
                    onClick={() => loadProcesses(selectedServer.id)}
                    disabled={processesLoading}
                    className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors"
                    title="Live SSH Process Probe"
                  >
                    <RefreshCw size={12} className={processesLoading ? "animate-spin text-brand-400" : ""} />
                    <span>{processesLoading ? 'Querying...' : 'Live Probe'}</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-950 border-b border-slate-800 z-10">
                    <tr className="text-slate-400 uppercase text-[10px]">
                      <th className="py-2.5 px-3">PID</th>
                      <th className="py-2.5 px-3">Service Process</th>
                      <th className="py-2.5 px-3">User</th>
                      <th className="py-2.5 px-3">CPU %</th>
                      <th className="py-2.5 px-3">RAM</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300 mono">
                    {processesLoading ? (
                      <tr>
                        <td colSpan={6} className="py-10 text-center text-slate-400">
                          <div className="flex items-center justify-center gap-2">
                            <RefreshCw size={14} className="animate-spin text-brand-400" />
                            <span>Connecting via SSH to query top active processes (`ps aux`)...</span>
                          </div>
                        </td>
                      </tr>
                    ) : (() => {
                      const filtered = processes.filter((p) => {
                        if (!processSearch) return true;
                        const q = processSearch.toLowerCase();
                        return (
                          p.name?.toLowerCase().includes(q) ||
                          p.user?.toLowerCase().includes(q) ||
                          String(p.pid).includes(q) ||
                          p.command?.toLowerCase().includes(q)
                        );
                      });

                      if (filtered.length === 0) {
                        return (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-slate-500">
                              {processSearch ? 'No matching processes found.' : 'No processes returned. Click "Live Probe" to execute query via SSH.'}
                            </td>
                          </tr>
                        );
                      }

                      return filtered.map((p) => (
                        <tr key={p.pid} className="hover:bg-slate-800/40" title={p.command}>
                          <td className="py-2 px-3 text-slate-400">{p.pid}</td>
                          <td className="py-2 px-3 font-semibold text-white">
                            <span className="cursor-help" title={p.command}>{p.name}</span>
                          </td>
                          <td className="py-2 px-3 text-slate-400">{p.user}</td>
                          <td className={`py-2 px-3 font-semibold ${p.cpu_percent > 10 ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {p.cpu_percent}%
                          </td>
                          <td className="py-2 px-3 text-slate-300">
                            {p.mem_percent !== undefined ? `${p.mem_percent}%` : (p.ram_mb ? `${p.ram_mb} MB` : '0.4%')}
                          </td>
                          <td className="py-2 px-3">
                            <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                              {p.status || 'RUNNING'}
                            </span>
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
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

            <form onSubmit={handleRegisterServer} className="space-y-4 text-xs">
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

              {/* SSH User & Port */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                    <span>SSH Login User & Port</span>
                    <span className="text-rose-400 font-bold">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400">Non-root users auto-escalate via sudo</span>
                </div>

                {/* Quick User Chips */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { label: 'root', desc: 'Direct root' },
                    { label: 'ubuntu', desc: 'Ubuntu/EC2' },
                    { label: 'debian', desc: 'Debian' },
                    { label: 'admin', desc: 'Admin' },
                    { label: 'deploy', desc: 'Deploy' }
                  ].map((chip) => {
                    const isSelected = newSshUser === chip.label;
                    return (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => {
                          setNewSshUser(chip.label);
                          if (chip.label !== 'root') {
                            setNewUseSudo(true);
                          } else {
                            setNewUseSudo(false);
                          }
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono transition-all flex items-center gap-1 ${
                          isSelected
                            ? 'bg-brand-600 text-white font-semibold shadow-sm ring-1 ring-brand-400'
                            : 'bg-slate-950 text-slate-400 border border-slate-800 hover:border-slate-700 hover:text-slate-200'
                        }`}
                      >
                        {isSelected && <Check size={11} />}
                        <span>{chip.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="grid grid-cols-3 gap-2.5 pt-1">
                  <div className="col-span-2">
                    <input
                      type="text"
                      required
                      value={newSshUser}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewSshUser(val);
                        if (val.trim() && val.trim() !== 'root') {
                          setNewUseSudo(true);
                        }
                      }}
                      placeholder="Username (e.g. root, ubuntu)"
                      className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 font-mono text-xs focus:outline-none focus:border-brand-500"
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      required
                      value={newSshPort}
                      onChange={(e) => setNewSshPort(e.target.value)}
                      placeholder="Port 22"
                      className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-600 font-mono text-xs focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>
              </div>

              {/* SSH Password - REQUIRED */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-300 font-semibold flex items-center gap-1.5">
                    <span>SSH Password</span>
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
                    placeholder={`Enter password for ${newSshUser || 'user'}`}
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
                  Used for interactive SSH sessions, telemetry monitoring, and container commands.
                </p>
              </div>

              {/* Privilege Escalation (sudo su) Architecture */}
              <div className="p-3.5 bg-slate-950/80 border border-slate-800/90 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newUseSudo}
                      onChange={(e) => setNewUseSudo(e.target.checked)}
                      className="rounded border-slate-700 bg-slate-900 text-brand-600 focus:ring-brand-500 w-4 h-4"
                    />
                    <div className="flex items-center gap-1.5">
                      <ShieldAlert size={15} className={newUseSudo ? 'text-amber-400' : 'text-slate-500'} />
                      <span className="font-semibold text-slate-200">Privilege Escalation (sudo su / root)</span>
                    </div>
                  </label>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                    newUseSudo
                      ? 'bg-amber-950/70 text-amber-300 border-amber-800/80'
                      : 'bg-slate-900 text-slate-400 border-slate-800'
                  }`}>
                    {newUseSudo ? 'Escalation Active' : 'Direct Execution'}
                  </span>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {newUseSudo
                    ? `Logging in as '${newSshUser || 'user'}': all administration, domain provisioning, and docker commands will safely escalate to root via sudo su.`
                    : 'Commands will execute directly under user context. Recommended only when connecting directly as root.'}
                </p>

                {newUseSudo && (
                  <div className="pt-2 border-t border-slate-800/60 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-slate-300 text-[11px] font-medium">
                        Sudo Password <span className="text-slate-500">(Optional / Fallback)</span>
                      </label>
                      <span className="text-[10px] text-slate-500">Blank for passwordless (NOPASSWD)</span>
                    </div>
                    <div className="relative">
                      <input
                        type={showSudoPassword ? 'text' : 'password'}
                        value={newSudoPassword}
                        onChange={(e) => setNewSudoPassword(e.target.value)}
                        placeholder="Leave blank if passwordless or same as SSH"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-200 placeholder-slate-600 text-xs font-mono pr-9 focus:outline-none focus:border-brand-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowSudoPassword(!showSudoPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                        title={showSudoPassword ? 'Hide password' : 'Show password'}
                      >
                        {showSudoPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Collapsible Optional Settings */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors font-medium py-1"
                >
                  {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  <span>{showAdvanced ? 'Hide Optional Settings' : 'Configure Optional Settings (Name, Hostname, Provider)'}</span>
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

      {/* Website & Domain Discovery Scanner Modal */}
      {scanModalOpen && selectedServer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-purple-950/80 border border-purple-800/80 rounded-xl text-purple-400">
                  <Globe size={18} />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-sm">
                    Automated Website & Domain Discovery Scanner
                  </h3>
                  <p className="text-xs text-slate-400">
                    Host: {selectedServer.name} <span className="font-mono text-purple-400">({selectedServer.public_ip})</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setScanModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors text-xs"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              {scanningWebsites ? (
                <div className="py-12 flex flex-col items-center justify-center space-y-3 text-center">
                  <RefreshCw size={28} className="animate-spin text-purple-400" />
                  <div className="font-semibold text-white text-sm">Connecting & Scanning VPS Web Stack...</div>
                  <div className="text-slate-400 max-w-md">
                    Inspecting Apache2 VirtualHosts (/etc/apache2/sites-enabled/), Nginx server blocks (/etc/nginx/sites-enabled/), and running Docker containers via SSH...
                  </div>
                </div>
              ) : scanResult ? (
                <div className="space-y-4">
                  <div className="p-3.5 bg-emerald-950/60 border border-emerald-800/80 rounded-xl text-emerald-300 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                      <span>{scanResult.message}</span>
                    </div>
                    <span className="px-2 py-0.5 bg-emerald-900/80 text-emerald-200 rounded text-[11px] font-semibold">
                      +{scanResult.newly_imported} Created
                    </span>
                  </div>

                  <div className="rounded-xl border border-slate-800 overflow-hidden">
                    <div className="bg-slate-950 px-3.5 py-2 border-b border-slate-800 font-semibold text-slate-300">
                      Discovered Hosted Domains & Web Services ({scanResult.websites.length})
                    </div>
                    <div className="divide-y divide-slate-800/60 max-h-[300px] overflow-y-auto">
                      {scanResult.websites.map((site: any, idx: number) => (
                        <div key={idx} className="p-3 bg-slate-900/50 hover:bg-slate-800/50 flex items-center justify-between gap-3">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white text-xs">{site.domain || site.name}</span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                                {site.web_server || 'Docker'}
                              </span>
                              {site.ssl_enabled && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800">
                                  SSL Active
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              Port: {site.port} • Proxy / Target: {site.proxy_pass || site.root_path || 'Direct Host'}
                            </div>
                          </div>
                          <span className="px-2 py-1 bg-brand-950 text-brand-300 border border-brand-800 rounded text-[11px] font-medium shrink-0">
                            Managed in Apps
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
              <button
                onClick={() => handleScanWebsites(selectedServer)}
                disabled={scanningWebsites}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition-colors"
              >
                <RefreshCw size={12} className={scanningWebsites ? "animate-spin" : ""} />
                <span>Re-scan Server</span>
              </button>

              <button
                onClick={() => setScanModalOpen(false)}
                className="px-4 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Server Snapshots & Recovery Modal */}
      {snapshotModalOpen && snapshotServer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-3xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-950/80 border border-amber-800/80 rounded-xl text-amber-400">
                  <Camera size={18} />
                </div>
                <div>
                  <h3 className="font-semibold text-white text-sm">
                    Server Snapshots & Recovery (SSH / System State)
                  </h3>
                  <p className="text-xs text-slate-400">
                    Host: {snapshotServer.name} <span className="font-mono text-amber-400">({snapshotServer.public_ip})</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSnapshotModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors text-xs"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-5 text-xs">
              {/* Action Banner / Feedback */}
              {snapshotActionNotice && (
                <div
                  className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                    snapshotActionNotice.type === 'success'
                      ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-300'
                      : 'bg-rose-950/60 border-rose-800/80 text-rose-300'
                  }`}
                >
                  <div className="flex items-center gap-2 font-medium">
                    {snapshotActionNotice.type === 'success' ? (
                      <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                    ) : (
                      <AlertTriangle size={16} className="text-rose-400 shrink-0" />
                    )}
                    <span>{snapshotActionNotice.text}</span>
                  </div>
                  {snapshotActionNotice.details && (
                    <div className="font-mono text-[11px] opacity-80 pl-6">
                      {snapshotActionNotice.details}
                    </div>
                  )}
                </div>
              )}

              {/* Take New Snapshot Form */}
              <div className="p-4 bg-slate-950 border border-slate-800/80 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white text-xs flex items-center gap-1.5">
                    <Plus size={14} className="text-amber-400" />
                    Create New Server Snapshot
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Storage: /var/backups/hq-snapshots/
                  </span>
                </div>

                <form onSubmit={handleCreateSnapshot} className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 space-y-1">
                      <label className="text-[11px] text-slate-400 font-medium">
                        Snapshot Name <span className="text-rose-400">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={newSnapshotName}
                        onChange={(e) => setNewSnapshotName(e.target.value)}
                        placeholder="e.g. Pre-Upgrade Nginx"
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500 text-xs"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] text-slate-400 font-medium">Snapshot Scope</label>
                      <select
                        value={newSnapshotType}
                        onChange={(e) => setNewSnapshotType(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-amber-500"
                      >
                        <option value="system_config">System & Web Stack (/etc/*)</option>
                        <option value="full_system">Full System Configs & State</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-400 font-medium">
                      Description <span className="text-slate-500">(Optional context)</span>
                    </label>
                    <input
                      type="text"
                      value={newSnapshotDesc}
                      onChange={(e) => setNewSnapshotDesc(e.target.value)}
                      placeholder="e.g. Taken before updating reverse proxy configuration"
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500 text-xs"
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                    <div className="text-[10px] text-slate-500">
                      Captures <code className="text-amber-400/90 font-mono">/etc/nginx</code>, <code className="text-amber-400/90 font-mono">/etc/apache2</code>, <code className="text-amber-400/90 font-mono">/etc/systemd</code>, <code className="text-amber-400/90 font-mono">crontab</code>, and hosts.
                    </div>
                    <button
                      type="submit"
                      disabled={snapshotCreating}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                    >
                      {snapshotCreating ? (
                        <>
                          <RefreshCw size={13} className="animate-spin" />
                          <span>Archiving Remote VPS...</span>
                        </>
                      ) : (
                        <>
                          <Camera size={13} />
                          <span>Take Snapshot</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* Confirm Revert Prompt */}
              {confirmRevertTarget && (
                <div className="p-4 bg-rose-950/40 border border-rose-800/80 rounded-xl space-y-3 animate-in fade-in">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle size={18} className="text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-rose-300">
                        Confirm Server Revert to Snapshot: "{confirmRevertTarget.name}"
                      </h4>
                      <p className="text-[11px] text-rose-200/80 mt-1">
                        Reverting will restore the archived configs from this snapshot over SSH. HQ will automatically create a pre-revert safety backup on the remote server before unpacking, then test and reload systemd & web services.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1">
                    <button
                      onClick={() => setConfirmRevertTarget(null)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleRevertSnapshot(confirmRevertTarget)}
                      disabled={revertingSnapshotId === confirmRevertTarget.id}
                      className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                      {revertingSnapshotId === confirmRevertTarget.id ? (
                        <>
                          <RefreshCw size={12} className="animate-spin" />
                          <span>Reverting Remote Server...</span>
                        </>
                      ) : (
                        <>
                          <RotateCcw size={12} />
                          <span>Confirm & Revert Now</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Existing Snapshots List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white text-xs">
                    Saved Server Snapshots ({snapshotsList.length})
                  </span>
                  <button
                    onClick={() => loadSnapshots(snapshotServer.id)}
                    disabled={snapshotsLoading}
                    className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white transition-colors"
                  >
                    <RefreshCw size={11} className={snapshotsLoading ? "animate-spin" : ""} />
                    <span>Refresh</span>
                  </button>
                </div>

                {snapshotsLoading && snapshotsList.length === 0 ? (
                  <div className="py-8 text-center text-slate-500 text-xs">
                    <RefreshCw size={18} className="animate-spin mx-auto mb-2 text-amber-400" />
                    Loading server snapshots from remote host...
                  </div>
                ) : snapshotsList.length === 0 ? (
                  <div className="p-8 text-center bg-slate-950 border border-slate-800/80 rounded-xl space-y-1 text-slate-400">
                    <Archive size={24} className="mx-auto text-slate-600 mb-1" />
                    <p className="font-medium text-slate-300 text-xs">No Snapshots Found</p>
                    <p className="text-[11px] text-slate-500">
                      Create your first snapshot above before performing system upgrades or web server config changes.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-800 overflow-hidden divide-y divide-slate-800/70">
                    {snapshotsList.map((snap) => {
                      const isReverting = revertingSnapshotId === snap.id;
                      const isDeleting = deletingSnapshotId === snap.id;

                      return (
                        <div
                          key={snap.id}
                          className="p-3.5 bg-slate-900/60 hover:bg-slate-800/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-white text-xs">{snap.name}</span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-950/80 text-amber-300 border border-amber-800/60">
                                {snap.snapshot_type}
                              </span>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                  snap.status === 'completed'
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                                    : 'bg-rose-950 text-rose-300 border border-rose-800/60'
                                }`}
                              >
                                {snap.status.toUpperCase()}
                              </span>
                              {snap.reverted_at && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-sky-950 text-sky-300 border border-sky-800/60 flex items-center gap-1">
                                  <RotateCcw size={9} />
                                  <span>Reverted</span>
                                </span>
                              )}
                            </div>

                            {snap.description && (
                              <p className="text-[11px] text-slate-300">{snap.description}</p>
                            )}

                            <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 font-mono">
                              <span>Size: <strong className="text-slate-200">{(snap.size_mb || 0).toFixed(2)} MB</strong></span>
                              <span>•</span>
                              <span>Date: {new Date(snap.created_at).toLocaleString()}</span>
                              {snap.file_path && (
                                <>
                                  <span>•</span>
                                  <span className="truncate max-w-xs text-slate-500" title={snap.file_path}>
                                    {snap.file_path}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => setConfirmRevertTarget(snap)}
                              disabled={isReverting || isDeleting}
                              className="px-3 py-1.5 bg-rose-950/70 hover:bg-rose-900 border border-rose-800/80 text-rose-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm disabled:opacity-50"
                              title="Revert server configuration to this snapshot"
                            >
                              <RotateCcw size={12} className={isReverting ? "animate-spin" : ""} />
                              <span>{isReverting ? "Reverting..." : "Revert"}</span>
                            </button>

                            <button
                              onClick={() => handleDeleteSnapshot(snap.id)}
                              disabled={isDeleting || isReverting}
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors border border-transparent hover:border-slate-700"
                              title="Delete snapshot archive"
                            >
                              <Trash2 size={13} className={isDeleting ? "animate-spin text-rose-400" : ""} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                HQ Automated Safety: Snapshots include pre-revert fallbacks.
              </span>
              <button
                onClick={() => setSnapshotModalOpen(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Server Safeguard Modal */}
      <ConfirmationModal
        isOpen={deleteServerModalOpen}
        title="Deregister VPS Node Safeguard"
        message={`Are you sure you want to deregister '${serverToDelete?.name}' (${serverToDelete?.public_ip})? All active SSH credentials, telemetry metrics, and terminal sessions will be detached.`}
        confirmKeyword="DELETE"
        confirmButtonText="Deregister VPS Node"
        isDestructive={true}
        onConfirm={executeConfirmedServerDelete}
        onClose={() => setDeleteServerModalOpen(false)}
      />
    </div>
  );
};

