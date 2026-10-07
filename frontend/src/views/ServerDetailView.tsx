import React, { useEffect, useState, useMemo } from 'react';
import {
  Server as ServerIcon,
  ArrowLeft,
  RefreshCw,
  Power,
  RotateCw,
  Cpu,
  HardDrive,
  Activity,
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
  Download,
  Globe,
  Search,
  ExternalLink,
  Calendar,
  Clock,
  Zap,
  FileText,
  Layers,
  Trash2,
  Sliders,
  AlertOctagon,
  Copy
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';
import { api } from '../api/client';
import { Server, ServerMetric } from '../types';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { ServerTerminalModal } from '../components/ServerTerminalModal';
import { ServerConnectionModal } from '../components/ServerConnectionModal';

interface ServerDetailViewProps {
  serverId: string;
  onBack: () => void;
  onNavigate?: (view: string, id?: string) => void;
}

export const ServerDetailView: React.FC<ServerDetailViewProps> = ({
  serverId,
  onBack,
  onNavigate
}) => {
  const [server, setServer] = useState<Server | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'performance' | 'backups' | 'troubleshoot' | 'reboots' | 'websites'>('overview');

  // Live Telemetry & Processes
  const [processes, setProcesses] = useState<any[]>([]);
  const [processesLoading, setProcessesLoading] = useState(false);
  const [processSearch, setProcessSearch] = useState('');
  const [probingSystem, setProbingSystem] = useState(false);
  const [metricsHistory, setMetricsHistory] = useState<ServerMetric[]>([]);

  // Performance & Spikes Analysis
  const [performanceData, setPerformanceData] = useState<any>(null);
  const [perfLoading, setPerfLoading] = useState(false);

  // Backups
  const [backups, setBackups] = useState<any[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backingUpWeb, setBackingUpWeb] = useState<string | null>(null);
  const [backingUpDb, setBackingUpDb] = useState(false);
  const [dbType, setDbType] = useState('POSTGRESQL');
  const [dbName, setDbName] = useState('production_db');
  const [retentionDays, setRetentionDays] = useState(30);

  // Scheduled Reboots
  const [rebootStatus, setRebootStatus] = useState<any>(null);
  const [schedulingReboot, setSchedulingReboot] = useState(false);
  const [rebootDelay, setRebootDelay] = useState(15);
  const [rebootReason, setRebootReason] = useState('Scheduled kernel update & maintenance');
  const [rebootRecurring, setRebootRecurring] = useState('NONE');

  // Troubleshooting & Diagnostics
  const [troubleshootRunning, setTroubleshootRunning] = useState<string | null>(null);
  const [terminalOutput, setTerminalOutput] = useState<{
    command: string;
    stdout: string;
    stderr: string;
    exit_code: number;
    duration_ms: number;
  } | null>(null);
  const [customCommand, setCustomCommand] = useState('free -h');

  // Websites & Domains
  const [websites, setWebsites] = useState<any[]>([]);
  const [scanningWebsites, setScanningWebsites] = useState(false);
  const [scanNotice, setScanNotice] = useState<string | null>(null);

  // Modals & Notifications
  const [terminalModalOpen, setTerminalModalOpen] = useState(false);
  const [connectionModalOpen, setConnectionModalOpen] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<string>('restart');
  const [serviceActionName, setServiceActionName] = useState<string | undefined>(undefined);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 5000);
  };

  const loadServerData = async () => {
    try {
      const srv = await api.getServer(serverId);
      setServer(srv);
      loadProcesses();
      loadPerformanceAnalysis();
      loadBackups();
      loadRebootStatus();
      loadMetricsHistory();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || 'Failed to load server details', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadProcesses = async () => {
    setProcessesLoading(true);
    try {
      const procs = await api.getServerProcesses(serverId);
      setProcesses(procs || []);
    } catch (e) {
      console.error(e);
    } finally {
      setProcessesLoading(false);
    }
  };

  const loadPerformanceAnalysis = async () => {
    setPerfLoading(true);
    try {
      const data = await api.getServerPerformanceAnalysis(serverId);
      setPerformanceData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setPerfLoading(false);
    }
  };

  const loadBackups = async () => {
    setBackupsLoading(true);
    try {
      const res = await api.listBackups(serverId);
      setBackups(res || []);
    } catch (e) {
      console.error(e);
    } finally {
      setBackupsLoading(false);
    }
  };

  const loadRebootStatus = async () => {
    try {
      const status = await api.getServerRebootStatus(serverId);
      setRebootStatus(status);
    } catch (e) {
      console.error(e);
    }
  };

  const loadMetricsHistory = async () => {
    try {
      const history = await api.getServerMetrics(serverId, 30);
      setMetricsHistory(history || []);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadServerData();
  }, [serverId]);

  // Hardware Probe
  const handleProbeSystem = async () => {
    setProbingSystem(true);
    try {
      const res = await api.discoverServerSystem(serverId);
      showToast(res.message || 'Hardware specifications probed successfully', 'success');
      loadServerData();
    } catch (err: any) {
      showToast(err.message || 'Hardware probe failed', 'error');
    } finally {
      setProbingSystem(false);
    }
  };

  // Web Config Backup
  const handleWebBackup = async (type: string) => {
    setBackingUpWeb(type);
    try {
      const res = await api.createWebConfigBackup({
        server_id: serverId,
        config_type: type,
        retention_days: retentionDays
      });
      showToast(`Snapshot created: ${res.filename} (${res.file_size_mb} MB)`, 'success');
      loadBackups();
    } catch (err: any) {
      showToast(err.message || 'Backup failed', 'error');
    } finally {
      setBackingUpWeb(null);
    }
  };

  // Database Backup
  const handleDbBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBackingUpDb(true);
    try {
      const res = await api.createDatabaseBackup({
        server_id: serverId,
        database_type: dbType,
        database_name: dbName,
        retention_days: retentionDays
      });
      showToast(`Database backup generated: ${res.filename} (${res.file_size_mb} MB)`, 'success');
      loadBackups();
    } catch (err: any) {
      showToast(err.message || 'Database backup failed', 'error');
    } finally {
      setBackingUpDb(false);
    }
  };

  // Reboot Scheduling
  const handleScheduleReboot = async (e: React.FormEvent) => {
    e.preventDefault();
    setSchedulingReboot(true);
    try {
      const res = await api.scheduleServerReboot(serverId, {
        delay_minutes: rebootDelay,
        reason: rebootReason,
        recurring: rebootRecurring
      });
      showToast(res.message, 'success');
      loadRebootStatus();
    } catch (err: any) {
      showToast(err.message || 'Failed to schedule reboot', 'error');
    } finally {
      setSchedulingReboot(false);
    }
  };

  const handleCancelReboot = async () => {
    try {
      const res = await api.cancelServerReboot(serverId);
      showToast(res.message, 'success');
      loadRebootStatus();
    } catch (err: any) {
      showToast(err.message || 'Failed to cancel reboot', 'error');
    }
  };

  // Troubleshoot Command
  const handleRunTroubleshoot = async (key: string, custom?: string) => {
    setTroubleshootRunning(key);
    try {
      const res = await api.runServerTroubleshoot(serverId, {
        command_key: key,
        custom_command: custom
      });
      setTerminalOutput(res);
      showToast(`Command '${res.command}' executed successfully (${res.duration_ms}ms)`, 'success');
    } catch (err: any) {
      showToast(err.message || 'Command execution failed', 'error');
    } finally {
      setTroubleshootRunning(null);
    }
  };

  // Website Scan
  const handleScanWebsites = async () => {
    setScanningWebsites(true);
    try {
      const res = await api.scanServerWebsites(serverId, true);
      setWebsites(res.websites || []);
      setScanNotice(res.message);
      showToast(res.message, 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to scan websites', 'error');
    } finally {
      setScanningWebsites(false);
    }
  };

  // Safe reboot/restart command execution
  const handleConfirmCommand = async () => {
    try {
      const confirmationToken = pendingAction === 'shutdown' ? 'SHUTDOWN' : 'RESTART';
      const res = await api.executeServerCommand(serverId, pendingAction, confirmationToken, serviceActionName);
      showToast(res.message || 'Operation dispatched successfully', 'success');
      loadServerData();
    } catch (err: any) {
      showToast(err.message || 'Operation failed', 'error');
    } finally {
      setConfirmModalOpen(false);
    }
  };

  const filteredProcesses = useMemo(() => {
    if (!processSearch.trim()) return processes;
    const q = processSearch.toLowerCase();
    return processes.filter(
      p =>
        (p.command && p.command.toLowerCase().includes(q)) ||
        (p.user && p.user.toLowerCase().includes(q)) ||
        String(p.pid).includes(q)
    );
  }, [processes, processSearch]);

  if (loading || !server) {
    return (
      <div className="p-8 max-w-7xl mx-auto flex items-center justify-center min-h-[60vh] text-slate-500 font-mono text-xs">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span>CONNECTING TO VPS HOST NODE {serverId}...</span>
        </div>
      </div>
    );
  }

  const metric = server.latest_metric;
  const cpu = metric?.cpu_percent || 0;
  const ram = metric?.ram_percent || 0;
  const disk = metric?.disk_percent || 0;
  const spikes = performanceData?.spikes || [];
  const hasSpikes = spikes.length > 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl border shadow-xl flex items-center gap-3 text-xs font-medium animate-in fade-in slide-in-from-bottom-2 ${
            toastMessage.type === 'error'
              ? 'bg-rose-950 text-rose-200 border-rose-800'
              : toastMessage.type === 'info'
              ? 'bg-sky-950 text-sky-200 border-sky-800'
              : 'bg-emerald-950 text-emerald-200 border-emerald-800'
          }`}
        >
          {toastMessage.type === 'error' ? (
            <AlertTriangle size={16} className="text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
          )}
          <span>{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 hover:opacity-70">
            &times;
          </button>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded-lg border border-slate-800 transition-colors"
            title="Back to VPS Hosts"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-white tracking-tight">{server.name}</h1>
              <StatusBadge status={server.status} size="sm" />
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-brand-950 text-brand-300 border border-brand-800 mono">
                {server.provider}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-400 mono mt-1">
              <span>{server.public_ip}:{server.ssh_port || 22}</span>
              <span>•</span>
              <span>{server.os} {server.os_version}</span>
              <span>•</span>
              <span className="text-emerald-400">Kernel {server.kernel}</span>
            </div>
          </div>
        </div>

        {/* Global Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setTerminalModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
          >
            <Terminal size={14} />
            <span>Open Terminal</span>
          </button>

          <button
            onClick={handleProbeSystem}
            disabled={probingSystem}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
          >
            <RotateCw size={13} className={probingSystem ? 'animate-spin text-brand-400' : ''} />
            <span>{probingSystem ? 'Probing...' : 'Probe Live Specs'}</span>
          </button>

          <button
            onClick={() => setConnectionModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors"
          >
            <Wifi size={13} className="text-emerald-400" />
            <span>SSH Config</span>
          </button>

          <button
            onClick={() => {
              setPendingAction('restart');
              setServiceActionName(undefined);
              setConfirmModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-950 hover:bg-rose-900 text-rose-300 border border-rose-800 rounded-lg text-xs font-medium transition-colors"
          >
            <Power size={13} />
            <span>Reboot Server</span>
          </button>
        </div>
      </div>

      {/* USAGE SPIKE ALERT BANNER (If Spikes Detected) */}
      {hasSpikes && (
        <div className="p-4 rounded-xl border border-rose-800 bg-rose-950/40 text-rose-200 space-y-2 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <AlertOctagon size={18} className="text-rose-400 animate-pulse shrink-0" />
              <span className="font-semibold text-sm text-white">
                Resource Usage Spike Detected ({spikes.length} active event{spikes.length > 1 ? 's' : ''})
              </span>
            </div>
            <button
              onClick={() => setActiveTab('performance')}
              className="text-xs font-medium underline hover:text-white"
            >
              Analyze Spikes in Detail &rarr;
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs pt-1">
            {spikes.slice(0, 2).map((s: any) => (
              <div key={s.id} className="p-2.5 rounded-lg bg-slate-950/80 border border-rose-900/60 flex items-center justify-between">
                <div>
                  <div className="font-mono font-semibold text-rose-300">
                    {s.metric} Spike: {s.current_value} (Threshold {s.threshold})
                  </div>
                  <div className="text-[11px] text-slate-300 mt-0.5">
                    Offender: <span className="font-mono text-white font-bold">{s.process_name}</span> (PID {s.pid}) • User {s.user}
                  </div>
                </div>
                <button
                  onClick={() => handleRunTroubleshoot('TOP_CPU')}
                  className="px-2 py-1 bg-rose-900/80 hover:bg-rose-800 text-rose-100 rounded text-[11px] font-medium"
                >
                  Investigate
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SCHEDULED REBOOT BANNER (If Active) */}
      {rebootStatus?.is_scheduled && (
        <div className="p-3.5 rounded-xl border border-amber-800/80 bg-amber-950/40 text-amber-200 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            <Clock size={16} className="text-amber-400 shrink-0" />
            <div>
              <span className="font-semibold text-white">Reboot Scheduled:</span>{' '}
              <span>{rebootStatus.description} (Reason: {rebootStatus.reason})</span>
              {rebootStatus.remaining_seconds > 0 && (
                <span className="ml-2 font-mono text-amber-300">
                  [{Math.floor(rebootStatus.remaining_seconds / 60)}m remaining]
                </span>
              )}
            </div>
          </div>
          <button
            onClick={handleCancelReboot}
            className="px-2.5 py-1 bg-amber-900 hover:bg-amber-800 text-white rounded font-medium text-xs transition-colors"
          >
            Cancel Reboot
          </button>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-800 gap-1 overflow-x-auto text-xs font-medium">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'overview'
              ? 'border-brand-500 text-white font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Activity size={14} />
          <span>Overview & Vitals</span>
        </button>

        <button
          onClick={() => setActiveTab('performance')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'performance'
              ? 'border-brand-500 text-white font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Zap size={14} className={hasSpikes ? 'text-rose-400' : ''} />
          <span>Performance & Spikes</span>
          {hasSpikes && (
            <span className="px-1.5 py-0.2 bg-rose-600 text-white text-[10px] rounded-full font-bold">
              {spikes.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('backups')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'backups'
              ? 'border-brand-500 text-white font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Database size={14} />
          <span>Backups (Web & DB)</span>
          <span className="text-[10px] text-slate-500 font-mono">({backups.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('troubleshoot')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'troubleshoot'
              ? 'border-brand-500 text-white font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders size={14} />
          <span>Troubleshoot & Terminal</span>
        </button>

        <button
          onClick={() => setActiveTab('reboots')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'reboots'
              ? 'border-brand-500 text-white font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Calendar size={14} />
          <span>Scheduled Reboots</span>
        </button>

        <button
          onClick={() => setActiveTab('websites')}
          className={`px-4 py-2.5 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
            activeTab === 'websites'
              ? 'border-brand-500 text-white font-semibold'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Globe size={14} />
          <span>Hosted Websites</span>
        </button>
      </div>

      {/* TAB 1: OVERVIEW & VITALS */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* 4 Hardware Gauges */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span className="flex items-center gap-1.5">
                  <Cpu size={14} className="text-brand-400" />
                  CPU Load
                </span>
                <span className="mono font-semibold text-white">{cpu}%</span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${
                    cpu > 90 ? 'bg-rose-500' : cpu > 80 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${Math.min(cpu, 100)}%` }}
                />
              </div>
              <div className="text-[11px] text-slate-500 mono flex justify-between">
                <span>{server.cpu_cores} Physical vCores</span>
                <span>Load 1m: {metric?.load_1m || 0.4}</span>
              </div>
            </div>

            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span className="flex items-center gap-1.5">
                  <Activity size={14} className="text-emerald-400" />
                  RAM Usage
                </span>
                <span className="mono font-semibold text-white">{ram}%</span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${
                    ram > 90 ? 'bg-rose-500' : ram > 80 ? 'bg-amber-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${Math.min(ram, 100)}%` }}
                />
              </div>
              <div className="text-[11px] text-slate-500 mono flex justify-between">
                <span>Total: {server.ram_total_mb} MB</span>
                <span>Used: {Math.round((server.ram_total_mb * ram) / 100)} MB</span>
              </div>
            </div>

            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span className="flex items-center gap-1.5">
                  <HardDrive size={14} className="text-purple-400" />
                  NVMe Disk
                </span>
                <span className="mono font-semibold text-white">{disk}%</span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${
                    disk > 90 ? 'bg-rose-500' : disk > 80 ? 'bg-amber-500' : 'bg-purple-500'
                  }`}
                  style={{ width: `${Math.min(disk, 100)}%` }}
                />
              </div>
              <div className="text-[11px] text-slate-500 mono flex justify-between">
                <span>Total: {server.disk_total_gb} GB</span>
                <span>Free: {Math.round(server.disk_total_gb * (1 - disk / 100))} GB</span>
              </div>
            </div>

            <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span className="flex items-center gap-1.5">
                  <Wifi size={14} className="text-sky-400" />
                  Network & Ports
                </span>
                <span className="mono font-semibold text-emerald-400">ONLINE</span>
              </div>
              <div className="flex items-center gap-1.5 pt-1">
                {(metric?.open_ports || [22, 80, 443]).map(p => (
                  <span key={p} className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-950 border border-slate-800 text-slate-300">
                    :{p}
                  </span>
                ))}
              </div>
              <div className="text-[11px] text-slate-500 mono flex justify-between pt-1">
                <span>Rx: {metric?.network_rx_kb || 512} KB/s</span>
                <span>Tx: {metric?.network_tx_kb || 420} KB/s</span>
              </div>
            </div>
          </div>

          {/* Grid: Hardware Specs & Top Processes */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Specs */}
            <div className="p-5 bg-slate-900/70 border border-slate-800 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <ServerIcon size={16} className="text-brand-400" />
                  Host Specs & Kernel
                </h3>
                <button
                  onClick={handleProbeSystem}
                  className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
                >
                  <RefreshCw size={12} className={probingSystem ? 'animate-spin' : ''} />
                  Refresh
                </button>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Hostname:</span>
                  <span className="font-mono text-slate-200">{server.hostname}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Operating System:</span>
                  <span className="font-mono text-slate-200">{server.os} {server.os_version}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Kernel Version:</span>
                  <span className="font-mono text-slate-200">{server.kernel}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Hosting Provider:</span>
                  <span className="font-mono text-slate-200">{server.provider}</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">vCPU Cores:</span>
                  <span className="font-mono text-slate-200">{server.cpu_cores} Cores</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Physical Memory:</span>
                  <span className="font-mono text-slate-200">{server.ram_total_mb} MB</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">NVMe Capacity:</span>
                  <span className="font-mono text-slate-200">{server.disk_total_gb} GB</span>
                </div>
                <div className="flex justify-between py-1.5 border-b border-slate-800/60">
                  <span className="text-slate-400">Public IPv4:</span>
                  <span className="font-mono text-slate-200">{server.public_ip}</span>
                </div>
                <div className="flex justify-between py-1.5">
                  <span className="text-slate-400">SSH User:</span>
                  <span className="font-mono text-slate-200">{server.ssh_user || 'root'}:{server.ssh_port || 22}</span>
                </div>
              </div>
            </div>

            {/* Right: Active System Daemons Table */}
            <div className="lg:col-span-2 p-5 bg-slate-900/70 border border-slate-800 rounded-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Activity size={16} className="text-emerald-400" />
                  <h3 className="text-sm font-semibold text-white">Active System Daemons & Top Processes</h3>
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-2.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Filter processes..."
                      value={processSearch}
                      onChange={(e) => setProcessSearch(e.target.value)}
                      className="pl-8 pr-3 py-1 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 w-44"
                    />
                  </div>
                  <button
                    onClick={loadProcesses}
                    disabled={processesLoading}
                    className="p-1.5 bg-slate-950 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-lg text-xs flex items-center gap-1 transition-colors disabled:opacity-50"
                    title="Live Process Probe"
                  >
                    <RefreshCw size={13} className={processesLoading ? 'animate-spin text-brand-400' : ''} />
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto max-h-96 overflow-y-auto rounded-lg border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] sticky top-0 z-10 border-b border-slate-800">
                    <tr>
                      <th className="py-2 px-3">PID</th>
                      <th className="py-2 px-3">Command / Daemon</th>
                      <th className="py-2 px-3">User</th>
                      <th className="py-2 px-3 text-right">CPU %</th>
                      <th className="py-2 px-3 text-right">RAM %</th>
                      <th className="py-2 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {processesLoading ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-500">
                          Probing top running daemons over SSH...
                        </td>
                      </tr>
                    ) : filteredProcesses.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-500">
                          No matching processes found
                        </td>
                      </tr>
                    ) : (
                      filteredProcesses.map((p, idx) => {
                        const isHighCpu = p.cpu > 40;
                        return (
                          <tr key={idx} className={`hover:bg-slate-800/40 ${isHighCpu ? 'bg-rose-950/20' : ''}`}>
                            <td className="py-2 px-3 text-slate-400">{p.pid}</td>
                            <td className="py-2 px-3 font-semibold text-slate-200">
                              <span className="max-w-[200px] truncate block" title={p.command}>
                                {p.command}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-400">{p.user}</td>
                            <td className={`py-2 px-3 text-right font-bold ${isHighCpu ? 'text-rose-400' : 'text-slate-300'}`}>
                              {p.cpu}%
                            </td>
                            <td className="py-2 px-3 text-right text-slate-400">{p.mem}%</td>
                            <td className="py-2 px-3 text-center">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                                {p.status || 'RUNNING'}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PERFORMANCE & SPIKES MONITOR */}
      {activeTab === 'performance' && (
        <div className="space-y-6">
          {/* Health Score & Bottlenecks */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2">
              <span className="text-xs text-slate-400 font-medium">System Health Grade</span>
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-extrabold text-white">
                  {performanceData?.health_score || 92}
                  <span className="text-sm font-normal text-slate-500">/100</span>
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                  performanceData?.health_grade === 'CRITICAL_PRESSURE'
                    ? 'bg-rose-950 text-rose-300 border border-rose-800'
                    : performanceData?.health_grade === 'ATTENTION_REQUIRED'
                    ? 'bg-amber-950 text-amber-300 border border-amber-800'
                    : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                }`}>
                  {performanceData?.health_grade || 'OPTIMAL'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Calculated from CPU core contention, memory pressure, and thread contention.
              </p>
            </div>

            <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2">
              <span className="text-xs text-slate-400 font-medium">Identified Primary Bottleneck</span>
              <div className="text-base font-bold text-white flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-400" />
                <span>{performanceData?.bottleneck || 'None (Normal Operations)'}</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Dynamic advisory engine evaluated against hardware specifications.
              </p>
            </div>

            <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-2">
              <span className="text-xs text-slate-400 font-medium">Active Spikes Count</span>
              <div className="text-3xl font-extrabold text-white flex items-baseline gap-2">
                <span>{spikes.length}</span>
                <span className="text-xs font-normal text-slate-500">detected event{spikes.length === 1 ? '' : 's'}</span>
              </div>
              <p className="text-[11px] text-slate-400">
                Spikes are triggered when process CPU &gt;40% or memory &gt;80%.
              </p>
            </div>
          </div>

          {/* Historical Telemetry Chart */}
          <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Telemetry & Utilization Curves (Recent Activity)</h3>
                <p className="text-xs text-slate-400">CPU%, RAM%, and Disk saturation timelines</p>
              </div>
              <button
                onClick={loadMetricsHistory}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
              >
                <RefreshCw size={12} />
                Refresh Chart
              </button>
            </div>

            <div className="h-64 w-full">
              {metricsHistory.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={metricsHistory}>
                    <defs>
                      <linearGradient id="cpuGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="ramGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="timestamp"
                      stroke="#64748b"
                      fontSize={10}
                      tickFormatter={(t) => (t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '')}
                    />
                    <YAxis stroke="#64748b" fontSize={10} domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', fontSize: '11px' }}
                    />
                    <Area type="monotone" dataKey="cpu_percent" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#cpuGradient)" name="CPU %" />
                    <Area type="monotone" dataKey="ram_percent" stroke="#10b981" strokeWidth={2} fillOpacity={1} fill="url(#ramGradient)" name="RAM %" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-xs text-slate-500 font-mono">
                  Collecting real-time metrics telemetry...
                </div>
              )}
            </div>
          </div>

          {/* Spikes Log & Insights */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Spikes List */}
            <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <AlertOctagon size={16} className="text-rose-400" />
                Spikes Detection Log
              </h3>
              {spikes.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500 space-y-1">
                  <CheckCircle2 size={24} className="text-emerald-400 mx-auto" />
                  <p className="font-semibold text-slate-300 pt-2">No Abnormal Spikes Detected</p>
                  <p>All running daemons are within safe operating parameters.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {spikes.map((s: any) => (
                    <div key={s.id} className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-white flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                          {s.metric} Spike: {s.current_value}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          s.severity === 'CRITICAL' ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-amber-950 text-amber-300 border border-amber-800'
                        }`}>
                          {s.severity}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300">
                        {s.recommendation}
                      </p>
                      <div className="flex items-center justify-between pt-1 text-[11px] text-slate-500 mono">
                        <span>Process: {s.process_name} (PID {s.pid})</span>
                        <button
                          onClick={() => handleRunTroubleshoot('TOP_CPU')}
                          className="text-brand-400 hover:text-brand-300 font-medium"
                        >
                          Run Trace &rarr;
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Hardware Bottleneck & Category Health */}
            <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Sliders size={16} className="text-brand-400" />
                Category Health Diagnostics
              </h3>
              <div className="space-y-3">
                {(performanceData?.insights || []).map((ins: any, idx: number) => (
                  <div key={idx} className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-white">{ins.category}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                        ins.status === 'Healthy'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : 'bg-amber-950 text-amber-400 border border-amber-800'
                      }`}>
                        {ins.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">{ins.details}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: BACKUPS (WEB & DATABASE) */}
      {activeTab === 'backups' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Web Server & Apache/Nginx Configs Backup Card */}
            <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
              <div className="flex items-center gap-2.5">
                <Globe size={18} className="text-brand-400" />
                <div>
                  <h3 className="text-sm font-semibold text-white">Web Server & VirtualHost Config Backups</h3>
                  <p className="text-xs text-slate-400">Archive Apache2, Nginx, SSL certificates, and web roots</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  onClick={() => handleWebBackup('APACHE')}
                  disabled={Boolean(backingUpWeb)}
                  className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-brand-500 rounded-lg text-left transition-all disabled:opacity-50 space-y-1"
                >
                  <div className="text-xs font-semibold text-white flex items-center justify-between">
                    <span>Apache Configs</span>
                    {backingUpWeb === 'APACHE' && <RotateCw size={12} className="animate-spin text-brand-400" />}
                  </div>
                  <p className="text-[11px] text-slate-400">/etc/apache2 & /etc/httpd</p>
                </button>

                <button
                  onClick={() => handleWebBackup('NGINX')}
                  disabled={Boolean(backingUpWeb)}
                  className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-brand-500 rounded-lg text-left transition-all disabled:opacity-50 space-y-1"
                >
                  <div className="text-xs font-semibold text-white flex items-center justify-between">
                    <span>Nginx Configs</span>
                    {backingUpWeb === 'NGINX' && <RotateCw size={12} className="animate-spin text-brand-400" />}
                  </div>
                  <p className="text-[11px] text-slate-400">/etc/nginx & sites-enabled</p>
                </button>

                <button
                  onClick={() => handleWebBackup('WEB_ROOT')}
                  disabled={Boolean(backingUpWeb)}
                  className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-brand-500 rounded-lg text-left transition-all disabled:opacity-50 space-y-1"
                >
                  <div className="text-xs font-semibold text-white flex items-center justify-between">
                    <span>Web Root Files</span>
                    {backingUpWeb === 'WEB_ROOT' && <RotateCw size={12} className="animate-spin text-brand-400" />}
                  </div>
                  <p className="text-[11px] text-slate-400">/var/www applications</p>
                </button>

                <button
                  onClick={() => handleWebBackup('WEB_STACK')}
                  disabled={Boolean(backingUpWeb)}
                  className="p-3 bg-slate-950 hover:bg-slate-800 border border-brand-500/60 rounded-lg text-left transition-all disabled:opacity-50 space-y-1"
                >
                  <div className="text-xs font-semibold text-brand-300 flex items-center justify-between">
                    <span>Full Web Stack</span>
                    {backingUpWeb === 'WEB_STACK' && <RotateCw size={12} className="animate-spin text-brand-400" />}
                  </div>
                  <p className="text-[11px] text-slate-400">Nginx + Apache + SSL + www</p>
                </button>
              </div>

              <div className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-1">
                <CheckCircle2 size={12} className="text-emerald-400" />
                <span>Archives are compressed in tar.gz format with verified SHA-256 checksums.</span>
              </div>
            </div>

            {/* Database Backup Card */}
            <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
              <div className="flex items-center gap-2.5">
                <Database size={18} className="text-emerald-400" />
                <div>
                  <h3 className="text-sm font-semibold text-white">Database Snapshot Engine</h3>
                  <p className="text-xs text-slate-400">Automated SQL dumps for PostgreSQL, MySQL, SQLite, MongoDB</p>
                </div>
              </div>

              <form onSubmit={handleDbBackup} className="space-y-3 text-xs pt-1">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">Database Engine</label>
                    <select
                      value={dbType}
                      onChange={(e) => setDbType(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-brand-500"
                    >
                      <option value="POSTGRESQL">PostgreSQL (pg_dump)</option>
                      <option value="MYSQL">MySQL / MariaDB (mysqldump)</option>
                      <option value="SQLITE">SQLite (.backup)</option>
                      <option value="MONGODB">MongoDB (mongodump)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1">Database Name</label>
                    <input
                      type="text"
                      value={dbName}
                      onChange={(e) => setDbName(e.target.value)}
                      required
                      placeholder="e.g. app_production"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-brand-500 mono"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <div className="text-slate-400">
                    <span>Retention: </span>
                    <select
                      value={retentionDays}
                      onChange={(e) => setRetentionDays(Number(e.target.value))}
                      className="bg-slate-950 border border-slate-800 text-white rounded px-2 py-1 ml-1"
                    >
                      <option value={7}>7 Days</option>
                      <option value={14}>14 Days</option>
                      <option value={30}>30 Days</option>
                      <option value={90}>90 Days</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={backingUpDb}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold transition-colors disabled:opacity-50"
                  >
                    <Play size={13} />
                    <span>{backingUpDb ? 'Dumping DB...' : 'Generate DB Snapshot'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Backups Archives History Table */}
          <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Backup Archives for {server.name}</h3>
                <p className="text-xs text-slate-400">Directly download or restore config snapshots and database dumps</p>
              </div>
              <button
                onClick={loadBackups}
                className="text-xs text-slate-400 hover:text-white flex items-center gap-1"
              >
                <RefreshCw size={12} className={backupsLoading ? 'animate-spin' : ''} />
                Refresh List
              </button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-800">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 font-mono text-[11px] border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Filename</th>
                    <th className="py-2.5 px-3">Type</th>
                    <th className="py-2.5 px-3">Size</th>
                    <th className="py-2.5 px-3">Created</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {backupsLoading ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">Loading backup archives...</td>
                    </tr>
                  ) : backups.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">
                        No backups recorded yet for this server. Trigger a web config or DB backup above.
                      </td>
                    </tr>
                  ) : (
                    backups.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-800/40">
                        <td className="py-2.5 px-3 font-semibold text-white flex items-center gap-2">
                          <FileText size={14} className="text-brand-400 shrink-0" />
                          <span className="truncate max-w-xs">{b.filename}</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-300">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-950 border border-slate-800">
                            {b.database_type || 'SNAPSHOT'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">{b.file_size_mb} MB</td>
                        <td className="py-2.5 px-3 text-slate-400">
                          {new Date(b.created_at).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                            {b.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => api.downloadBackup(b.id, b.filename)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-brand-900/60 hover:bg-brand-800 text-brand-200 rounded text-xs transition-colors"
                          >
                            <Download size={12} />
                            <span>Download</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: TROUBLESHOOT & TERMINAL */}
      {activeTab === 'troubleshoot' && (
        <div className="space-y-6">
          {/* Preset Diagnostic Commands Grid */}
          <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-white">1-Click Diagnostic & Troubleshooting Commands</h3>
              <p className="text-xs text-slate-400">Run system commands on {server.name} and review output instantly</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(performanceData?.preset_commands || [
                { key: 'TOP_CPU', title: 'Top CPU Hogs', command: 'ps aux --sort=-%cpu | head -15', desc: 'Highest CPU percentage processes' },
                { key: 'TOP_MEM', title: 'Top Memory Hogs', command: 'ps aux --sort=-%mem | head -15', desc: 'Highest physical RAM consumers' },
                { key: 'DISK_HOGS', title: 'Disk Bloat Inspection', command: 'du -sh /var/log/* /var/lib/docker/*', desc: 'Check log and Docker storage consumption' },
                { key: 'DROP_CACHES', title: 'Drop Page Caches', command: 'sync && echo 3 > /proc/sys/vm/drop_caches', desc: 'Free inactive buffer/cache RAM safely' },
                { key: 'DOCKER_PRUNE', title: 'Prune Docker Bloat', command: 'docker system prune -f', desc: 'Reclaim dangling layers and build caches' },
                { key: 'LISTENING_PORTS', title: 'Open Listening Ports', command: 'ss -tulpn', desc: 'Inspect listening TCP/UDP sockets' },
                { key: 'FAILED_UNITS', title: 'Failed Systemd Units', command: 'systemctl --failed', desc: 'Locate crashed background services' },
                { key: 'JOURNAL_ERRORS', title: 'Journal Error Logs', command: 'journalctl -p 3 -xb -n 40', desc: 'Kernel and daemon critical errors' },
                { key: 'TEST_NGINX', title: 'Test & Reload Nginx', command: 'nginx -t && systemctl reload nginx', desc: 'Validate syntax and reload Nginx' },
                { key: 'TEST_APACHE', title: 'Test & Reload Apache2', command: 'apache2ctl configtest && systemctl reload apache2', desc: 'Check vhost syntax and reload Apache' },
                { key: 'ZOMBIE_PROCS', title: 'Scan Zombie PIDs', command: 'ps aux | awk "$8 ~ /^[Zz]/"', desc: 'Identify defuncted zombie processes' },
                { key: 'MEM_INFO', title: 'Memory & VM Stats', command: 'free -h && vmstat 1 3', desc: 'Swap and virtual memory allocation' }
              ]).map((cmd: any) => (
                <div
                  key={cmd.key}
                  className="p-3.5 bg-slate-950 border border-slate-800 hover:border-brand-500/60 rounded-xl space-y-2 transition-all flex flex-col justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-white">{cmd.title}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{cmd.key}</span>
                    </div>
                    <p className="text-[11px] text-slate-400">{cmd.desc}</p>
                    <div className="font-mono text-[10px] text-slate-500 truncate bg-slate-900/60 p-1 rounded">
                      {cmd.command}
                    </div>
                  </div>

                  <button
                    onClick={() => handleRunTroubleshoot(cmd.key)}
                    disabled={troubleshootRunning === cmd.key}
                    className="w-full mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-brand-600/80 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
                  >
                    <Play size={12} />
                    <span>{troubleshootRunning === cmd.key ? 'Executing...' : 'Run Diagnostics'}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Interactive Custom Command Runner & Output Viewer */}
          <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Terminal size={16} className="text-brand-400" />
                Live Command Console
              </h3>
              {terminalOutput && (
                <span className="text-xs text-slate-400 font-mono">
                  Exit: {terminalOutput.exit_code} • Duration: {terminalOutput.duration_ms}ms
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={customCommand}
                onChange={(e) => setCustomCommand(e.target.value)}
                placeholder="Enter custom command (e.g. uptime, df -h, docker ps)..."
                className="flex-1 px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white font-mono focus:outline-none focus:border-brand-500"
              />
              <button
                onClick={() => handleRunTroubleshoot('CUSTOM', customCommand)}
                disabled={troubleshootRunning === 'CUSTOM'}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <Play size={13} />
                <span>Execute</span>
              </button>
            </div>

            {/* Output Box */}
            {terminalOutput && (
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-slate-200 space-y-2">
                <div className="flex items-center justify-between text-slate-500 border-b border-slate-800/80 pb-2">
                  <span>$ {terminalOutput.command}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(terminalOutput.stdout || terminalOutput.stderr);
                      showToast('Output copied to clipboard', 'info');
                    }}
                    className="hover:text-white flex items-center gap-1 text-[11px]"
                  >
                    <Copy size={11} /> Copy
                  </button>
                </div>
                <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap leading-relaxed text-slate-300">
                  {terminalOutput.stdout || terminalOutput.stderr || '(No output returned)'}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: SCHEDULED REBOOTS & MAINTENANCE */}
      {activeTab === 'reboots' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Scheduled Reboot Form */}
            <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
              <div className="flex items-center gap-2.5">
                <Calendar size={18} className="text-brand-400" />
                <div>
                  <h3 className="text-sm font-semibold text-white">Schedule Server Reboot</h3>
                  <p className="text-xs text-slate-400">Schedule one-time delayed or recurring maintenance reboots</p>
                </div>
              </div>

              <form onSubmit={handleScheduleReboot} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-400 mb-1">Reboot Delay</label>
                  <select
                    value={rebootDelay}
                    onChange={(e) => setRebootDelay(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value={5}>In 5 Minutes</option>
                    <option value={15}>In 15 Minutes (Default)</option>
                    <option value={30}>In 30 Minutes</option>
                    <option value={60}>In 1 Hour</option>
                    <option value={120}>In 2 Hours</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Recurrence Schedule</label>
                  <select
                    value={rebootRecurring}
                    onChange={(e) => setRebootRecurring(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-brand-500"
                  >
                    <option value="NONE">One-Time Delayed Reboot Only</option>
                    <option value="DAILY">Daily at 04:00 AM UTC</option>
                    <option value="WEEKLY_SUNDAY">Weekly on Sunday at 03:00 AM UTC</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-400 mb-1">Reason / Notice to Users</label>
                  <input
                    type="text"
                    value={rebootReason}
                    onChange={(e) => setRebootReason(e.target.value)}
                    required
                    placeholder="e.g. Kernel security upgrade"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-brand-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={schedulingReboot}
                  className="w-full py-2.5 bg-brand-600 hover:bg-brand-500 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <Clock size={14} />
                  <span>{schedulingReboot ? 'Scheduling...' : 'Set Scheduled Reboot'}</span>
                </button>
              </form>
            </div>

            {/* Service Restart Hub */}
            <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-white">System Service Fast Restart</h3>
                <p className="text-xs text-slate-400">Restart key daemons on {server.name} without whole-host reboots</p>
              </div>

              <div className="space-y-2.5">
                {[
                  { name: 'Docker Engine', service: 'docker', desc: 'Daemon managing containers and volumes' },
                  { name: 'Nginx Web Server', service: 'nginx', desc: 'Reverse proxy and TLS termination' },
                  { name: 'Apache2 Web Server', service: 'apache2', desc: 'VirtualHost HTTP server' },
                  { name: 'PostgreSQL Database', service: 'postgresql', desc: 'Relational database cluster' },
                  { name: 'MySQL Database', service: 'mysql', desc: 'MariaDB / MySQL engine' }
                ].map((s) => (
                  <div key={s.service} className="p-3 bg-slate-950 border border-slate-800 rounded-lg flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-white">{s.name}</div>
                      <div className="text-[11px] text-slate-400">{s.desc}</div>
                    </div>
                    <button
                      onClick={() => {
                        setPendingAction('service_restart');
                        setServiceActionName(s.service);
                        setConfirmModalOpen(true);
                      }}
                      className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 rounded-lg font-medium transition-colors flex items-center gap-1"
                    >
                      <RotateCw size={12} />
                      <span>Restart</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: HOSTED WEBSITES & VIRTUALHOSTS */}
      {activeTab === 'websites' && (
        <div className="space-y-6">
          <div className="p-5 bg-slate-900/80 border border-slate-800 rounded-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-white">Discovered Websites & Web Containers</h3>
                <p className="text-xs text-slate-400">
                  Scanned from /etc/apache2/sites-enabled, /etc/nginx/sites-enabled, and Docker
                </p>
              </div>

              <button
                onClick={handleScanWebsites}
                disabled={scanningWebsites}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
              >
                <RefreshCw size={13} className={scanningWebsites ? 'animate-spin' : ''} />
                <span>{scanningWebsites ? 'Scanning VPS...' : 'Scan & Auto-Import Websites'}</span>
              </button>
            </div>

            {scanNotice && (
              <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 size={15} />
                <span>{scanNotice}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
              {websites.length === 0 ? (
                <div className="col-span-full py-16 text-center text-slate-500 text-xs space-y-2">
                  <Globe size={28} className="mx-auto text-slate-600" />
                  <p className="text-slate-400 font-semibold">No Websites Scanned Yet</p>
                  <p>Click "Scan & Auto-Import Websites" to discover Apache, Nginx, and Docker apps on this server.</p>
                </div>
              ) : (
                websites.map((w, idx) => (
                  <div key={idx} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-white truncate max-w-[180px]">{w.name}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-brand-950 text-brand-300 border border-brand-800">
                        {w.web_server}
                      </span>
                    </div>

                    <div className="text-xs text-slate-400 space-y-1 mono">
                      <div>Domain: <span className="text-slate-200">{w.domain}</span></div>
                      <div>Port: <span className="text-emerald-400">:{w.port}</span></div>
                      <div>SSL: <span className={w.ssl_enabled ? 'text-emerald-400' : 'text-slate-500'}>{w.ssl_enabled ? 'Active TLS' : 'Plain HTTP'}</span></div>
                    </div>

                    <div className="pt-2 border-t border-slate-800/80 flex justify-between items-center text-xs">
                      <span className="text-[11px] text-slate-500">{w.framework}</span>
                      {onNavigate && (
                        <button
                          onClick={() => onNavigate('applications')}
                          className="text-brand-400 hover:text-brand-300 flex items-center gap-1 text-[11px] font-medium"
                        >
                          View in Apps <ExternalLink size={10} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Global Modals */}
      <ServerTerminalModal
        isOpen={terminalModalOpen}
        onClose={() => setTerminalModalOpen(false)}
        server={server}
      />

      <ServerConnectionModal
        isOpen={connectionModalOpen}
        onClose={() => setConnectionModalOpen(false)}
        server={server}
        onUpdated={(updated) => {
          setServer(updated);
          loadServerData();
        }}
      />

      <ConfirmationModal
        isOpen={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        onConfirm={handleConfirmCommand}
        title={serviceActionName ? `Restart Service: ${serviceActionName}` : `Reboot Server: ${server.name}`}
        message={
          serviceActionName
            ? `Are you sure you want to restart '${serviceActionName}' on ${server.name}?`
            : `Are you sure you want to REBOOT server node '${server.name}' (${server.public_ip})? All running services and network connections will temporarily drop.`
        }
        confirmKeyword={serviceActionName ? 'RESTART' : 'REBOOT'}
        confirmButtonText={serviceActionName ? 'Restart Service' : 'Reboot Server Node'}
        isDestructive={true}
      />
    </div>
  );
};
